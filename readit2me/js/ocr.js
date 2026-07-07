/* OCR of book-page photos via Gemini vision, called client-side through the
 * Firebase AI Logic Web SDK (no API key in the bundle; protected by App Check).
 * One image per request beats multi-image prompts for transcription accuracy.
 */

import { app } from './firebase.js';
import { blobToBase64 } from './capture.js';

const SDK = 'https://www.gstatic.com/firebasejs/12.0.0';

const PRIMARY_MODEL = 'gemini-2.5-flash';
const RETRY_MODEL = 'gemini-2.5-pro';
const CONCURRENCY = 3;

export const CONT_MARK = '⟨cont⟩';

const TRANSCRIBE_PROMPT = `You are transcribing a photograph of a printed book page for a read-aloud app.
Transcribe the body text EXACTLY as printed. Output ONLY the transcript — no commentary, no code fences.

Rules:
- Join words hyphenated across line breaks (e.g. "Mer-\\nchant" → "Merchant"); keep genuine compound hyphens.
- Do NOT include page numbers, running headers, or footers.
- Separate paragraphs with a single blank line. Do NOT keep mid-paragraph line breaks.
- Render italicized text as *text* (Markdown asterisks).
- Render a chapter or section heading as a line starting with "# ".
- Preserve dialogue punctuation exactly.
- If the final paragraph is visibly cut off at the bottom edge, transcribe what is visible and end the output with the marker ${CONT_MARK}
- If the photo shows two facing pages, transcribe the left page fully, then the right page.
- If the image contains no legible book text, output exactly: [no text found]`;

let aiMod = null;
let models = {};

async function getModel(name) {
  if (!aiMod) aiMod = await import(`${SDK}/firebase-ai.js`);
  if (!models[name]) {
    const ai = aiMod.getAI(app, { backend: new aiMod.GoogleAIBackend() });
    models[name] = aiMod.getGenerativeModel(ai, {
      model: name,
      generationConfig: { temperature: 0 },
    });
  }
  return models[name];
}

async function transcribeOnce(blob, modelName) {
  const model = await getModel(modelName);
  const base64 = await blobToBase64(blob);
  const result = await model.generateContent([
    { inlineData: { mimeType: 'image/jpeg', data: base64 } },
    { text: TRANSCRIBE_PROMPT },
  ]);
  const text = result.response.text().trim();
  if (!text || text === '[no text found]') {
    throw new Error('No legible text found on this page');
  }
  return text;
}

export async function transcribePage(blob) {
  try {
    return await transcribeOnce(blob, PRIMARY_MODEL);
  } catch (err) {
    console.warn('[ocr] primary model failed, retrying with', RETRY_MODEL, err);
    return transcribeOnce(blob, RETRY_MODEL);
  }
}

/* Transcribe all shots with limited concurrency.
 * onPageState(index, state, payload) — state: 'working' | 'done' | 'error' */
export async function transcribeAll(shots, onPageState) {
  const results = new Array(shots.length).fill(null);
  let next = 0;

  async function worker() {
    while (next < shots.length) {
      const i = next++;
      onPageState(i, 'working');
      try {
        results[i] = await transcribePage(shots[i].blob);
        onPageState(i, 'done', results[i]);
      } catch (err) {
        results[i] = null;
        onPageState(i, 'error', err.message || 'Failed to read page');
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, shots.length) }, worker),
  );
  return results;
}
