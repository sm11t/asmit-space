/* Pure text utilities: cross-page stitching and sentence segmentation.
 * No imports — easy to unit-test in isolation.
 */

export const CONT_MARK = '⟨cont⟩';

/* Does this page's text end mid-paragraph? */
export function endsMidParagraph(text) {
  const t = text.replace(CONT_MARK, '').trimEnd();
  if (!t) return false;
  const last = t[t.length - 1];
  return !'.!?"”’…:'.includes(last);
}

/* Decide how page N+1 attaches to page N.
 * Returns the continuation prefix to merge into the START of nextText,
 * or null if the pages just follow each other as separate paragraphs. */
export function joinBoundary(prevText, nextText) {
  const prev = prevText.replace(CONT_MARK, '').trimEnd();
  const next = nextText.trimStart();
  if (!prev || !next) return { prev, next, joined: false };

  const prevCut = prevText.includes(CONT_MARK) || endsMidParagraph(prevText);
  const nextLower = /^[a-z]/.test(next);
  if (!prevCut && !nextLower) return { prev, next, joined: false };

  // De-hyphenate across the page boundary: "...mer-" + "chant said" → merchant
  if (prev.endsWith('-') && nextLower) {
    const prevWords = prev.slice(0, -1);
    return { prev: prevWords + next.split(/\s/, 1)[0], next: next.replace(/^\S+\s*/, ''), joined: true };
  }
  return { prev, next, joined: true };
}

/* Split page text into rendered blocks: {type:'h'|'p', text} */
export function toBlocks(text) {
  return text
    .replace(CONT_MARK, '')
    .split(/\n\s*\n/)
    .map((s) => s.replace(/\n+/g, ' ').trim())
    .filter(Boolean)
    .map((s) =>
      s.startsWith('# ')
        ? { type: 'h', text: s.replace(/^#+\s*/, '') }
        : { type: 'p', text: s },
    );
}

/* Sentence segmentation for karaoke timing. Keeps abbreviations from
 * splitting too aggressively; good enough at sentence granularity. */
const ABBREV = /\b(Mr|Mrs|Ms|Dr|St|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\.$/;

export function toSentences(paragraph) {
  const parts = [];
  let buf = '';
  const tokens = paragraph.split(/(?<=[.!?…]["”’)]?)\s+/);
  for (const tok of tokens) {
    buf = buf ? buf + ' ' + tok : tok;
    if (!ABBREV.test(buf.trimEnd())) {
      parts.push(buf);
      buf = '';
    }
  }
  if (buf) parts.push(buf);
  // Re-attach dialogue attributions and other lowercase continuations:
  // '"Hello!"' + 'she said.' → '"Hello!" she said.'
  const merged = [];
  for (const part of parts) {
    if (merged.length && /^[a-z]/.test(part)) {
      merged[merged.length - 1] += ' ' + part;
    } else {
      merged.push(part);
    }
  }
  return merged.filter((s) => s.trim().length > 0);
}

/* Char-weighted time estimation: distribute duration across sentences,
 * with extra weight for sentence-final pauses. Returns [{s: startSec}]
 * aligned to the sentences array. Used when the TTS engine gives no
 * timestamps (Gemini TTS does not). */
export function estimateTimings(sentences, durationSec) {
  const PAUSE_WEIGHT = 12; // ≈ chars of silence after each sentence
  const weights = sentences.map((s) => s.length + PAUSE_WEIGHT);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return sentences.map((s, i) => {
    const start = (acc / total) * durationSec;
    acc += weights[i];
    return { s: Math.round(start * 100) / 100 };
  });
}

/* Strip markdown + markers to get the plain text sent to the TTS engine. */
export function toSpeakable(text) {
  return text
    .replace(CONT_MARK, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}
