// app.js — sphere-constrained camera for room viewing
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let scene, camera, renderer;
const worldMeshes = [];
let lightmapTex = null;

// Zoom limits
const MIN_RADIUS = 5;
const MAX_RADIUS = 20;

// Spherical camera coordinates
let spherical = {
  radius: MAX_RADIUS,  // start at most zoomed out position
  theta: Math.PI / 4,  // horizontal angle
  phi: Math.PI / 3     // vertical angle (from top)
};

// Mouse interaction
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

// Room center target (will be calculated from loaded room)
let roomCenter = new THREE.Vector3(0, 1.25, 0);

// Character
let character = null;
let characterRadius = 0.1;
let characterHeight = 1;
let characterSpeed = 2.0;

// Movement input
let moveInput = { forward: false, backward: false, left: false, right: false };

// Raycaster for floor detection
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();

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

  // Create character
  createCharacter();

  // Event listeners
  window.addEventListener('resize', onResize);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  loadAssetsOrFallback();
}

function createCharacter(){
  // Create capsule-shaped character (cylinder with sphere caps)
  const bodyGeometry = new THREE.CapsuleGeometry(characterRadius, characterHeight - characterRadius * 2, 8, 16);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x4488ff,
    roughness: 0.7,
    metalness: 0.1
  });
  character = new THREE.Mesh(bodyGeometry, bodyMaterial);
  character.castShadow = true;
  character.receiveShadow = true;

  // Position at room center on floor
  character.position.copy(roomCenter);
  character.position.y = characterHeight / 2; // capsule center is at half height

  scene.add(character);
}

function onResize(){
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

// Calculate room center from bounding box
function calculateRoomCenter(roomObject){
  const box = new THREE.Box3().setFromObject(roomObject);
  const center = new THREE.Vector3();
  box.getCenter(center);
  return center;
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
  if(e.button === 1){ // middle mouse button
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
    e.preventDefault(); // prevent default middle-click behavior
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
  if(e.button === 1){ // middle mouse button
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

// Keyboard handlers for WASD movement
function onKeyDown(e){
  switch(e.code){
    case 'KeyW': case 'ArrowUp': moveInput.forward = true; break;
    case 'KeyS': case 'ArrowDown': moveInput.backward = true; break;
    case 'KeyA': case 'ArrowLeft': moveInput.left = true; break;
    case 'KeyD': case 'ArrowRight': moveInput.right = true; break;
  }
}

function onKeyUp(e){
  switch(e.code){
    case 'KeyW': case 'ArrowUp': moveInput.forward = false; break;
    case 'KeyS': case 'ArrowDown': moveInput.backward = false; break;
    case 'KeyA': case 'ArrowLeft': moveInput.left = false; break;
    case 'KeyD': case 'ArrowRight': moveInput.right = false; break;
  }
}

// Update character movement
function updateCharacter(dt){
  if(!character) return;

  // Get camera's horizontal direction (projected onto XZ plane)
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  cameraDirection.y = 0; // Project to horizontal plane
  cameraDirection.normalize();

  // Calculate right direction (perpendicular to camera direction)
  const rightDirection = new THREE.Vector3();
  rightDirection.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();

  // Build movement vector based on input
  const moveDirection = new THREE.Vector3();

  if(moveInput.forward) moveDirection.add(cameraDirection);
  if(moveInput.backward) moveDirection.sub(cameraDirection);
  if(moveInput.left) moveDirection.sub(rightDirection);
  if(moveInput.right) moveDirection.add(rightDirection);

  // Normalize and apply speed
  if(moveDirection.length() > 0){
    moveDirection.normalize();

    // Calculate next position
    const nextPos = character.position.clone();
    nextPos.x += moveDirection.x * characterSpeed * dt;
    nextPos.z += moveDirection.z * characterSpeed * dt;

    // Check horizontal collision with walls
    const collisionCheck = checkWallCollision(nextPos);

    if(!collisionCheck){
      character.position.x = nextPos.x;
      character.position.z = nextPos.z;
    }
  }

  // Keep character on floor (raycast down to find floor)
  snapToFloor();
}

// Check collision with walls
function checkWallCollision(position){
  // Cast rays in 8 directions around the character
  const directions = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0.707, 0, 0.707),
    new THREE.Vector3(-0.707, 0, 0.707),
    new THREE.Vector3(0.707, 0, -0.707),
    new THREE.Vector3(-0.707, 0, -0.707)
  ];

  for(const dir of directions){
    raycaster.set(position, dir);
    raycaster.far = characterRadius + 0.1;
    const hits = raycaster.intersectObjects(worldMeshes, false);

    if(hits.length > 0 && hits[0].distance < characterRadius + 0.05){
      return true; // Collision detected
    }
  }

  return false; // No collision
}

// Snap character to floor
function snapToFloor(){
  if(!character) return;

  // Raycast down from character position
  const origin = character.position.clone();
  origin.y += 1; // Start ray above character

  raycaster.set(origin, new THREE.Vector3(0, -1, 0));
  raycaster.far = 10;

  const hits = raycaster.intersectObjects(worldMeshes, false);

  if(hits.length > 0){
    // Snap to floor + half character height
    character.position.y = hits[0].point.y + characterHeight / 2;
  }
}

// Create a detailed decorative pillar
function createPillar(position){
  const pillarGroup = new THREE.Group();

  // Materials
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8dcc8,
    roughness: 0.8,
    metalness: 0.1
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0xd4c4a8,
    roughness: 0.7,
    metalness: 0.15
  });

  // Base pedestal (square base)
  const baseGeometry = new THREE.BoxGeometry(0.6, 0.15, 0.6);
  const base = new THREE.Mesh(baseGeometry, accentMaterial);
  base.position.y = 0.075;
  base.castShadow = true;
  base.receiveShadow = true;
  pillarGroup.add(base);

  // Lower trim
  const lowerTrimGeo = new THREE.BoxGeometry(0.5, 0.08, 0.5);
  const lowerTrim = new THREE.Mesh(lowerTrimGeo, accentMaterial);
  lowerTrim.position.y = 0.19;
  lowerTrim.castShadow = true;
  lowerTrim.receiveShadow = true;
  pillarGroup.add(lowerTrim);

  // Main column (cylindrical with subtle detail)
  const columnGeometry = new THREE.CylinderGeometry(0.18, 0.2, 2.0, 12);
  const column = new THREE.Mesh(columnGeometry, stoneMaterial);
  column.position.y = 1.23;
  column.castShadow = true;
  column.receiveShadow = true;
  pillarGroup.add(column);

  // Fluting details (vertical grooves)
  for(let i = 0; i < 8; i++){
    const angle = (i / 8) * Math.PI * 2;
    const flutingGeo = new THREE.BoxGeometry(0.03, 1.8, 0.05);
    const fluting = new THREE.Mesh(flutingGeo, accentMaterial);
    fluting.position.x = Math.cos(angle) * 0.19;
    fluting.position.z = Math.sin(angle) * 0.19;
    fluting.position.y = 1.23;
    fluting.rotation.y = angle;
    fluting.castShadow = true;
    fluting.receiveShadow = true;
    pillarGroup.add(fluting);
  }

  // Capital (decorative top) - wider than column
  const capitalGeo = new THREE.CylinderGeometry(0.28, 0.18, 0.2, 12);
  const capital = new THREE.Mesh(capitalGeo, accentMaterial);
  capital.position.y = 2.33;
  capital.castShadow = true;
  capital.receiveShadow = true;
  pillarGroup.add(capital);

  // Top crown
  const crownGeo = new THREE.CylinderGeometry(0.25, 0.28, 0.1, 12);
  const crown = new THREE.Mesh(crownGeo, accentMaterial);
  crown.position.y = 2.48;
  crown.castShadow = true;
  crown.receiveShadow = true;
  pillarGroup.add(crown);

  // Top cap (flat square)
  const capGeo = new THREE.BoxGeometry(0.5, 0.08, 0.5);
  const cap = new THREE.Mesh(capGeo, accentMaterial);
  cap.position.y = 2.57;
  cap.castShadow = true;
  cap.receiveShadow = true;
  pillarGroup.add(cap);

  // Position the entire pillar group
  pillarGroup.position.copy(position);

  // Add all pillar meshes to worldMeshes for collision
  pillarGroup.traverse((obj) => {
    if(obj.isMesh){
      worldMeshes.push(obj);
    }
  });

  scene.add(pillarGroup);
  return pillarGroup;
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

      // Calculate and update room center from bounding box
      roomCenter = calculateRoomCenter(room);
      console.log('Room center:', roomCenter);
      updateCameraPosition();

      // Update character position to room center floor
      if(character){
        character.position.copy(roomCenter);
        snapToFloor();
      }

      // Create pillars in all 4 corners of the room
      const box = new THREE.Box3().setFromObject(room);
      const offset = 0.8;

      // Corner positions
      const backLeft = new THREE.Vector3(box.min.x + offset, box.min.y, box.min.z + offset);
      const backRight = new THREE.Vector3(box.max.x - offset, box.min.y, box.min.z + offset);
      const frontLeft = new THREE.Vector3(box.min.x + offset, box.min.y, box.max.z - offset);
      const frontRight = new THREE.Vector3(box.max.x - offset, box.min.y, box.max.z - offset);

      // Create corner pillars
      createPillar(backLeft);
      createPillar(backRight);
      createPillar(frontLeft);
      createPillar(frontRight);

      // Add 3 equally spaced pillars on front and back walls only
      for(let i = 1; i <= 3; i++){
        const t = i / 4; // 0.25, 0.5, 0.75

        // Back side (between back-left and back-right)
        createPillar(new THREE.Vector3(
          backLeft.x + t * (backRight.x - backLeft.x),
          box.min.y,
          backLeft.z
        ));

        // Front side (between front-left and front-right)
        createPillar(new THREE.Vector3(
          frontLeft.x + t * (frontRight.x - frontLeft.x),
          box.min.y,
          frontLeft.z
        ));
      }
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

  // Calculate and update room center from bounding box
  roomCenter = calculateRoomCenter(roomGroup);
  console.log('Fallback room center:', roomCenter);
  updateCameraPosition();

  // Update character position to room center floor
  if(character){
    character.position.copy(roomCenter);
    snapToFloor();
  }

  // Create pillars in all 4 corners of the fallback room
  const box = new THREE.Box3().setFromObject(roomGroup);
  const offset = 0.8;

  // Corner positions
  const backLeft = new THREE.Vector3(box.min.x + offset, box.min.y, box.min.z + offset);
  const backRight = new THREE.Vector3(box.max.x - offset, box.min.y, box.min.z + offset);
  const frontLeft = new THREE.Vector3(box.min.x + offset, box.min.y, box.max.z - offset);
  const frontRight = new THREE.Vector3(box.max.x - offset, box.min.y, box.max.z - offset);

  // Create corner pillars
  createPillar(backLeft);
  createPillar(backRight);
  createPillar(frontLeft);
  createPillar(frontRight);

  // Add 3 equally spaced pillars on front and back walls only
  for(let i = 1; i <= 3; i++){
    const t = i / 4; // 0.25, 0.5, 0.75

    // Back side (between back-left and back-right)
    createPillar(new THREE.Vector3(
      backLeft.x + t * (backRight.x - backLeft.x),
      box.min.y,
      backLeft.z
    ));

    // Front side (between front-left and front-right)
    createPillar(new THREE.Vector3(
      frontLeft.x + t * (frontRight.x - frontLeft.x),
      box.min.y,
      frontLeft.z
    ));
  }
}

function animate(){
  requestAnimationFrame(animate);

  const dt = Math.min(0.05, clock.getDelta());
  updateCharacter(dt);

  renderer.render(scene, camera);
}
