// Bubble Timer v3 — selection + external controls + drag-only-when-selected
const STORAGE_KEY = 'bubble-timer-v3';
const board = document.getElementById('board');
const form = document.getElementById('addForm');
const titleInput = document.getElementById('title');
const hoursInput = document.getElementById('hours');
const minsInput = document.getElementById('mins');

const sideControls = document.getElementById('sideControls');
const playPauseBtn = document.getElementById('playPauseBtn');
const deleteBtn = document.getElementById('deleteBtn');

let state = loadState();
state.selectedId = state.selectedId || null;

// Helpers
function id(){ return Math.random().toString(36).slice(2,9) }
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
function loadState(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { bubbles: [] } }
  catch(e){ return { bubbles: [] } }
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)) }
function humanTime(sec){
  if(sec <= 0) return '0:00';
  const m = Math.floor(sec/60);
  const s = Math.floor(sec % 60).toString().padStart(2,'0');
  return `${m}:${s}`;
}
function sizeFromMinutes(totalMinutes){
  const min = 90, max = 180;
  const val = Math.sqrt(totalMinutes + 1) * 10 + 50;
  return Math.round(clamp(val, min, max));
}

// render board and bubbles
function render(){
  board.innerHTML = '';
  state.bubbles.forEach((b, idx) => {
    const wrapper = document.createElement('div');
    wrapper.className = `bubble color-${idx % 3} ${state.selectedId === b.id ? 'selected' : ''}`;
    wrapper.dataset.id = b.id;

    // core
    const core = document.createElement('div');
    core.className = 'core';
    const px = sizeFromMinutes(b.minutes);
    core.style.width = core.style.height = px + 'px';

    const totalSec = b.minutes * 60;
    const remaining = Math.max(0, b.remaining ?? totalSec);
    const pct = totalSec === 0 ? 0 : (remaining / totalSec);
    const minScale = 0.5, maxScale = 1.15;
    const scale = (minScale + (maxScale - minScale) * pct);
    core.style.transform = `scale(${scale})`;
    core.style.opacity = remaining === 0 ? 0.7 : 1;

    const timeText = document.createElement('div');
    timeText.className = 'time';
    timeText.textContent = remaining <= 0 ? 'Done' : humanTime(remaining);

    core.appendChild(timeText);

    // controls area (kept empty here — external side controls will manage actions)
    wrapper.appendChild(core);

    // connector and label
    const connector = document.createElement('div');
    connector.className = 'connector';
    wrapper.appendChild(connector);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `${b.label} — ${remaining <= 0 ? '0:00' : humanTime(remaining)}`;
    wrapper.appendChild(label);

    // position
    if(typeof b.x === 'number' && typeof b.y === 'number' && (b.x !== 0 || b.y !== 0)){
      wrapper.style.transform = `translate(${b.x}px, ${b.y}px)`;
    }

    // click selects the bubble (do not toggle running)
    wrapper.addEventListener('click', (ev)=>{
      // if clicking on control btns, ignore here
      if(ev.target.closest('.control-btn')) return;
      ev.stopPropagation();
      if(state.selectedId === b.id){
        // already selected — keep selected (no toggle)
      } else {
        state.selectedId = b.id;
      }
      saveState();
      render();
      showSideControlsFor(wrapper);
    });

    // pointer-based dragging only when selected
    let drag = null;
    wrapper.addEventListener('pointerdown', (e)=>{
      // only start drag when this bubble is selected
      if(state.selectedId !== b.id) return;
      wrapper.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, origX: b.x || 0, origY: b.y || 0 };
    });
    window.addEventListener('pointermove', (e)=>{
      if(!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      b.x = drag.origX + dx;
      b.y = drag.origY + dy;
      wrapper.style.transform = `translate(${b.x}px, ${b.y}px)`;
    });
    window.addEventListener('pointerup', (e)=>{
      if(!drag || drag.id !== e.pointerId) return;
      saveState();
      drag = null;
    });

    board.appendChild(wrapper);
  });

  // after redraw, if selected bubble exists re-show controls positioned
  if(state.selectedId){
    const el = board.querySelector(`.bubble[data-id="${state.selectedId}"]`);
    if(el) showSideControlsFor(el);
    else hideSideControls();
  } else {
    hideSideControls();
  }
}

// show side controls positioned near the given bubble element
function showSideControlsFor(bubbleEl){
  if(!bubbleEl) return hideSideControls();
  const rect = bubbleEl.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  // position controls to the right of bubble (clamped inside viewport)
  const left = Math.min(boardRect.right - 12, rect.right + 8);
  const top = clamp(rect.top + window.scrollY + rect.height/2 - 28, 12 + window.scrollY, window.innerHeight - 60 + window.scrollY);
  sideControls.style.left = `${left}px`;
  sideControls.style.top = `${top}px`;
  sideControls.classList.add('show');
  sideControls.setAttribute('aria-hidden','false');

  // update play/pause icon state for selected bubble
  const selected = state.bubbles.find(x => x.id === state.selectedId);
  if(selected && selected.running){
    playPauseBtn.textContent = '⏸';
    playPauseBtn.setAttribute('aria-label','Pause');
  } else {
    playPauseBtn.textContent = '▶️';
    playPauseBtn.setAttribute('aria-label','Play');
  }
}

// hide controls
function hideSideControls(){
  sideControls.classList.remove('show');
  sideControls.setAttribute('aria-hidden','true');
}

// play/pause click
playPauseBtn.addEventListener('click', (ev)=>{
  ev.stopPropagation();
  if(!state.selectedId) return;
  const b = state.bubbles.find(x => x.id === state.selectedId);
  if(!b) return;
  b.running = !b.running;
  if(b.running) b.lastTick = Date.now();
  saveState(); render();
});

// delete click
deleteBtn.addEventListener('click', (ev)=>{
  ev.stopPropagation();
  if(!state.selectedId) return;
  state.bubbles = state.bubbles.filter(x => x.id !== state.selectedId);
  state.selectedId = null;
  saveState(); render();
});

// deselect when clicking empty board
board.addEventListener('click', (ev)=>{
  // only deselect when clicking the board itself (not a bubble)
  if(ev.target === board){
    state.selectedId = null;
    saveState(); render();
    hideSideControls();
  }
});

// tick loop
setInterval(()=>{
  const now = Date.now();
  let changed = false;
  state.bubbles.forEach(b=>{
    if(b.running){
      const last = b.lastTick || now;
      const dt = Math.floor((now - last) / 1000);
      if(dt > 0){
        b.remaining = Math.max(0, (b.remaining ?? (b.minutes*60)) - dt);
        b.lastTick = now;
        if(b.remaining === 0) b.running = false;
        changed = true;
      }
    }
  });
  if(changed){ saveState(); render(); }
}, 1000);

// add form
form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const label = titleInput.value.trim() || 'Task';
  const hours = Math.max(0, parseInt(hoursInput.value) || 0);
  const mins = Math.max(0, parseInt(minsInput.value) || 0);
  const totalMins = Math.max(1, hours * 60 + mins);
  const newB = {
    id: id(),
    label,
    minutes: totalMins,
    remaining: totalMins * 60,
    x: 0, y:0,
    running: false
  };
  state.bubbles.push(newB);
  // reset form
  titleInput.value = '';
  hoursInput.value = '0';
  minsInput.value = '30';
  saveState(); render();
});

// initialize and render
if(!state.bubbles) state.bubbles = [];
saveState();
render();

// expose debug handle
window._BT = { state, saveState, render };
