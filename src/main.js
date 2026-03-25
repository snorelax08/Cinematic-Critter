/**
 * Main Application — Real-Time Hand-Tracked 3D Critter System
 * 
 * Ties together: hand tracking, 3D insect, particles, UI panels, post-processing.
 */
import * as THREE from 'three';
import './style.css';
import { HandTracker } from './handTracker.js';
import { HandVisualizer } from './handVisualizer.js';
import { Insect } from './insect.js';
import { ParticleSystem } from './particles.js';
import { UIPanels } from './uiPanels.js';
import { createPostProcessing } from './postProcessing.js';

// ══════════════════════════════════════════════════════════════════
//  Scene Setup
// ══════════════════════════════════════════════════════════════════
const canvas = document.getElementById('scene-canvas');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.7;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// Background will be set to webcam feed after init

// ── Camera ──────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(
  50, window.innerWidth / window.innerHeight, 0.01, 50
);
camera.position.set(0, 0, 1.8);
camera.lookAt(0, 0, 0);

// ── Lights ──────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0x0a1020, 0.2);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0x6699cc, 0.4);
keyLight.position.set(2, 3, 2);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0x00ffaa, 0.3, 3);
rimLight.position.set(-1, 1, 2);
scene.add(rimLight);

const fillLight = new THREE.PointLight(0x334488, 0.2, 3);
fillLight.position.set(1, -0.5, 1);
scene.add(fillLight);

// ── Background dust particles ───────────────────────────────────
function createBackgroundDust() {
  const count = 150;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 4;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 3;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 3 - 1;
    sizes[i] = 0.3 + Math.random() * 0.8;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 pos = position;
        pos.y += sin(uTime * 0.3 + position.x * 2.0) * 0.02;
        pos.x += cos(uTime * 0.2 + position.z * 1.5) * 0.015;
        vAlpha = 0.06 + sin(uTime + position.y * 3.0) * 0.04;
        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = size * (80.0 / -mvPos.z);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float alpha = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(0.2, 0.4, 0.5, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.Points(geo, mat);
}

const dust = createBackgroundDust();
dust.visible = false; // disabled — cleaner void look
scene.add(dust);

// ══════════════════════════════════════════════════════════════════
//  Core Systems
// ══════════════════════════════════════════════════════════════════
const handTracker = new HandTracker();
const handVis = new HandVisualizer(scene, 2.0);
const insect = new Insect(scene);
const particles = new ParticleSystem(scene);
const uiPanels = new UIPanels(scene);
const { composer, bloomPass } = createPostProcessing(renderer, scene, camera);

// ══════════════════════════════════════════════════════════════════
//  State
// ══════════════════════════════════════════════════════════════════
let lastPinchState = false;
const clock = new THREE.Clock();
const fpsEl = document.getElementById('fps-counter');
let frameCount = 0, fpsTime = 0;

// ══════════════════════════════════════════════════════════════════
//  Animation Loop
// ══════════════════════════════════════════════════════════════════
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  // ── Hand tracking ────────────────────────────────────────────
  const results = handTracker.detect();

  let rightHandLandmarks = null;
  let leftHandLandmarks = null;

  // Process detected hands
  for (let i = 0; i < handTracker.numHands; i++) {
    const landmarks = handTracker.getLandmarks(i);
    const handedness = handTracker.getHandedness(i);

    if (!landmarks) continue;

    // MediaPipe reports the handedness as seen from the camera's perspective
    // Since we mirror the image, "Right" from MediaPipe = user's right hand
    if (handedness === 'Right') {
      rightHandLandmarks = landmarks;
    } else {
      leftHandLandmarks = landmarks;
    }
  }

  // Update hand visualizer for both hands — show glowing dots on all detected
  // Use hand 0 for the first detected, hand 1 for second
  if (handTracker.numHands >= 1) {
    handVis.update(handTracker.getLandmarks(0), 0);
  } else {
    handVis.hideHand(0);
  }
  if (handTracker.numHands >= 2) {
    handVis.update(handTracker.getLandmarks(1), 1);
  } else {
    handVis.hideHand(1);
  }

  // ── Insect follows right hand (if available, else first hand) ─
  let insectTarget = null;
  let pinchAmount = 0;

  // Try right hand first, then any hand
  if (rightHandLandmarks) {
    // Use index fingertip of right hand (landmark 8)
    insectTarget = new THREE.Vector3(
      rightHandLandmarks[8].x * 2,
      rightHandLandmarks[8].y * 2,
      rightHandLandmarks[8].z * 2,
    );
    // Get pinch from the hand the insect is on
    const rIdx = handTracker.getHandedness(0) === 'Right' ? 0 : 1;
    pinchAmount = handVis.getPinchAmount(rIdx);
  } else if (handTracker.numHands > 0) {
    const pos = handVis.getIndexTip(0);
    if (pos) insectTarget = pos;
    pinchAmount = handVis.getPinchAmount(0);
  }

  if (insectTarget) {
    insect.setTarget(insectTarget);
  }

  insect.update(time, delta, pinchAmount);

  // ── Gesture Trigger for Transformation (Fist) ────────────────
  if (handTracker.numHands > 0) {
    const rIdx = rightHandLandmarks ? (handTracker.getHandedness(0) === 'Right' ? 0 : 1) : 0;
    
    // Detect if the user closes their hand into a fist
    const isFist = handVis.isFist(rIdx);
    
    if (isFist) {
      // Trigger morph when fist is closed (debounced by 3 seconds)
      if (time - lastMorphTime > 3.0 && !insect.isTransforming) {
        insect.triggerMorph();
        lastMorphTime = time;
      }
    }
  }

  // ── Particle System ──────────────────────────────────────────
  const emissionPts = insect.getEmissionPoints();
  particles.update(
    time, 
    delta, 
    insect.getPosition(), 
    emissionPts, 
    pinchAmount,
    insect.getActiveType(),
    insect.isTransforming,
    insect.morphState
  );

  // ── Pinch burst ──────────────────────────────────────────────
  const isPinching = pinchAmount > 0.7;
  
  if (isPinching && !lastPinchState) {
    particles.triggerBurst(insect.getPosition());
  }
  lastPinchState = isPinching;
  
  // ── Bloom intensity reacts to pinch ──────────────────────────
  bloomPass.strength = 0.25 + pinchAmount * 0.15;

  // ── UI panels ────────────────────────────────────────────────
  const wristPos = handVis.getWrist(0);
  uiPanels.update(time, wristPos);

  // ── Background dust ──────────────────────────────────────────
  dust.material.uniforms.uTime.value = time;

  // ── Render ───────────────────────────────────────────────────
  composer.render();

  // ── FPS ──────────────────────────────────────────────────────
  frameCount++;
  if (time - fpsTime >= 1) {
    fpsEl.textContent = `${Math.round(frameCount / (time - fpsTime))} FPS`;
    frameCount = 0;
    fpsTime = time;
  }
}

// ══════════════════════════════════════════════════════════════════
//  Resize Handler
// ══════════════════════════════════════════════════════════════════
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
});

// ══════════════════════════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════════════════════════
async function init() {
  const statusEl = document.getElementById('loading-status');
  const overlay = document.getElementById('loading-overlay');

  // Dark fallback while camera loads
  scene.background = new THREE.Color(0x020408);

  try {
    await handTracker.init((msg) => {
      statusEl.textContent = msg;
    });
  } catch (err) {
    console.error('Initialization failed:', err);
    statusEl.textContent = `Camera error: ${err.message}. Retrying...`;
    statusEl.style.color = '#ffaa44';

    // Retry camera access after a short delay
    try {
      await new Promise((r) => setTimeout(r, 2000));
      await handTracker.init((msg) => {
        statusEl.textContent = msg;
      });
    } catch (retryErr) {
      console.error('Retry failed:', retryErr);
      statusEl.textContent = `Could not access camera. Close other tabs using your camera and refresh.`;
      statusEl.style.color = '#ff4444';
    }
  }

  // Always try to set webcam background with dark/night filter
  const video = document.getElementById('webcam');

  function setupDarkWebcamBackground() {
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;

    // Full-screen background plane with darkening shader
    const bgGeo = new THREE.PlaneGeometry(2, 2);
    const bgMat = new THREE.ShaderMaterial({
      uniforms: {
        uVideo: { value: videoTexture },
        uDarkness: { value: 0.03 },   // near-black void
        uTint: { value: new THREE.Color(0.01, 0.015, 0.04) }, // barely-there deep blue
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uVideo;
        uniform float uDarkness;
        uniform vec3 uTint;
        varying vec2 vUv;
        void main() {
          // Flip UV horizontally for mirror effect
          vec2 uv = vec2(1.0 - vUv.x, vUv.y);
          vec3 col = texture2D(uVideo, uv).rgb;
          
          // Heavy desaturation (80%)
          float gray = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(gray), col, 0.2);
          
          // Crush blacks — push dark values even darker
          col = pow(col, vec3(1.8));
          
          // Darken aggressively
          col *= uDarkness;
          
          // Add deep space blue tint
          col += uTint;
          
          // Strong vignette (dark edges, slight center visibility)
          float vig = 1.0 - smoothstep(0.15, 0.7, length(vUv - 0.5) * 1.6);
          col *= vig;
          
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    });

    const bgMesh = new THREE.Mesh(bgGeo, bgMat);
    bgMesh.frustumCulled = false;
    bgMesh.renderOrder = -1000;
    scene.add(bgMesh);

    // Don't use scene.background anymore
    scene.background = null;
  }

  if (video.srcObject && video.readyState >= 2) {
    setupDarkWebcamBackground();
  } else {
    video.addEventListener('loadeddata', () => {
      setupDarkWebcamBackground();
    }, { once: true });
  }

  // Fade out loading overlay
  overlay.classList.add('hidden');

  // Start animation loop
  animate();
}

init();
