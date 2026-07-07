/* generateAudio — the one server piece of ReadIt2Me.
 *
 * Callable function: reads a page's text from Firestore, narrates it with
 * Gemini 2.5 Flash TTS (emotion steered by a style prompt), encodes the 24kHz
 * PCM to 64kbps mono MP3, saves it to Cloud Storage under the caller's path,
 * updates the page doc, and returns the audio metadata.
 *
 * Security: requires auth + App Check, checks page ownership implicitly via
 * path, and enforces a per-user daily page quota to bound spend.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { GoogleGenAI } = require('@google/genai');
// NOTE: upstream lamejs@1.2.1 is broken in Node (its module entry references
// browser-bundle globals like MPEGMode). The @breezystack fork works but is
// ESM-only under Node (its CJS entry is an IIFE that exports nothing), so it
// must be loaded via dynamic import.
let lamejsPromise = null;
function loadLamejs() {
  if (!lamejsPromise) lamejsPromise = import('@breezystack/lamejs');
  return lamejsPromise;
}

admin.initializeApp();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const DEFAULT_VOICE = 'Sulafat';
const SAMPLE_RATE = 24000;
const MP3_KBPS = 64;
const DAILY_PAGE_LIMIT = 120;      // per user
const GLOBAL_DAILY_LIMIT = 1000;   // whole project — circuit breaker: anonymous
                                   // UIDs are free to mint, so a per-user cap
                                   // alone can't bound worst-case spend
const MAX_TEXT_CHARS = 12000;

// Gemini prebuilt voices — reject anything else before spending quota.
const VOICES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
]);

exports.generateAudio = onCall(
  {
    region: 'us-central1',
    enforceAppCheck: true,
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in first.');
    }
    const uid = request.auth.uid;
    const { bookId, pageNo, voice, styleHint } = request.data || {};
    if (typeof bookId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(bookId)) {
      throw new HttpsError('invalid-argument', 'Bad bookId.');
    }
    const n = Number(pageNo);
    if (!Number.isInteger(n) || n < 1 || n > 9999) {
      throw new HttpsError('invalid-argument', 'Bad pageNo.');
    }
    const pageId = String(n).padStart(4, '0');

    const db = admin.firestore();
    const pageRef = db.doc(`users/${uid}/books/${bookId}/pages/${pageId}`);
    const pageSnap = await pageRef.get();
    if (!pageSnap.exists) {
      throw new HttpsError('not-found', 'Page not found.');
    }
    const page = pageSnap.data();

    // Idempotent: if audio already exists for this voice, return it.
    const wantVoice = typeof voice === 'string' && VOICES.has(voice) ? voice : DEFAULT_VOICE;
    if (page.audio && page.audio.path && page.audio.voice === wantVoice) {
      return page.audio;
    }

    const text = speakable(String(page.text || ''));
    if (!text) throw new HttpsError('failed-precondition', 'Page has no text.');
    if (text.length > MAX_TEXT_CHARS) {
      throw new HttpsError('invalid-argument', 'Page text too long.');
    }

    await checkDailyQuota(db, uid);

    // ── Gemini TTS ──────────────────────────────────────────────────────
    const style = sanitizeStyle(styleHint);
    const prompt =
      `Narrate the following book passage as a professional audiobook narrator: ` +
      `${style} Match the emotional register of the scene — bring dialogue to life, ` +
      `slow slightly for tension, warm up for tenderness. Read the text verbatim.\n\n` +
      text;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
    let response;
    try {
      response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: wantVoice } },
          },
        },
      });
    } catch (err) {
      console.error('[generateAudio] TTS call failed', err);
      throw new HttpsError('unavailable', 'Narration service failed — try again.');
    }

    const part = response?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    if (!part) throw new HttpsError('internal', 'No audio returned.');
    const pcm = Buffer.from(part.inlineData.data, 'base64'); // s16le mono 24kHz

    // ── PCM → MP3 ───────────────────────────────────────────────────────
    const mp3 = await encodeMp3(pcm);
    const durationSec = pcm.length / 2 / SAMPLE_RATE;

    // ── Store + record ──────────────────────────────────────────────────
    const path = `users/${uid}/books/${bookId}/pages/${pageId}.mp3`;
    await admin.storage().bucket().file(path).save(mp3, {
      contentType: 'audio/mpeg',
      metadata: { cacheControl: 'private, max-age=31536000, immutable' },
    });

    const audio = {
      path,
      durationSec: Math.round(durationSec * 100) / 100,
      sizeBytes: mp3.length,
      voice: wantVoice,
      generatedAt: Date.now(),
    };
    await pageRef.set({ audio }, { merge: true });
    return audio;
  },
);

/* Per-user + project-wide daily quotas via usage/ docs — bounds worst-case
 * spend even against minted anonymous UIDs. */
async function checkDailyQuota(db, uid) {
  const today = new Date().toISOString().slice(0, 10);
  const userRef = db.doc(`usage/${uid}`);
  const globalRef = db.doc('usage/_global');
  await db.runTransaction(async (tx) => {
    const [userSnap, globalSnap] = await Promise.all([tx.get(userRef), tx.get(globalRef)]);
    const u = userSnap.exists ? userSnap.data() : {};
    const g = globalSnap.exists ? globalSnap.data() : {};
    const userCount = u.day === today ? u.pages || 0 : 0;
    const globalCount = g.day === today ? g.pages || 0 : 0;
    if (userCount >= DAILY_PAGE_LIMIT) {
      throw new HttpsError(
        'resource-exhausted',
        `Daily limit of ${DAILY_PAGE_LIMIT} narrated pages reached — try tomorrow.`,
      );
    }
    if (globalCount >= GLOBAL_DAILY_LIMIT) {
      throw new HttpsError(
        'resource-exhausted',
        'The narration service is at capacity today — try tomorrow.',
      );
    }
    tx.set(userRef, { day: today, pages: userCount + 1 }, { merge: true });
    tx.set(globalRef, { day: today, pages: globalCount + 1 }, { merge: true });
  });
}

function sanitizeStyle(styleHint) {
  if (typeof styleHint !== 'string' || !styleHint.trim()) {
    return 'Use a warm, engaged voice with natural pacing.';
  }
  return styleHint.replace(/[\r\n]+/g, ' ').slice(0, 200) + '.';
}

/* Mirrors the client's toSpeakable(): strip markdown + continuation marker. */
function speakable(text) {
  return text
    .replace(/⟨cont⟩/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

async function encodeMp3(pcmBuffer) {
  const { Mp3Encoder } = await loadLamejs();
  const samples = new Int16Array(
    pcmBuffer.buffer,
    pcmBuffer.byteOffset,
    Math.floor(pcmBuffer.length / 2),
  );
  const encoder = new Mp3Encoder(1, SAMPLE_RATE, MP3_KBPS);
  const chunks = [];
  const BLOCK = 1152;
  for (let i = 0; i < samples.length; i += BLOCK) {
    const out = encoder.encodeBuffer(samples.subarray(i, i + BLOCK));
    if (out.length) chunks.push(Buffer.from(out));
  }
  const flush = encoder.flush();
  if (flush.length) chunks.push(Buffer.from(flush));
  return Buffer.concat(chunks);
}
