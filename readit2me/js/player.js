/* Playback engine + "now reading" view.
 *
 * One persistent <audio> element (#narrator) is blessed by the first user
 * gesture and reused forever — required on iOS, where only a gesture-started
 * element may later change src and keep playing. Pages play as object URLs of
 * cached MP3 blobs; the next page is generated + downloaded ahead of time so
 * auto-advance is a near-instant src swap. Media Session gives lock-screen
 * controls. Sentence highlighting is driven by timeupdate against estimated
 * timings. If cloud narration fails (offline, quota), falls back to
 * SpeechSynthesis for that page.
 */

import * as store from './store.js';
import * as tts from './tts.js';
import { toBlocks, toSentences, toSpeakable } from './stitch.js';
import { persistStorage } from './audio-cache.js';

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];
const SLEEP_CHOICES = [
  { label: 'Off', min: 0 },
  { label: '15 min', min: 15 },
  { label: '30 min', min: 30 },
  { label: '60 min', min: 60 },
  { label: 'End of page', min: -1 },
];

const el = {};
const state = {
  book: null,
  pages: [],           // [{n, text, audio, timings}]
  idx: -1,             // index into pages
  cache: new Map(),    // n -> {url, timings, durationSec}
  mode: null,          // 'cloud' | 'speech'
  speed: 1,
  sleepUntil: 0,       // epoch ms; -1 = end of page
  activeSen: -1,
  blessed: false,
  onStateChange: null, // notify app.js (mini player)
};

let audio;

export function initPlayer(onStateChange) {
  audio = document.getElementById('narrator');
  state.onStateChange = onStateChange;
  for (const id of ['transcript', 'player-pageno', 'player-pagecount', 'player-controls',
    'scrub', 'scrub-now', 'scrub-total', 'btn-play', 'btn-back15', 'btn-fwd15',
    'btn-speed', 'btn-sleep']) {
    el[id] = document.getElementById(id);
  }

  // Bless the element on the very first tap anywhere.
  const bless = () => {
    if (state.blessed) return;
    state.blessed = true;
    audio.muted = true;
    audio.play().then(() => { audio.pause(); audio.muted = false; }).catch(() => {
      state.blessed = false; audio.muted = false;
    });
    document.removeEventListener('touchend', bless);
    document.removeEventListener('click', bless);
  };
  document.addEventListener('touchend', bless, { once: false });
  document.addEventListener('click', bless, { once: false });

  audio.addEventListener('timeupdate', onTimeUpdate);
  audio.addEventListener('ended', () => advance(1, true));
  audio.addEventListener('play', syncUi);
  audio.addEventListener('pause', () => { store.flushProgress(); syncUi(); });

  el['btn-play'].addEventListener('click', togglePlay);
  el['btn-back15'].addEventListener('click', () => skip(-15));
  el['btn-fwd15'].addEventListener('click', () => skip(15));
  el['btn-speed'].addEventListener('click', cycleSpeed);
  el['btn-sleep'].addEventListener('click', openSleepSheet);
  el.scrub.addEventListener('input', () => {
    if (state.mode === 'cloud' && audio.duration) {
      audio.currentTime = (el.scrub.value / 100) * audio.duration;
    }
  });

  setupMediaSession();

  window.addEventListener('pagehide', () => store.flushProgress());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.flushProgress();
  });
}

/* ── Opening a book ──────────────────────────────────────────────────────── */

export async function openBook(book, { resume = true } = {}) {
  stopAll();
  state.book = book;
  state.pages = await store.getPages(book.id);
  state.cache.clear();
  const settings = await store.getSettings();
  state.speed = settings.speed || 1;
  el['btn-speed'].textContent = state.speed + '×';
  el['player-pagecount'].textContent = state.pages.length;

  let startN = state.pages.length ? state.pages[0].n : 1;
  let offset = 0;
  if (resume) {
    const prog = await store.getProgress(book.id);
    if (prog) { startN = prog.pageNo; offset = prog.offsetSec || 0; }
  }
  const idx = Math.max(0, state.pages.findIndex((p) => p.n === startN));
  await loadPage(idx, offset, /*autoplay*/ false);
  persistStorage();
}

/* ── Page loading + playback ─────────────────────────────────────────────── */

async function preparePage(idx) {
  const page = state.pages[idx];
  if (!page) return null;
  if (state.cache.has(page.n)) return state.cache.get(page.n);
  const { blob, audio: ref, timings } = await tts.ensurePageAudio(state.book, page.n, page);
  const entry = { url: URL.createObjectURL(blob), timings, durationSec: ref.durationSec };
  page.audio = ref;
  state.cache.set(page.n, entry);
  return entry;
}

async function loadPage(idx, offsetSec, autoplay) {
  const page = state.pages[idx];
  if (!page) return;
  state.idx = idx;
  state.activeSen = -1;
  renderTranscript(page);
  el['player-pageno'].textContent = page.n;
  syncUi('Narrating…');

  try {
    const entry = await preparePage(idx);
    if (state.idx !== idx) return; // user moved on while we generated
    state.mode = 'cloud';
    audio.src = entry.url;
    audio.playbackRate = state.speed;
    if (offsetSec) audio.currentTime = offsetSec;
    if (autoplay) await audio.play().catch(() => {});
    updateMediaMetadata(page);
    warmNextPage(idx);
  } catch (err) {
    console.warn('[player] cloud narration unavailable, using device voice', err);
    if (state.idx !== idx) return;
    state.mode = 'speech';
    toast('Cloud narration unavailable — using device voice');
    if (autoplay) speakCurrent();
  }
  syncUi();
}

function speakCurrent() {
  const page = state.pages[state.idx];
  tts.speakPage(page.text, {
    rate: state.speed,
    onSentence: (i) => highlightSentence(i),
    onEnd: () => advance(1, true),
  });
  syncUi();
}

/* Generate/download the next page in the background for gapless advance. */
function warmNextPage(idx) {
  if (idx + 1 < state.pages.length) {
    preparePage(idx + 1).catch(() => {});
  }
}

async function advance(delta, autoplay) {
  // Sleep timer "end of page"
  if (state.sleepUntil === -1 && delta > 0) {
    state.sleepUntil = 0;
    syncUi();
    store.flushProgress();
    return;
  }
  const idx = state.idx + delta;
  if (idx < 0 || idx >= state.pages.length) {
    store.flushProgress();
    syncUi();
    return;
  }
  store.flushProgress();
  await loadPage(idx, 0, autoplay);
}

/* ── Controls ────────────────────────────────────────────────────────────── */

export function togglePlay() {
  if (state.mode === 'speech') {
    if (tts.isSpeaking()) { tts.pauseSpeaking(); } else { speakCurrent(); }
    syncUi();
    return;
  }
  if (!audio.src) { loadPage(Math.max(0, state.idx), 0, true); return; }
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}

function skip(sec) {
  if (state.mode !== 'cloud' || !audio.duration) return;
  audio.currentTime = Math.min(Math.max(0, audio.currentTime + sec), audio.duration);
  updatePositionState();
}

function cycleSpeed() {
  const i = SPEEDS.indexOf(state.speed);
  state.speed = SPEEDS[(i + 1) % SPEEDS.length];
  audio.playbackRate = state.speed;
  if ('preservesPitch' in audio) audio.preservesPitch = true;
  el['btn-speed'].textContent = state.speed + '×';
  store.saveSettings({ speed: state.speed });
  updatePositionState();
}

function openSleepSheet() {
  closeSleepSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.id = 'sleep-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.id = 'sleep-sheet';
  sheet.innerHTML = '<h4>Sleep timer</h4>';
  const opts = document.createElement('div');
  opts.className = 'sheet-options';
  for (const c of SLEEP_CHOICES) {
    const b = document.createElement('button');
    b.textContent = c.label;
    const armed =
      (c.min === 0 && !state.sleepUntil) ||
      (c.min === -1 && state.sleepUntil === -1) ||
      (c.min > 0 && state.sleepUntil > 0);
    if (armed) b.classList.add('on');
    b.addEventListener('click', () => {
      state.sleepUntil = c.min === 0 ? 0 : c.min === -1 ? -1 : Date.now() + c.min * 60000;
      closeSleepSheet();
      syncUi();
      toast(c.min === 0 ? 'Sleep timer off' : `Sleep: ${c.label}`);
    });
    opts.appendChild(b);
  }
  sheet.appendChild(opts);
  backdrop.addEventListener('click', closeSleepSheet);
  document.body.append(backdrop, sheet);
}

function closeSleepSheet() {
  document.getElementById('sleep-backdrop')?.remove();
  document.getElementById('sleep-sheet')?.remove();
}

function stopAll() {
  tts.stopSpeaking();
  try { audio.pause(); } catch {}
  audio.removeAttribute('src');
  for (const entry of state.cache.values()) URL.revokeObjectURL(entry.url);
  state.cache.clear();
  state.sleepUntil = 0;
}

/* ── Time / progress / karaoke ───────────────────────────────────────────── */

function onTimeUpdate() {
  if (state.mode !== 'cloud' || !state.book) return;
  const page = state.pages[state.idx];
  if (page) store.reportProgress(state.book.id, page.n, audio.currentTime);

  // Sleep timer — checked here, not with setTimeout (timers throttle in bg).
  if (state.sleepUntil > 0 && Date.now() >= state.sleepUntil) {
    state.sleepUntil = 0;
    fadeOutAndPause();
  }

  // Karaoke: latest sentence whose start <= now.
  const entry = state.cache.get(page?.n);
  if (entry && entry.timings) {
    let i = -1;
    const t = audio.currentTime;
    for (let k = 0; k < entry.timings.length; k++) {
      if (entry.timings[k].s <= t) i = k; else break;
    }
    if (i !== state.activeSen) highlightSentence(i);
  }

  // Scrub + times
  if (audio.duration) {
    el.scrub.value = (audio.currentTime / audio.duration) * 100;
    el['scrub-now'].textContent = fmt(audio.currentTime);
    el['scrub-total'].textContent = fmt(audio.duration);
  }
  if (state.onStateChange) state.onStateChange(snapshot());
}

function fadeOutAndPause() {
  const startVol = audio.volume;
  const steps = 15;
  let k = 0;
  const iv = setInterval(() => {
    k++;
    audio.volume = Math.max(0, startVol * (1 - k / steps));
    if (k >= steps) {
      clearInterval(iv);
      audio.pause();
      audio.volume = startVol;
      toast('Sleep timer — paused. Good night 🌙');
    }
  }, 200);
}

function highlightSentence(i) {
  state.activeSen = i;
  const spans = el.transcript.querySelectorAll('.sen');
  spans.forEach((s, k) => s.classList.toggle('active', k === i));
  const active = spans[i];
  if (active) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/* ── Transcript rendering ────────────────────────────────────────────────── */

function renderTranscript(page) {
  const root = el.transcript;
  root.innerHTML = '';
  let senIndex = 0;
  for (const block of toBlocks(page.text)) {
    if (block.type === 'h') {
      const h = document.createElement('h3');
      h.className = 'sen';
      h.dataset.sen = senIndex++;
      h.textContent = block.text;
      h.addEventListener('click', onSentenceTap);
      root.appendChild(h);
    } else {
      const p = document.createElement('p');
      for (const sentence of toSentences(block.text)) {
        const span = document.createElement('span');
        span.className = 'sen';
        span.dataset.sen = senIndex++;
        setStyledText(span, sentence);
        span.addEventListener('click', onSentenceTap);
        p.appendChild(span);
        p.appendChild(document.createTextNode(' '));
      }
      root.appendChild(p);
    }
  }
}

/* Render *italics* as <em> without innerHTML on model output. */
function setStyledText(node, text) {
  const parts = text.split(/\*([^*]+)\*/);
  parts.forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const em = document.createElement('em');
      em.textContent = part;
      node.appendChild(em);
    } else {
      node.appendChild(document.createTextNode(part));
    }
  });
}

function onSentenceTap(e) {
  const i = Number(e.currentTarget.dataset.sen);
  const page = state.pages[state.idx];
  const entry = state.cache.get(page?.n);
  if (state.mode === 'cloud' && entry && entry.timings && entry.timings[i]) {
    audio.currentTime = entry.timings[i].s;
    if (audio.paused) audio.play().catch(() => {});
  }
}

/* ── Media Session ───────────────────────────────────────────────────────── */

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => togglePlay());
  ms.setActionHandler('pause', () => togglePlay());
  ms.setActionHandler('seekbackward', (d) => skip(-(d.seekOffset || 15)));
  ms.setActionHandler('seekforward', (d) => skip(d.seekOffset || 15));
  try {
    ms.setActionHandler('seekto', (d) => {
      if (d.seekTime != null) { audio.currentTime = d.seekTime; updatePositionState(); }
    });
  } catch {}
  ms.setActionHandler('previoustrack', () => advance(-1, true));
  ms.setActionHandler('nexttrack', () => advance(1, true));
}

function updateMediaMetadata(page) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `Page ${page.n}`,
    artist: state.book.title,
    album: 'ReadIt2Me',
    artwork: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  });
  updatePositionState();
}

function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!audio.duration || !isFinite(audio.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      position: Math.min(audio.currentTime, audio.duration),
      playbackRate: audio.playbackRate,
    });
  } catch {}
}

/* ── UI sync helpers ─────────────────────────────────────────────────────── */

function snapshot() {
  const page = state.pages[state.idx];
  const playing = state.mode === 'speech' ? tts.isSpeaking() : !!audio.src && !audio.paused;
  return {
    book: state.book,
    pageNo: page ? page.n : null,
    pageCount: state.pages.length,
    playing,
    position: audio.duration ? audio.currentTime / audio.duration : 0,
  };
}

function syncUi(statusText) {
  const playing = state.mode === 'speech' ? tts.isSpeaking() : !!audio.src && !audio.paused;
  el['btn-play'].innerHTML = playing ? '&#10073;&#10073;' : '&#9654;';
  el['btn-sleep'].classList.toggle('sleep-armed', !!state.sleepUntil);
  if (state.onStateChange) {
    state.onStateChange({ ...snapshot(), status: statusText || null });
  }
}

function fmt(sec) {
  sec = Math.floor(sec || 0);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 3200);
}

export { toast };
