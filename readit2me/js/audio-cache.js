/* IndexedDB blob cache for narrated page audio.
 *
 * Audio plays from object URLs of locally cached blobs — this sidesteps the
 * service-worker Range-request problem entirely and makes offline listening
 * work. Keyed by storagePath, versioned by generatedAt (a re-narration with a
 * new voice changes generatedAt and invalidates the entry).
 */

import { storage, st } from './firebase.js';

const DB_NAME = 'readit2me-audio';
const STORE = 'audio';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idb(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        // Resolve the request's result (undefined on a get-miss) — never the
        // IDBRequest object itself.
        tx.oncomplete = () => resolve(req instanceof IDBRequest ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

async function getLocal(path) {
  try {
    return await idb('readonly', (store) => store.get(path));
  } catch { return null; }
}

async function putLocal(path, entry) {
  try {
    await idb('readwrite', (store) => store.put(entry, path));
  } catch (err) {
    console.warn('[audio-cache] IndexedDB write failed', err);
  }
}

export async function removeLocal(path) {
  try { await idb('readwrite', (store) => store.delete(path)); } catch {}
}

/* Get a playable Blob for a page's audio: IndexedDB first, else download from
 * Cloud Storage and cache. `audio` is the page doc's audio object. */
export async function getAudioBlob(audio) {
  const cached = await getLocal(audio.path);
  if (cached && cached.generatedAt === audio.generatedAt) {
    return cached.blob;
  }
  const blob = await st.getBlob(st.ref(storage, audio.path));
  putLocal(audio.path, { blob, generatedAt: audio.generatedAt, size: blob.size });
  return blob;
}

export async function isDownloaded(audio) {
  const cached = await getLocal(audio.path);
  return !!cached && cached.generatedAt === audio.generatedAt;
}

/* Ask the browser not to evict us, and report usage. */
export async function persistStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch {}
}

export async function storageUsage() {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch { return null; }
}
