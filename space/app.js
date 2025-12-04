// app.js — sphere-constrained camera for room viewing
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer;
const worldMeshes = [];
let lightmapTex = null;

// Spherical camera coordinates
let spherical = {
  radius: 10,        // distance from center
  theta: Math.PI / 4,  // horizontal angle
  phi: Math.PI / 3     // vertical angle (from top)
};

// Zoom limits
const MIN_RADIUS = 5;
const MAX_RADIUS = 20;

// Mouse interaction
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

// Room center target
const roomCenter = new THREE.Vector3(0, 1.25, 0);

init();
animate();

function init(){
  scene = new THREE.Scene();

  // Isometric-like camera with narrow FOV
  camera = new THREE.PerspectiveCamera(35, innerWidth/innerHeight, 0.1, 100);
  updateCameraPosition();

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(2,5,1);
  dir.castShadow = true;
  scene.add(dir);

  // Event listeners
  window.addEventListener('resize', onResize);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel, { passive: false });

  loadAssetsOrFallback();
}

function onResize(){
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// Convert spherical coordinates to Cartesian and update camera
function updateCameraPosition(){
  const x = roomCenter.x + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
  const y = roomCenter.y + spherical.radius * Math.cos(spherical.phi);
  const z = roomCenter.z + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);

  camera.position.set(x, y, z);
  camera.lookAt(roomCenter);
}

// Mouse interaction handlers
function onMouseDown(e){
  if(e.button === 0){ // left click
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  }
}

function onMouseMove(e){
  if(!isDragging) return;

  const deltaX = e.clientX - previousMousePosition.x;
  const deltaY = e.clientY - previousMousePosition.y;

  // Adjust sensitivity
  const rotationSpeed = 0.005;

  spherical.theta -= deltaX * rotationSpeed;
  spherical.phi -= deltaY * rotationSpeed;

  // Clamp phi to prevent flipping over poles
  const epsilon = 0.01;
  spherical.phi = Math.max(epsilon, Math.min(Math.PI - epsilon, spherical.phi));

  previousMousePosition = { x: e.clientX, y: e.clientY };
  updateCameraPosition();
}

function onMouseUp(e){
  if(e.button === 0){
    isDragging = false;
  }
}

function onWheel(e){
  e.preventDefault();

  // Zoom in/out
  const zoomSpeed = 0.002;
  spherical.radius += e.deltaY * zoomSpeed;

  // Clamp to min/max
  spherical.radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, spherical.radius));

  updateCameraPosition();
}

async function loadAssetsOrFallback(){
  const gltfPath = './models/room57.glb';
  const lmPath = './textures/lightmap_2048.png';
  const loader = new GLTFLoader();
  const texLoader = new THREE.TextureLoader();

  // try to load lightmap first (if present)
  await new Promise(res=>{
    texLoader.load(lmPath,
      (t)=>{ t.flipY=false; t.encoding = THREE.sRGBEncoding; lightmapTex = t; console.log('lightmap loaded'); res(); },
      undefined,
      ()=>{ console.log('no lightmap found'); res(); }
    );
  });

  // try load glb room
  loader.load(gltfPath,
    (g) => {
      console.log('room glb loaded');
      const room = g.scene;
      room.traverse((o)=>{
        if(o.isMesh){
          o.castShadow = true;
          o.receiveShadow = true;
          // ensure uv2 exists (three expects uv2 for lightMap)
          if(!o.geometry.attributes.uv2 && o.geometry.attributes.uv) {
            o.geometry.setAttribute('uv2', o.geometry.attributes.uv);
          }
          // apply lightmap if available
          if(lightmapTex){
            if(Array.isArray(o.material)){
              for(let i=0;i<o.material.length;i++){
                const m = o.material[i].clone();
                m.lightMap = lightmapTex;
                m.lightMapIntensity = 1.0;
                o.material[i] = m;
              }
            } else {
              const m = o.material.clone();
              m.lightMap = lightmapTex;
              m.lightMapIntensity = 1.0;
              o.material = m;
            }
          }
          worldMeshes.push(o);
        }
      });
      scene.add(room);
    },
    undefined,
    (err) => {
      console.warn('Could not load room.glb — using simple fallback room', err);
      createFallbackRoom();
    }
  );
}

function createFallbackRoom(){
  const roomGroup = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color:0xeeeeee, roughness:0.9 });
  const wallGeo = new THREE.BoxGeometry(6,2.5,0.15);
  const back = new THREE.Mesh(wallGeo, wallMat); back.position.set(0,1.25,-3); back.receiveShadow=true;
  const left = new THREE.Mesh(wallGeo, wallMat); left.rotation.y = Math.PI/2; left.position.set(-3,1.25,0); left.receiveShadow=true;
  const right = new THREE.Mesh(wallGeo, wallMat); right.rotation.y = Math.PI/2; right.position.set(3,1.25,0); right.receiveShadow=true;
  const front = new THREE.Mesh(wallGeo, wallMat); front.position.set(0,1.25,3); front.receiveShadow=true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6,6), new THREE.MeshStandardMaterial({color:0xdddddd, roughness:0.95}));
  floor.rotation.x = -Math.PI/2; floor.receiveShadow=true;

  roomGroup.add(back, left, right, front, floor);
  scene.add(roomGroup);
  roomGroup.traverse(o => { if(o.isMesh) worldMeshes.push(o); });
}

function animate(){
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
