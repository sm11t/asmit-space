/* TTS client: gets narrated audio for a page.
 *
 * Resolution order (the cost lever — cloud generation happens at most once
 * per page per voice): page doc audio ref → IndexedDB/Storage via audio-cache
 * → generateAudio Cloud Function. SpeechSynthesis is the free/offline
 * fallback, chunked per sentence to dodge Chrome's ~15s utterance cutoff.
 */

import { functions, fn } from './firebase.js';
import { getAudioBlob } from './audio-cache.js';
import * as store from './store.js';
import { toSpeakable, toSentences, toBlocks, estimateTimings } from './stitch.js';

const callGenerate = fn.httpsCallable(functions, 'generateAudio', { timeout: 300000 });

/* Ensure page `n` of a book has narrated audio; returns
 * { blob, durationSec, timings } or throws. */
export async function ensurePageAudio(book, n, page) {
  let audio = page.audio;
  if (!audio || !audio.path) {
    const res = await callGenerate({
      bookId: book.id,
      pageNo: n,
      voice: book.ttsVoice || undefined,
      styleHint: book.styleHint || undefined,
    });
    audio = res.data;
  }
  const blob = await getAudioBlob(audio);

  let timings = page.timings;
  if (!timings || timings.length === 0) {
    timings = computeTimings(page.text, audio.durationSec);
    store.savePage(book.id, n, { text: page.text, audio, timings })
      .catch((err) => console.warn('[tts] timing save failed', err));
  }
  return { blob, audio, timings };
}

/* Sentence start-times, estimated char-weighted across the real duration
 * (Gemini TTS returns no timestamps). Good enough for sentence highlighting. */
export function computeTimings(text, durationSec) {
  const sentences = pageSentences(text);
  return estimateTimings(sentences, durationSec);
}

/* Flat sentence list for a page, in reading order (matches transcript DOM). */
export function pageSentences(text) {
  const out = [];
  for (const block of toBlocks(text)) {
    if (block.type === 'h') out.push(block.text);
    else out.push(...toSentences(block.text));
  }
  return out;
}

/* ── SpeechSynthesis fallback ("eco mode" / offline / while generating) ──── */

let synthQueue = [];
let synthActive = false;

export function speechFallbackAvailable() {
  return 'speechSynthesis' in window;
}

export function speakPage(text, { rate = 1, onSentence, onEnd } = {}) {
  stopSpeaking();
  const sentences = pageSentences(toSpeakable(text));
  synthActive = true;
  synthQueue = sentences.map((s, i) => {
    const u = new SpeechSynthesisUtterance(s);
    u.rate = rate;
    u.onstart = () => onSentence && onSentence(i);
    return u;
  });
  synthQueue.forEach((u, i) => {
    if (i === synthQueue.length - 1) {
      u.onend = () => { synthActive = false; onEnd && onEnd(); };
    }
  });
  synthQueue.forEach((u) => speechSynthesis.speak(u));
}

export function pauseSpeaking() { if (synthActive) speechSynthesis.pause(); }
export function resumeSpeaking() { if (synthActive) speechSynthesis.resume(); }
export function stopSpeaking() {
  synthActive = false;
  synthQueue = [];
  try { speechSynthesis.cancel(); } catch {}
}
export function isSpeaking() { return synthActive; }
