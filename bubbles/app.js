// app.js (module) — Bubble Timer with Firestore room sync
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/* ---------------------------
  PASTE YOUR FIREBASE CONFIG (you already provided this)
----------------------------*/
const firebaseConfig = {
  apiKey: "AIzaSyBVqxFB4iVozd72OtvDG2grqq0Qu0fHi5E",
  authDomain: "bubbles-cb172.firebaseapp.com",
  projectId: "bubbles-cb172",
  storageBucket: "bubbles-cb172.firebasestorage.app",
  messagingSenderId: "788649184388",
  appId: "1:788649184388:web:9ccc2c5273103638e946d1",
  measurementId: "G-LHMXF18WLW"
};

/* ---------------------------
  Initialize Firebase + Firestore
----------------------------*/
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
enableIndexedDbPersistence(db).catch(()=>{ /* ignore if not available */ });

/* ---------------------------
  UI elements
----------------------------*/
const board = document.getElementById('board');
const form = document.getElementById('addForm');
const titleInput = document.getElementById('title');
const hoursInput = document.getElementById('hours');
const minsInput = document.getElementById('mins');

const sideControls = document.getElementById('sideControls');
const playPauseBtn = document.getElementById('playPauseBtn');
const deleteBtn = document.getElementById('deleteBtn');

const roomLabel = document.getElementById('roomLabel');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const copyBtn = document.getElementById('copyBtn');
const statusEl = document.getElementById('status');

/* ---------------------------
  Local state + persistence
----------------------------*/
const STORAGE_KEY = 'bubble-timer-room-state';
let state = loadState(); // will hold { bubbles: [...], selectedId, _updatedAt }
if(!state.bubbles) state.bubbles = [];
state.selectedId = state.selectedId || null;

function loadState(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { bubbles: [] }; }
  catch(e){ return { bubbles: [] }; }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* ---------------------------
  Room handling (URL param or random)
----------------------------*/
function randomRoom(len=5){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length: len}, ()=>chars[Math.floor(Math.random()*chars.length)]).join('');
}
const urlParams = new URLSearchParams(window.location.search);
let currentRoom = (urlParams.get('room') || randomRoom()).toUpperCase();
roomLabel.textContent = `Room: ${currentRoom}`;
roomInput.value = '';

function updateURL(){
  const newUrl = `${location.origin}${location.pathname}?room=${currentRoom}`;
  history.replaceState({}, '', newUrl);
}
updateURL();

/* ---------------------------
  Firestore sync variables
----------------------------*/
let roomRef = null;
let unsubscribe = null;
let remoteSaveTimer = null;

/* ---------- utilities ---------- */
function id(){ return Math.random().toString(36).slice(2,9) }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function humanTime(sec){ if(!sec || sec<=0) return '0:00'; const m=Math.floor(sec/60); const s=Math.floor(sec%60).toString().padStart(2,'0'); return `${m}:${s}`;}
function sizeFromMinutes(totalMinutes){ const min=90,max=180; const val=Math.sqrt(totalMinutes+1)*10+50; return Math.round(clamp(val,min,max)); }

/* ---------------------------
  joinRoom: set up listener on /rooms/{roomId}
----------------------------*/
async function joinRoom(roomId){
  // cleanup previous listener
  if(unsubscribe) { unsubscribe(); unsubscribe = null; }
  currentRoom = (roomId || randomRoom()).toUpperCase();
  roomLabel.textContent = `Room: ${currentRoom}`;
  updateURL();
  statusEl.textContent = 'connecting...';

  roomRef = doc(db, 'rooms', currentRoom);

  // initial fetch + realtime listener
  try {
    const snap = await getDoc(roomRef);
    if(snap.exists()){
      const data = snap.data();
      if(data && data.state){
        // if remote is newer than local, adopt remote
        const remoteUpdated = data.updatedAt ? data.updatedAt.toMillis() : 0;
        const localUpdated = state._updatedAt || 0;
        if(remoteUpdated > localUpdated){
          state = data.state;
          state._updatedAt = remoteUpdated;
          saveState();
        }
      }
    } else {
      // create initial doc with our local state
      await setDoc(roomRef, { updatedAt: new Date(), state });
    }
  } catch(e){
    console.warn('initial join error', e);
  }

  // attach realtime listener
  unsubscribe = onSnapshot(roomRef, (snap) => {
    if(!snap.exists()) {
      statusEl.textContent = 'room created';
      return;
    }
    const data = snap.data();
    const remoteUpdated = data.updatedAt ? data.updatedAt.toMillis() : 0;
    const localUpdated = state._updatedAt || 0;
    // apply remote only if remote is newer
    if(remoteUpdated > localUpdated){
      state = data.state || { bubbles: [] };
      state._updatedAt = remoteUpdated;
      saveState();
      render();
      statusEl.textContent = 'synced';
    } else {
      statusEl.textContent = 'up-to-date';
    }
  }, (err) => {
    console.warn('listener error', err);
    statusEl.textContent = 'offline';
  });
}

/* ---------------------------
  Save local state to Firestore (debounced)
----------------------------*/
function saveRemoteDebounced(){
  if(!roomRef) return;
  if(remoteSaveTimer) clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(async ()=>{
    try{
      const payload = { updatedAt: new Date(), state };
      await setDoc(roomRef, payload, { merge: true });
      state._updatedAt = (new Date()).getTime();
      saveState();
      statusEl.textContent = 'saved';
    }catch(e){
      console.warn('saveRemote error', e);
      statusEl.textContent = 'save failed';
    }
  }, 400);
}

/* ---------------------------
  Render & UI (same behavior as your last version)
----------------------------*/
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
    wrapper.appendChild(core);

    const connector = document.createElement('div');
    connector.className = 'connector';
    wrapper.appendChild(connector);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = `${b.label} — ${remaining <= 0 ? '0:00' : humanTime(remaining)}`;
    wrapper.appendChild(label);

    if(typeof b.x === 'number' && typeof b.y === 'number' && (b.x !== 0 || b.y !== 0)){
      wrapper.style.transform = `translate(${b.x}px, ${b.y}px)`;
    }

    // select on click
    wrapper.addEventListener('click', (ev)=>{
      if(ev.target.closest('.control-btn')) return;
      ev.stopPropagation();
      if(state.selectedId !== b.id){
        state.selectedId = b.id;
      }
      saveState();
      render();
      showSideControlsFor(wrapper);
    });

    // drag only when selected
    let drag = null;
    wrapper.addEventListener('pointerdown', (e)=>{
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
      // remote save
      saveRemoteDebounced();
      drag = null;
    });

    board.appendChild(wrapper);
  });

  if(state.selectedId){
    const el = board.querySelector(`.bubble[data-id="${state.selectedId}"]`);
    if(el) showSideControlsFor(el);
    else hideSideControls();
  } else {
    hideSideControls();
  }
}

/* ---------------------------
  Controls: show/hide, play/pause, delete
----------------------------*/
function showSideControlsFor(bubbleEl){
  if(!bubbleEl) return hideSideControls();
  const rect = bubbleEl.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  const left = Math.min(boardRect.right - 12, rect.right + 8);
  const top = clamp(rect.top + window.scrollY + rect.height/2 - 28, 12 + window.scrollY, window.innerHeight - 60 + window.scrollY);
  sideControls.style.left = `${left}px`;
  sideControls.style.top = `${top}px`;
  sideControls.classList.add('show');
  sideControls.setAttribute('aria-hidden','false');

  const selected = state.bubbles.find(x => x.id === state.selectedId);
  if(selected && selected.running){
    playPauseBtn.textContent = '⏸';
    playPauseBtn.setAttribute('aria-label','Pause');
  } else {
    playPauseBtn.textContent = '▶️';
    playPauseBtn.setAttribute('aria-label','Play');
  }
}
function hideSideControls(){
  sideControls.classList.remove('show');
  sideControls.setAttribute('aria-hidden','true');
}

playPauseBtn.addEventListener('click', (ev)=>{
  ev.stopPropagation();
  if(!state.selectedId) return;
  const b = state.bubbles.find(x => x.id === state.selectedId);
  if(!b) return;
  b.running = !b.running;
  if(b.running) b.lastTick = Date.now();
  saveState();
  saveRemoteDebounced();
  render();
});

deleteBtn.addEventListener('click', (ev)=>{
  ev.stopPropagation();
  if(!state.selectedId) return;
  state.bubbles = state.bubbles.filter(x => x.id !== state.selectedId);
  state.selectedId = null;
  saveState();
  saveRemoteDebounced();
  render();
});

board.addEventListener('click', (ev)=>{
  if(ev.target === board){
    state.selectedId = null;
    saveState();
    render();
    hideSideControls();
  }
});

/* ---------------------------
  Timer tick
----------------------------*/
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
  if(changed){
    state._updatedAt = (new Date()).getTime();
    saveState();
    saveRemoteDebounced();
    render();
  }
}, 1000);

/* ---------------------------
  Add form
----------------------------*/
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
  state._updatedAt = (new Date()).getTime();
  saveState();
  saveRemoteDebounced();
  render();
});

/* ---------------------------
  Room UI: join / copy
----------------------------*/
joinBtn.addEventListener('click', (ev)=>{
  ev.preventDefault();
  const code = (roomInput.value || '').trim().toUpperCase();
  if(!code) return;
  joinRoom(code);
  roomInput.value = '';
});

copyBtn.addEventListener('click', (ev)=>{
  ev.preventDefault();
  const url = `${location.origin}${location.pathname}?room=${currentRoom}`;
  navigator.clipboard?.writeText(url).then(()=> {
    copyBtn.textContent = 'Copied!';
    setTimeout(()=> copyBtn.textContent = 'Copy link', 1200);
  }).catch(()=> {
    alert(url);
  });
});

/* ---------------------------
  Init: join currentRoom and render
----------------------------*/
joinRoom(currentRoom).then(()=> {
  render();
});

window._BT = { state, saveState, render };
