// app.js — minimal Three.js viewer + sphere navigation proof
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


let scene, camera, renderer, clock;
let controls;
let player, playerRadius = 0.28;
let playerVelocity = new THREE.Vector3(0,0,0);
let move = { forward:false, backward:false, left:false, right:false, jump:false };
const worldMeshes = [];
let lightmapTex = null;
let onGround = false;
const gravity = -9.8;
const raycaster = new THREE.Raycaster();

init();
animate();

function init(){
  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.05, 200);
  camera.position.set(0, 20, 20);  // positioned above and outside the room
  camera.lookAt(0, 6, 0);  // looking at the center of the room

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

  // sphere player
  const playerGeo = new THREE.SphereGeometry(playerRadius, 24, 16);
  const playerMat = new THREE.MeshStandardMaterial({ color: 0xffcc66, roughness: 0.7 });
  player = new THREE.Mesh(playerGeo, playerMat);
  player.castShadow = true;
  player.position.set(0, playerRadius + 0.02, 0);
  scene.add(player);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);  // look at center of room
  controls.mouseButtons = {
    LEFT: null,
    MIDDLE: THREE.MOUSE.ROTATE,
    RIGHT: null
  };

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  loadAssetsOrFallback();
}

function onResize(){
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function onKeyDown(e){
  switch(e.code){
    case 'KeyW': case 'ArrowUp': move.forward = true; break;
    case 'KeyS': case 'ArrowDown': move.backward = true; break;
    case 'KeyA': case 'ArrowLeft': move.left = true; break;
    case 'KeyD': case 'ArrowRight': move.right = true; break;
    case 'Space': move.jump = true; break;
  }
}
function onKeyUp(e){
  switch(e.code){
    case 'KeyW': case 'ArrowUp': move.forward = false; break;
    case 'KeyS': case 'ArrowDown': move.backward = false; break;
    case 'KeyA': case 'ArrowLeft': move.left = false; break;
    case 'KeyD': case 'ArrowRight': move.right = false; break;
    case 'Space': move.jump = false; break;
  }
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
      // set player starting position
      player.position.set(0, playerRadius + 0.02, 0.2);
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

function testCollision(origin, dir, distance){
  raycaster.set(origin, dir);
  raycaster.far = distance;
  const hits = raycaster.intersectObjects(worldMeshes, false);
  return hits.length > 0 ? hits[0] : null;
}

function updatePlayer(dt){
  const speed = 2.2;
  // camera forward as movement reference
  const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), forward).normalize();

  let desired = new THREE.Vector3();
  if(move.forward) desired.add(forward);
  if(move.backward) desired.sub(forward);
  if(move.left) desired.add(right);
  if(move.right) desired.sub(right);
  desired.normalize();

  const lateral = desired.multiplyScalar(speed);

  if(onGround){
    playerVelocity.y = move.jump ? 3.2 : 0;
  } else {
    playerVelocity.y += gravity * dt;
  }

  // propose next pos
  const nextPos = player.position.clone();
  nextPos.x += lateral.x * dt;
  nextPos.z += lateral.z * dt;
  nextPos.y += playerVelocity.y * dt;

  // horizontal collision
  let blocked = false;
  if(lateral.length() > 0.001){
    const dirH = new THREE.Vector3(lateral.x, 0, lateral.z).normalize();
    const origin = new THREE.Vector3(player.position.x, player.position.y, player.position.z);
    const hit = testCollision(origin, dirH, playerRadius + 0.12);
    if(hit && hit.distance < playerRadius + 0.12) blocked = true;
  }

  if(!blocked){
    player.position.x = nextPos.x;
    player.position.z = nextPos.z;
  }

  // vertical ground detection
  const downOrigin = new THREE.Vector3(player.position.x, player.position.y + 0.1, player.position.z);
  const downHit = testCollision(downOrigin, new THREE.Vector3(0,-1,0), 0.25);
  if(downHit){
    player.position.y = downHit.point.y + playerRadius;
    onGround = true;
    playerVelocity.y = Math.max(0, playerVelocity.y);
  } else {
    onGround = false;
  }

  // camera follow - DISABLED for static aerial view
  // const camTarget = new THREE.Vector3().copy(player.position); camTarget.y += 0.9;
  // const backOffset = new THREE.Vector3(); camera.getWorldDirection(backOffset); backOffset.y = 0; backOffset.normalize(); backOffset.multiplyScalar(-3.2);
  // camera.position.lerp(new THREE.Vector3(player.position.x + backOffset.x, player.position.y + 1.6, player.position.z + backOffset.z), 0.12);
  // controls.target.lerp(camTarget, 0.12);
}

function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  updatePlayer(dt);
  controls.update();
  renderer.render(scene, camera);
}
