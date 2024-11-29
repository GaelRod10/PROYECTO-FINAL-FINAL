import * as THREE from 'three';
import * as CANNON from 'cannon';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';


let isMouseDown = false;
let chargeStartTime = 0;
let maxChargeTime = 2; // Máximo tiempo de carga en segundos
let minForce = 5;
let maxForce = 50;


// Mostrar el "pop-up" al cargar la página
window.addEventListener('load', () => {
  const popup = document.getElementById('popup');
  const closePopup = document.getElementById('close-popup');
  popup.style.display = 'flex';

  closePopup.addEventListener('click', () => {
    popup.style.display = 'none';
  });
});

// Crear la escena
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);  // Fondo de color cielo

// Crear la cámara
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Crear el renderizador
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Agregar controles de PointerLock
const controls = new PointerLockControls(camera, renderer.domElement);
document.body.addEventListener('click', () => controls.lock());

// Variables de movimiento y salto
const moveSpeed = 0.1;
const jumpSpeed = 0.2;
const gravity = 0.01;
const keys = { forward: false, backward: false, left: false, right: false };
let isJumping = false;
let velocityY = 0;

// Configuración de Cannon.js
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

// Crear el suelo
const floorGeometry = new THREE.PlaneGeometry(400, 400);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x4b0082 });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const floorBody = new CANNON.Body({
  mass: 0,
  shape: new CANNON.Plane(),
});
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(floorBody);

// Luz ambiental
scene.add(new THREE.AmbientLight(0xffffff, 1));

// Crear el compositor para el efecto de Bloom
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Crear el pase de UnrealBloomPass
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  100000,  // Intensidad del bloom
  10000,  // Radio del bloom
  .1 // Umbral del bloom
);
composer.addPass(bloomPass);

// Crear pilares con contornos
const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.BackSide, emissive: 0xff00ff, emissiveIntensity: 100000000 });
const pillarWidth = 10;
const pillarDepth = 10;
const numPillars = 400;
const floorWidth = 400;
const floorDepth = 400;
const gridSize = 40;
const stepSizeX = floorWidth / gridSize;
const stepSizeZ = floorDepth / gridSize;

for (let i = 0; i < numPillars; i++) {
  const gridX = Math.floor(Math.random() * gridSize);
  const gridZ = Math.floor(Math.random() * gridSize);
  const offsetX = Math.random() * stepSizeX - stepSizeX / 2;
  const offsetZ = Math.random() * stepSizeZ - stepSizeZ / 2;
  const x = gridX * stepSizeX + offsetX - floorWidth / 2;
  const z = gridZ * stepSizeZ + offsetZ - floorDepth / 2;

  const pillarHeight = Math.random() * 40 + 10;
  const pillarGeometry = new THREE.BoxGeometry(pillarWidth, pillarHeight, pillarDepth);
  const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
  const outline = new THREE.Mesh(pillarGeometry, outlineMaterial);
  outline.scale.set(1.05, 1.05, 1.05);

  const y = pillarHeight / 2;
  pillar.position.set(x, y, z);
  outline.position.set(x, y, z);

  const pillarBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(pillarWidth / 2, pillarHeight / 2, pillarDepth / 2)),
    position: new CANNON.Vec3(x, y, z),
  });

  world.addBody(pillarBody);
  scene.add(outline);
  scene.add(pillar);
}


// Crear proyectiles
const projectiles = [];
function shootProjectile(force) {
  const geometry = new THREE.SphereGeometry(0.5, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(camera.position);
  scene.add(mesh);

  const body = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Sphere(0.5),
  });
  body.position.copy(camera.position);

  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  body.velocity.set(
    direction.x * force,
    direction.y * force,
    direction.z * force
  );

  world.addBody(body);
  projectiles.push({ mesh, body });
}


// Crear dianas
const targets = [];
function createTarget(x, y, z) {
  const geometry = new THREE.SphereGeometry(2, 16, 16);
  const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  scene.add(mesh);

  const body = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Sphere(2),
    position: new CANNON.Vec3(x, y, z),
  });
  world.addBody(body);

  targets.push({ mesh, body });
}

// Crear animación de explosión de partículas
function createExplosion(position, color = 0x00ff00) {
  const particleCount = 50;
  const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
  const particleMaterial = new THREE.MeshStandardMaterial({ color });

  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    particle.position.copy(position);
    scene.add(particle);

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10
    );

    particles.push({ mesh: particle, velocity });
  }

  const explosionDuration = 3; // Duración de la explosión en segundos
  let elapsedTime = 0;

  function animateParticles(delta) {
    elapsedTime += delta;

    if (elapsedTime > explosionDuration) {
      particles.forEach(p => scene.remove(p.mesh));
      return;
    }

    particles.forEach(p => {
      p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
      p.mesh.material.opacity = 1 - elapsedTime / explosionDuration;
    });

    requestAnimationFrame(() => animateParticles(delta));
  }

  animateParticles(1 / 60); // Inicialización
}

// Crear explosión de diana
function explodeTarget(target) {
  createExplosion(target.mesh.position, 0x00ff00);

  scene.remove(target.mesh);
  world.removeBody(target.body);
}



// Crear dianas en posiciones aleatorias
for (let i = 0; i < 5; i++) {
  const x = Math.random() * floorWidth - floorWidth / 2;
  const y = Math.random() * 20 + 10;
  const z = Math.random() * floorDepth - floorDepth / 2;
  createTarget(x, y, z);
}

// Crear contador de dianas
let targetHits = 0;

const counterElement = document.createElement('div');
counterElement.style.position = 'absolute';
counterElement.style.top = '10px';
counterElement.style.left = '10px';
counterElement.style.color = 'white';
counterElement.style.fontSize = '20px';
counterElement.style.fontFamily = 'Arial, sans-serif';
counterElement.textContent = `Dianas impactadas: ${targetHits}/5`;
document.body.appendChild(counterElement);

const chargeIndicator = document.createElement('div');
chargeIndicator.style.position = 'absolute';
chargeIndicator.style.bottom = '10px';
chargeIndicator.style.left = '50%';
chargeIndicator.style.transform = 'translateX(-50%)';
chargeIndicator.style.width = '0%';
chargeIndicator.style.height = '10px';
chargeIndicator.style.backgroundColor = 'red';
document.body.appendChild(chargeIndicator);

function updateChargeIndicator() {
  if (isMouseDown) {
    const chargeDuration = (performance.now() - chargeStartTime) / 1000;
    const chargeFactor = Math.min(chargeDuration / maxChargeTime, 1);
    chargeIndicator.style.width = `${chargeFactor * 100}%`;
  } else {
    chargeIndicator.style.width = '0%';
  }
}

setInterval(updateChargeIndicator, 16); // Actualización cada ~16ms



// Control de teclas
document.addEventListener('keydown', (event) => {
  switch (event.code) {
    case 'KeyW': keys.forward = true; break;
    case 'KeyS': keys.backward = true; break;
    case 'KeyA': keys.left = true; break;
    case 'KeyD': keys.right = true; break;
    case 'Space':
      if (!isJumping) {
        isJumping = true;
        velocityY = jumpSpeed;
      }
      break;
  }
});

document.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'KeyW': keys.forward = false; break;
    case 'KeyS': keys.backward = false; break;
    case 'KeyA': keys.left = false; break;
    case 'KeyD': keys.right = false; break;
  }
});

document.addEventListener('mousedown', () => {
  if (controls.isLocked) {
    isMouseDown = true;
    chargeStartTime = performance.now();
  }
});

document.addEventListener('mouseup', () => {
  if (isMouseDown && controls.isLocked) {
    isMouseDown = false;
    const chargeDuration = (performance.now() - chargeStartTime) / 1000; // Tiempo en segundos
    const chargeFactor = Math.min(chargeDuration / maxChargeTime, 1); // Normalizado entre 0 y 1
    const force = minForce + chargeFactor * (maxForce - minForce);
    shootProjectile(force);
  }
});





// Detectar colisiones
function checkCollisions() {
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i];
    for (const projectile of projectiles) {
      const distance = target.body.position.distanceTo(projectile.body.position);
      if (distance < 2.5) {
        explodeTarget(target);
        targets.splice(i, 1);
        targetHits++;
        counterElement.textContent = `Dianas impactadas: ${targetHits}/5`;
        break;
      }
    }
  }
}

// Animación
const timeStep = 1 / 60;
function animate() {
  requestAnimationFrame(animate);
  world.step(timeStep);

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const { mesh, body } = projectiles[i];
    mesh.position.copy(body.position);
    if (body.position.y < -10) {
      world.removeBody(body);
      scene.remove(mesh);
      projectiles.splice(i, 1);
    }
  }

  checkCollisions();


  if (keys.forward) controls.moveForward(moveSpeed);
  if (keys.backward) controls.moveForward(-moveSpeed);
  if (keys.left) controls.moveRight(-moveSpeed);
  if (keys.right) controls.moveRight(moveSpeed);

  if (isJumping) {
    camera.position.y += velocityY;
    velocityY -= gravity;
    if (camera.position.y <= 5) {
      camera.position.y = 5;
      isJumping = false;
      velocityY = 0;
    }
  }
  


  
  composer.render();  // Usamos el composer para aplicar el efecto de Bloom

  renderer.render(scene, camera);
}

animate();