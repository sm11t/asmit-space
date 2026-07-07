/* Firestore data layer for ReadIt2Me.
 *
 * Schema (owner-only, see firestore.rules):
 *   users/{uid}                          settings + queue
 *   users/{uid}/books/{bookId}           book metadata
 *   users/{uid}/books/{bookId}/pages/{n} page text + audio ref + timings ("0001"…)
 *   users/{uid}/progress/{bookId}        playback position (written often → own doc)
 */

import { db, fs, auth, storage, st } from './firebase.js';

const PROGRESS_WRITE_INTERVAL_MS = 15000;

export function pageId(n) {
  return String(n).padStart(4, '0');
}

function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in yet');
  return u.uid;
}

const userDoc     = () => fs.doc(db, 'users', uid());
const bookDoc     = (bookId) => fs.doc(db, 'users', uid(), 'books', bookId);
const pageDoc     = (bookId, n) => fs.doc(db, 'users', uid(), 'books', bookId, 'pages', pageId(n));
const progressDoc = (bookId) => fs.doc(db, 'users', uid(), 'progress', bookId);

/* ── Settings ────────────────────────────────────────────────────────────── */

export async function getSettings() {
  const snap = await fs.getDoc(userDoc());
  return {
    voice: 'Sulafat',
    speed: 1,
    sleepDefault: 15,
    nudgeDismissed: false,
    ...(snap.exists() ? snap.data() : {}),
  };
}

export function saveSettings(patch) {
  return fs.setDoc(userDoc(), { ...patch, updatedAt: fs.serverTimestamp() }, { merge: true });
}

/* ── Books ───────────────────────────────────────────────────────────────── */

export async function createBook(title) {
  const ref = fs.doc(fs.collection(db, 'users', uid(), 'books'));
  await fs.setDoc(ref, {
    title: title || 'Untitled book',
    pageCount: 0,
    status: 'capturing',
    ttsVoice: null,
    styleHint: null,
    createdAt: fs.serverTimestamp(),
    updatedAt: fs.serverTimestamp(),
  });
  return ref.id;
}

export function updateBook(bookId, patch) {
  return fs.setDoc(bookDoc(bookId), { ...patch, updatedAt: fs.serverTimestamp() }, { merge: true });
}

export async function getBook(bookId) {
  const snap = await fs.getDoc(bookDoc(bookId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/* Live list of books, newest first. Returns unsubscribe. */
export function onBooks(cb) {
  const q = fs.query(
    fs.collection(db, 'users', uid(), 'books'),
    fs.orderBy('createdAt', 'desc'),
  );
  return fs.onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (err) => console.error('[store] books listener', err));
}

export async function deleteBook(bookId, pageCount) {
  // Best-effort cleanup of narrated audio in Storage first.
  try {
    const pages = await getPages(bookId);
    await Promise.allSettled(
      pages
        .filter((p) => p.audio && p.audio.path)
        .map((p) => st.deleteObject(st.ref(storage, p.audio.path))),
    );
  } catch (err) {
    console.warn('[store] audio cleanup failed', err);
  }
  // Firestore has no recursive client delete — remove pages in batches.
  const batchLimit = 400;
  let batch = fs.writeBatch(db);
  let inBatch = 0;
  for (let n = 1; n <= (pageCount || 0); n++) {
    batch.delete(pageDoc(bookId, n));
    if (++inBatch === batchLimit) {
      await batch.commit();
      batch = fs.writeBatch(db);
      inBatch = 0;
    }
  }
  batch.delete(progressDoc(bookId));
  batch.delete(bookDoc(bookId));
  await batch.commit();
}

/* ── Pages ───────────────────────────────────────────────────────────────── */

export function savePage(bookId, n, data) {
  return fs.setDoc(pageDoc(bookId, n), {
    text: data.text,
    charCount: data.text.length,
    audio: data.audio || null,
    timings: data.timings || null,
  }, { merge: true });
}

export async function getPage(bookId, n) {
  const snap = await fs.getDoc(pageDoc(bookId, n));
  return snap.exists() ? snap.data() : null;
}

export async function getPages(bookId) {
  const q = fs.query(
    fs.collection(db, 'users', uid(), 'books', bookId, 'pages'),
    fs.orderBy(fs.documentId()),
  );
  const snap = await fs.getDocs(q);
  return snap.docs.map((d) => ({ n: parseInt(d.id, 10), ...d.data() }));
}

/* ── Progress (throttled) ────────────────────────────────────────────────── */

const deviceId = (() => {
  try {
    let id = localStorage.getItem('r2m_device');
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      localStorage.setItem('r2m_device', id);
    }
    return id;
  } catch { return 'unknown'; }
})();

let lastProgressWrite = 0;
let pendingProgress = null;

function writeProgress(bookId, pageNo, offsetSec) {
  lastProgressWrite = Date.now();
  pendingProgress = null;
  return fs.setDoc(progressDoc(bookId), {
    pageNo,
    offsetSec: Math.max(0, Math.round(offsetSec * 10) / 10),
    updatedAt: fs.serverTimestamp(),
    deviceId,
  }).catch((err) => console.error('[store] progress write', err));
}

/* Call freely (every timeupdate); writes at most every 15s. */
export function reportProgress(bookId, pageNo, offsetSec) {
  pendingProgress = { bookId, pageNo, offsetSec };
  if (Date.now() - lastProgressWrite >= PROGRESS_WRITE_INTERVAL_MS) {
    writeProgress(bookId, pageNo, offsetSec);
  }
}

/* Call on pause / page change / navigate away — writes immediately. */
export function flushProgress() {
  if (pendingProgress) {
    const { bookId, pageNo, offsetSec } = pendingProgress;
    writeProgress(bookId, pageNo, offsetSec);
  }
}

export async function getProgress(bookId) {
  const snap = await fs.getDoc(progressDoc(bookId));
  return snap.exists() ? snap.data() : null;
}

/* Most recently updated progress doc across all books → resume card. */
export async function getLastProgress() {
  const q = fs.query(
    fs.collection(db, 'users', uid(), 'progress'),
    fs.orderBy('updatedAt', 'desc'),
    fs.limit(1),
  );
  const snap = await fs.getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { bookId: d.id, ...d.data() };
}

/* ── Account-merge (anonymous → existing Google user) ────────────────────── */

/* Copies everything under users/{fromUid} to users/{toUid}. Runs while signed
 * in as toUid, so reads on fromUid's docs are done first… but rules block
 * cross-uid reads. Instead this must run BEFORE the sign-in switch: caller
 * passes a snapshot taken while still anonymous. */
export async function snapshotUserData() {
  const settings = await getSettings();
  const booksSnap = await fs.getDocs(fs.collection(db, 'users', uid(), 'books'));
  const books = [];
  for (const b of booksSnap.docs) {
    const pagesSnap = await fs.getDocs(fs.collection(db, 'users', uid(), 'books', b.id, 'pages'));
    const prog = await getProgress(b.id);
    books.push({
      id: b.id,
      data: b.data(),
      pages: pagesSnap.docs.map((p) => ({ id: p.id, data: p.data() })),
      progress: prog,
    });
  }
  return { settings, books };
}

export async function restoreUserData(snapshot) {
  const u = uid();
  await fs.setDoc(fs.doc(db, 'users', u), snapshot.settings, { merge: true });
  for (const b of snapshot.books) {
    await fs.setDoc(fs.doc(db, 'users', u, 'books', b.id), b.data, { merge: true });
    for (const p of b.pages) {
      // Audio lives in Storage under the OLD uid's path, unreadable after the
      // merge — drop the ref so it regenerates on demand. Text survives.
      await fs.setDoc(fs.doc(db, 'users', u, 'books', b.id, 'pages', p.id),
        { ...p.data, audio: null });
    }
    if (b.progress) {
      await fs.setDoc(fs.doc(db, 'users', u, 'progress', b.id), b.progress);
    }
  }
}
