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

// Display case reference for animation
let displayCase = null;

// Interaction system
let isNearDisplay = false;
const INTERACTION_DISTANCE = 2.0; // Units required to interact

// Raycaster for floor detection
const raycaster = new THREE.Raycaster();
const clock = new THREE.Clock();

init();
animate();

// Hide loading screen with fade out
function hideLoadingScreen(){
  console.log('Hiding loading screen...');
  const loadingScreen = document.getElementById('loading-screen');
  if(loadingScreen){
    loadingScreen.classList.add('hidden');
    // Remove from DOM after transition
    setTimeout(() => {
      loadingScreen.style.display = 'none';
      console.log('Loading screen hidden');
    }, 500);
  } else {
    console.warn('Loading screen element not found');
  }

  // Focus the window to enable keyboard input immediately (wrapped in try-catch)
  try {
    window.focus();
    document.body.focus();

    // Also try to focus the canvas if it exists
    if(renderer && renderer.domElement){
      renderer.domElement.focus();
      renderer.domElement.setAttribute('tabindex', '0');
    }
  } catch(e) {
    console.log('Focus error (non-critical):', e);
  }
}

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

  // Make canvas focusable for keyboard input
  try {
    renderer.domElement.setAttribute('tabindex', '0');
    renderer.domElement.style.outline = 'none'; // Remove focus outline

    // Focus canvas on click to ensure keyboard events work
    renderer.domElement.addEventListener('click', () => {
      renderer.domElement.focus();
    });
  } catch(e) {
    console.warn('Could not set canvas attributes:', e);
  }

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
    case 'KeyE':
      if(isNearDisplay){
        handleDisplayInteraction();
      }
      break;
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

// Create the 'e' logo mesh
function createELogo(){
  // Create the 'e' shape using curves
  const eShape = new THREE.Shape();

  const scale = 0.15;

  // Outer circle of 'e'
  eShape.absarc(0, 0, 1 * scale, 0, Math.PI * 2, false);

  // Inner hole (counter) - positioned slightly off-center for 'e' opening
  const holePath = new THREE.Path();
  holePath.absarc(0.05 * scale, 0.05 * scale, 0.6 * scale, 0, Math.PI * 2, true);
  eShape.holes.push(holePath);

  // Create horizontal cut for 'e' opening
  const cutPath = new THREE.Path();
  cutPath.moveTo(0, 0);
  cutPath.lineTo(1.2 * scale, 0);
  cutPath.lineTo(1.2 * scale, 0.25 * scale);
  cutPath.lineTo(0, 0.25 * scale);
  cutPath.lineTo(0, 0);
  eShape.holes.push(cutPath);

  // Extrude settings
  const extrudeSettings = {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 3
  };

  const geometry = new THREE.ExtrudeGeometry(eShape, extrudeSettings);

  const material = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 0.3,
    metalness: 0.7,
    emissive: 0x111111,
    emissiveIntensity: 0.2
  });

  const eLogo = new THREE.Mesh(geometry, material);
  eLogo.castShadow = true;
  eLogo.receiveShadow = true;

  // Rotate to face forward
  eLogo.rotation.x = -Math.PI / 2;

  return eLogo;
}

// Create a jewelry display case
function createJewelryDisplay(position){
  const displayGroup = new THREE.Group();

  // Materials
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.8
  });

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.3,
    roughness: 0.1,
    metalness: 0.1,
    transmission: 0.9,
    thickness: 0.5
  });

  const displayPlatformMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.2,
    metalness: 0.9
  });

  // Base pedestal
  const baseGeo = new THREE.CylinderGeometry(0.4, 0.45, 0.1, 16);
  const base = new THREE.Mesh(baseGeo, baseMaterial);
  base.position.y = 0.05;
  base.castShadow = true;
  base.receiveShadow = true;
  displayGroup.add(base);

  // Column/stand
  const columnGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.2, 12);
  const column = new THREE.Mesh(columnGeo, baseMaterial);
  column.position.y = 0.7;
  column.castShadow = true;
  column.receiveShadow = true;
  displayGroup.add(column);

  // Top platform base
  const platformBaseGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.08, 16);
  const platformBase = new THREE.Mesh(platformBaseGeo, baseMaterial);
  platformBase.position.y = 1.34;
  platformBase.castShadow = true;
  platformBase.receiveShadow = true;
  displayGroup.add(platformBase);

  // Inner display platform (where the object sits)
  const innerPlatformGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.03, 16);
  const innerPlatform = new THREE.Mesh(innerPlatformGeo, displayPlatformMaterial);
  innerPlatform.position.y = 1.415;
  innerPlatform.receiveShadow = true;
  displayGroup.add(innerPlatform);

  // Add the 'e' logo on the platform
  const eLogo = createELogo();
  eLogo.position.y = 1.48;
  eLogo.userData.rotationSpeed = 0.5; // Store rotation speed for animation
  displayGroup.add(eLogo);
  displayGroup.userData.eLogo = eLogo; // Store reference for animation

  // Glass case (cylinder)
  const glassGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.6, 16, 1, true);
  const glassCasing = new THREE.Mesh(glassGeo, glassMaterial);
  glassCasing.position.y = 1.73;
  glassCasing.castShadow = true;
  glassCasing.receiveShadow = true;
  displayGroup.add(glassCasing);

  // Glass top cap
  const glassTopGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.02, 16);
  const glassTop = new THREE.Mesh(glassTopGeo, glassMaterial);
  glassTop.position.y = 2.03;
  displayGroup.add(glassTop);

  // Create red outline meshes (slightly larger, initially invisible)
  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0
  });

  // Outline for glass cylinder
  const outlineGlassGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.64, 16, 1, true);
  const outlineGlass = new THREE.Mesh(outlineGlassGeo, outlineMaterial);
  outlineGlass.position.y = 1.73;
  displayGroup.add(outlineGlass);

  // Outline for base
  const outlineBaseGeo = new THREE.CylinderGeometry(0.42, 0.47, 0.12, 16);
  const outlineBase = new THREE.Mesh(outlineBaseGeo, outlineMaterial.clone());
  outlineBase.position.y = 0.05;
  displayGroup.add(outlineBase);

  // Outline for column
  const outlineColumnGeo = new THREE.CylinderGeometry(0.10, 0.12, 1.24, 12);
  const outlineColumn = new THREE.Mesh(outlineColumnGeo, outlineMaterial.clone());
  outlineColumn.position.y = 0.7;
  displayGroup.add(outlineColumn);

  // Store outline meshes for toggling
  displayGroup.userData.outlines = [outlineGlass, outlineBase, outlineColumn];

  // Position the display
  displayGroup.position.copy(position);

  // Add collision for base and column only (not glass)
  worldMeshes.push(base, column, platformBase);

  scene.add(displayGroup);
  return displayGroup;
}

// Create construction/work in progress elements
function createConstructionElements(boundingBox){
  const roomWidth = boundingBox.max.x - boundingBox.min.x;
  const roomDepth = boundingBox.max.z - boundingBox.min.z;
  const roomHeight = boundingBox.max.y - boundingBox.min.y;
  const offset = 0.05; // Very close to the wall

  // Back wall (looking from center towards -Z)
  createWIPWallText(
    new THREE.Vector3(roomCenter.x, roomCenter.y, boundingBox.min.z + offset),
    roomWidth * 0.8,
    roomHeight * 0.4,
    0
  );

  // Front wall (looking from center towards +Z)
  createWIPWallText(
    new THREE.Vector3(roomCenter.x, roomCenter.y, boundingBox.max.z - offset),
    roomWidth * 0.8,
    roomHeight * 0.4,
    Math.PI
  );

  // Left wall (looking from center towards -X)
  createWIPWallText(
    new THREE.Vector3(boundingBox.min.x + offset, roomCenter.y, roomCenter.z),
    roomDepth * 0.8,
    roomHeight * 0.4,
    Math.PI / 2
  );

  // Right wall (looking from center towards +X)
  createWIPWallText(
    new THREE.Vector3(boundingBox.max.x - offset, roomCenter.y, roomCenter.z),
    roomDepth * 0.8,
    roomHeight * 0.4,
    -Math.PI / 2
  );
}

// Create large "WORK IN PROGRESS" text on wall using canvas texture
function createWIPWallText(position, width, height, rotationY){
  // Create canvas for text
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 1024;
  canvas.height = 512;

  // Fill with semi-transparent black background
  context.fillStyle = 'rgba(0, 0, 0, 0.8)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Add yellow/orange border stripes
  context.fillStyle = '#ffaa00';
  const stripeWidth = 40;
  context.fillRect(0, 0, canvas.width, stripeWidth);
  context.fillRect(0, canvas.height - stripeWidth, canvas.width, stripeWidth);
  context.fillRect(0, 0, stripeWidth, canvas.height);
  context.fillRect(canvas.width - stripeWidth, 0, stripeWidth, canvas.height);

  // Add diagonal warning stripes in corners
  context.strokeStyle = '#ffaa00';
  context.lineWidth = 30;
  for(let i = 0; i < 5; i++){
    context.beginPath();
    context.moveTo(stripeWidth + i * 80, stripeWidth);
    context.lineTo(stripeWidth + i * 80 + 60, stripeWidth + 60);
    context.stroke();
  }

  // Draw "WORK IN PROGRESS" text
  context.fillStyle = '#ffaa00';
  context.font = 'bold 80px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('WORK IN', canvas.width / 2, canvas.height / 2 - 50);
  context.fillText('PROGRESS', canvas.width / 2, canvas.height / 2 + 50);

  // Add some construction symbols
  context.font = 'bold 60px Arial';
  context.fillText('⚠', 150, canvas.height / 2);
  context.fillText('⚠', canvas.width - 150, canvas.height / 2);

  // Create texture from canvas
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  // Create plane with the texture
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide
  });

  const textPlane = new THREE.Mesh(geometry, material);
  textPlane.position.copy(position);
  textPlane.rotation.y = rotationY;

  scene.add(textPlane);
  return textPlane;
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

      // Add construction signs around the room
      const box = new THREE.Box3().setFromObject(room);
      createConstructionElements(box);

      // Add jewelry display case in the center of the room
      displayCase = createJewelryDisplay(new THREE.Vector3(roomCenter.x, box.min.y, roomCenter.z));

      // Hide loading screen after a short delay to ensure rendering
      console.log('Room loaded, scheduling loading screen hide...');
      setTimeout(() => {
        console.log('Timeout executed, calling hideLoadingScreen...');
        hideLoadingScreen();
      }, 500);
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

  // Add construction signs around the fallback room
  const box = new THREE.Box3().setFromObject(roomGroup);
  createConstructionElements(box);

  // Add jewelry display case in the center of the room
  displayCase = createJewelryDisplay(new THREE.Vector3(roomCenter.x, box.min.y, roomCenter.z));

  // Hide loading screen after a short delay to ensure rendering
  console.log('Fallback room loaded, scheduling loading screen hide...');
  setTimeout(() => {
    console.log('Fallback timeout executed, calling hideLoadingScreen...');
    hideLoadingScreen();
  }, 500);
}

function animate(){
  requestAnimationFrame(animate);

  const dt = Math.min(0.05, clock.getDelta());
  updateCharacter(dt);

  // Animate the 'e' logo rotation (around Y axis - vertical spin)
  if(displayCase && displayCase.userData.eLogo){
    displayCase.userData.eLogo.rotation.y += displayCase.userData.eLogo.userData.rotationSpeed * dt;
  }

  // Check proximity to display case for interaction
  checkDisplayProximity();

  renderer.render(scene, camera);
}

// Check if character is near the display case
function checkDisplayProximity(){
  if(!character || !displayCase) return;

  const distance = character.position.distanceTo(displayCase.position);
  isNearDisplay = distance < INTERACTION_DISTANCE;

  // Toggle outline visibility
  if(displayCase.userData.outlines){
    const targetOpacity = isNearDisplay ? 0.3 : 0;

    for(const outline of displayCase.userData.outlines){
      // Smooth fade transition
      outline.material.opacity += (targetOpacity - outline.material.opacity) * 0.1;
    }
  }

  // Toggle interaction prompt
  const promptElement = document.getElementById('interact-prompt');
  if(promptElement){
    promptElement.style.display = isNearDisplay ? 'block' : 'none';
  }
}

// Handle interaction with display case
function handleDisplayInteraction(){
  console.log('Interacted with display case!');
  // TODO: Define what happens when player interacts with the display
  // Ideas: open a modal, zoom in, play animation, show information, etc.
}
