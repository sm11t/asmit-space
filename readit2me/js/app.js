/* App orchestrator: view routing, auth gate, the capture→transcript flow,
 * account linking, mini player, offline banner, SW registration. */

import { userReady, isLinked, linkGoogle } from './firebase.js';
import * as store from './store.js';
import { initCapture, getShots, resetCapture } from './capture.js';
import { transcribeAll } from './ocr.js';
import { joinBoundary } from './stitch.js';
import { initLibrary, showLibrary, hideLibrary } from './library.js';
import { initPlayer, openBook, togglePlay, toast } from './player.js';

const VIEWS = ['library', 'capture', 'processing', 'player'];
let currentView = 'library';
let currentBook = null;

const $ = (id) => document.getElementById(id);

/* ── View routing ────────────────────────────────────────────────────────── */

function show(view, title) {
  currentView = view;
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  $('btn-back').hidden = view === 'library';
  $('topbar-title').textContent = title || 'ReadIt2Me';
  $('player-controls').hidden = view !== 'player';
  $('miniplayer').hidden = view === 'player' || !playerState.book;
  if (view === 'library') showLibrary(); else hideLibrary();
  window.scrollTo(0, 0);
}

$('btn-back').addEventListener('click', () => show('library'));

/* ── Player wiring ───────────────────────────────────────────────────────── */

let playerState = { book: null };

function onPlayerState(s) {
  playerState = s;
  const mini = $('miniplayer');
  if (!s.book) { mini.hidden = true; return; }
  mini.hidden = currentView === 'player';
  $('mini-title').textContent = s.book.title;
  $('mini-sub').textContent = s.status || `Page ${s.pageNo} of ${s.pageCount}`;
  $('mini-play').innerHTML = s.playing ? '&#10073;&#10073;' : '&#9654;';
  $('mini-progress').style.width = `${Math.round((s.position || 0) * 100)}%`;
}

$('mini-play').addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
$('mini-open').addEventListener('click', () => {
  if (playerState.book) show('player', playerState.book.title);
});

async function handleOpenBook(book, { resume = true, autoplay = false } = {}) {
  currentBook = book;
  show('player', book.title);
  try {
    await openBook(book, { resume });
    if (autoplay) togglePlay();
  } catch (err) {
    console.error('[app] open book failed', err);
    toast('Could not open this book — try again.');
    show('library');
  }
}

/* ── Capture → transcript flow ───────────────────────────────────────────── */

$('btn-new-book').addEventListener('click', () => {
  resetCapture();
  $('capture-title').value = '';
  $('btn-process').disabled = true;
  show('capture', 'New book');
});

initCapture((count) => {
  $('btn-process').disabled = count === 0;
});

$('btn-process').addEventListener('click', async () => {
  const shots = getShots();
  if (!shots.length) return;
  const title = $('capture-title').value.trim() || 'Untitled book';

  show('processing', title);
  const list = $('processing-list');
  list.innerHTML = '';
  const rows = shots.map((_, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="pno">${i + 1}</span><span class="pstate">Waiting…</span>`;
    list.appendChild(li);
    return li.querySelector('.pstate');
  });
  $('btn-open-book').hidden = true;

  let bookId;
  try {
    bookId = await store.createBook(title);
    await store.updateBook(bookId, { status: 'processing' });
  } catch (err) {
    console.error('[app] create book failed', err);
    toast('Could not create the book — check your connection.');
    show('capture', 'New book');
    return;
  }

  const texts = await transcribeAll(shots, (i, s, payload) => {
    if (s === 'working') { rows[i].textContent = 'Reading…'; rows[i].className = 'pstate'; rows[i].insertAdjacentHTML('beforeend', ' <span class="spin"></span>'); }
    if (s === 'done') { rows[i].textContent = summarize(payload); rows[i].className = 'pstate done'; }
    if (s === 'error') { rows[i].textContent = payload; rows[i].className = 'pstate error'; }
  });

  // Stitch across page boundaries (de-hyphenate, merge cut-off paragraphs),
  // then persist. Failed pages become a readable placeholder the user can
  // retake later rather than silently vanishing.
  const finalTexts = [];
  for (let i = 0; i < texts.length; i++) {
    finalTexts.push(texts[i] || '*This page could not be read — retake the photo.*');
  }
  for (let i = 0; i < finalTexts.length - 1; i++) {
    if (!texts[i] || !texts[i + 1]) continue;
    const { prev, next } = joinBoundary(finalTexts[i], finalTexts[i + 1]);
    finalTexts[i] = prev;
    finalTexts[i + 1] = next;
  }

  try {
    for (let i = 0; i < finalTexts.length; i++) {
      await store.savePage(bookId, i + 1, { text: finalTexts[i] });
    }
    await store.updateBook(bookId, { status: 'ready', pageCount: finalTexts.length });
  } catch (err) {
    console.error('[app] saving pages failed', err);
    toast('Could not save the transcript.');
    return;
  }

  resetCapture();
  maybeShowLinkNudge();
  const btn = $('btn-open-book');
  btn.hidden = false;
  btn.onclick = async () => {
    const book = await store.getBook(bookId);
    handleOpenBook(book, { resume: false, autoplay: true });
  };
});

function summarize(text) {
  const words = text.split(/\s+/).length;
  return `${words} words`;
}

/* ── Account linking ─────────────────────────────────────────────────────── */

async function doLinkGoogle() {
  try {
    let snapshot = null;
    const { merged } = await linkGoogle(async () => {
      // The Google account already owns a user: linkGoogle invokes this while
      // we are STILL the anonymous user, before the sign-in switch.
      snapshot = await store.snapshotUserData();
    });
    if (merged && snapshot) {
      await store.restoreUserData(snapshot);
    }
    $('link-nudge').hidden = true;
    updateAccountGlyph();
    toast(merged ? 'Signed in — your books were merged.' : 'Library linked to your Google account.');
    if (currentView === 'library') showLibrary();
  } catch (err) {
    if (err && err.code === 'auth/popup-closed-by-user') return;
    console.error('[app] link failed', err);
    toast('Linking failed — try again.');
  }
}

function maybeShowLinkNudge() {
  if (isLinked()) return;
  try { if (localStorage.getItem('r2m_nudge_dismissed') === '1') return; } catch {}
  $('link-nudge').hidden = false;
}

$('btn-link-google').addEventListener('click', doLinkGoogle);
$('btn-account').addEventListener('click', () => {
  if (isLinked()) toast('Signed in with Google — your library is safe.');
  else doLinkGoogle();
});
$('btn-nudge-dismiss').addEventListener('click', () => {
  $('link-nudge').hidden = true;
  try { localStorage.setItem('r2m_nudge_dismissed', '1'); } catch {}
});

function updateAccountGlyph() {
  $('btn-account').classList.toggle('linked', isLinked());
  $('account-glyph').textContent = isLinked() ? '✓' : '●';
}

/* ── Offline banner ──────────────────────────────────────────────────────── */

function syncOnline() {
  $('offline-banner').hidden = navigator.onLine;
}
window.addEventListener('online', syncOnline);
window.addEventListener('offline', syncOnline);

/* ── Boot ────────────────────────────────────────────────────────────────── */

async function boot() {
  syncOnline();
  await userReady;
  updateAccountGlyph();
  initLibrary(handleOpenBook);
  initPlayer(onPlayerState);
  show('library');

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) =>
      console.warn('[app] SW registration failed', err));
  }
}

boot().catch((err) => {
  console.error('[app] boot failed', err);
  document.body.insertAdjacentHTML('beforeend',
    '<div class="toast">Something went wrong loading the app. Refresh to retry.</div>');
});
