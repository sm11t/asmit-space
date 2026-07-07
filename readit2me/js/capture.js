/* Page-photo capture: native camera input, thumbnail tray, canvas downscale.
 *
 * Photos are downscaled to ~2000px long edge JPEG q0.8 before OCR — small
 * enough to be cheap/fast, large enough to keep book type legible (Gemini
 * rescales anything above 3072px anyway, so bigger uploads are pure waste).
 */

const LONG_EDGE = 2000;
const JPEG_QUALITY = 0.8;

const state = {
  shots: [],      // [{ blob, thumbUrl }]
  onChange: null,
};

export function getShots() {
  return state.shots.slice();
}

export function resetCapture() {
  state.shots.forEach((s) => URL.revokeObjectURL(s.thumbUrl));
  state.shots = [];
  render();
}

export function initCapture(onChange) {
  state.onChange = onChange;
  const input = document.getElementById('camera-input');
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    input.value = ''; // allow re-selecting the same file
    for (const file of files) {
      try {
        const blob = await downscale(file);
        state.shots.push({ blob, thumbUrl: URL.createObjectURL(blob) });
      } catch (err) {
        console.error('[capture] downscale failed', err);
      }
    }
    render();
  });
}

async function downscale(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function render() {
  const tray = document.getElementById('capture-tray');
  tray.innerHTML = '';
  state.shots.forEach((shot, i) => {
    const cell = document.createElement('div');
    cell.className = 'tray-thumb';

    const img = document.createElement('img');
    img.src = shot.thumbUrl;
    img.alt = `Page ${i + 1}`;

    const no = document.createElement('span');
    no.className = 'thumb-no';
    no.textContent = i + 1;

    const x = document.createElement('button');
    x.className = 'thumb-x';
    x.textContent = '×';
    x.setAttribute('aria-label', `Remove page ${i + 1}`);
    x.addEventListener('click', () => {
      URL.revokeObjectURL(shot.thumbUrl);
      state.shots = state.shots.filter((s) => s !== shot);
      render();
    });

    cell.append(img, no, x);
    tray.appendChild(cell);
  });
  if (state.onChange) state.onChange(state.shots.length);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
