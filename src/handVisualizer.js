/**
 * Hand Visualizer — Glowing white dots on joints + skeleton lines
 */
import * as THREE from 'three';

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // Index
  [0, 9], [9, 10], [10, 11], [11, 12],     // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],   // Ring
  [0, 17], [17, 18], [18, 19], [19, 20],   // Pinky
  [5, 9], [9, 13], [13, 17],               // Palm
];

export class HandVisualizer {
  constructor(scene, scale = 2.0) {
    this.scene = scene;
    this.scale = scale;
    this.groups = []; // one group per hand

    // Smoothed landmark storage
    this.smoothed = [null, null];
    this.smoothFactor = 0.35;
  }

  _ensureGroup(handIdx) {
    if (this.groups[handIdx]) return this.groups[handIdx];

    const group = new THREE.Group();
    group.name = `hand_${handIdx}`;

    // ── 21 landmark spheres ────────────────────────────────────────
    const dotGeo = new THREE.SphereGeometry(0.006, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xbbdddd });
    const dots = [];
    for (let i = 0; i < 21; i++) {
      const mesh = new THREE.Mesh(dotGeo, dotMat.clone());
      mesh.visible = false;
      group.add(mesh);
      dots.push(mesh);
    }

    // ── Glow sprites on each dot ───────────────────────────────────
    const glowTex = this._makeGlowTexture();
    const glowSprites = [];
    for (let i = 0; i < 21; i++) {
      const spriteMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.15,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(0.015, 0.015, 1);
      sprite.visible = false;
      group.add(sprite);
      glowSprites.push(sprite);
    }

    // ── Skeleton lines ─────────────────────────────────────────────
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x22aa99,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
    });
    const positions = new Float32Array(HAND_CONNECTIONS.length * 2 * 3);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    lines.visible = false;
    group.add(lines);

    this.scene.add(group);
    this.groups[handIdx] = { group, dots, glowSprites, lines };
    return this.groups[handIdx];
  }

  _makeGlowTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(200, 255, 240, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 255, 180, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  update(landmarks, handIdx = 0) {
    const g = this._ensureGroup(handIdx);

    if (!landmarks) {
      g.dots.forEach((d) => (d.visible = false));
      g.glowSprites.forEach((s) => (s.visible = false));
      g.lines.visible = false;
      return;
    }

    // ── Smooth landmarks ───────────────────────────────────────────
    if (!this.smoothed[handIdx]) {
      this.smoothed[handIdx] = landmarks.map((l) => ({ ...l }));
    }
    const sm = this.smoothed[handIdx];
    for (let i = 0; i < 21; i++) {
      sm[i].x += (landmarks[i].x - sm[i].x) * (1 - this.smoothFactor);
      sm[i].y += (landmarks[i].y - sm[i].y) * (1 - this.smoothFactor);
      sm[i].z += (landmarks[i].z - sm[i].z) * (1 - this.smoothFactor);
    }

    // ── Update dot positions ───────────────────────────────────────
    for (let i = 0; i < 21; i++) {
      const { x, y, z } = sm[i];
      const px = x * this.scale;
      const py = y * this.scale;
      const pz = z * this.scale;

      g.dots[i].position.set(px, py, pz);
      g.dots[i].visible = true;

      g.glowSprites[i].position.set(px, py, pz);
      g.glowSprites[i].visible = true;

      // Fingertips get bigger glows
      const isTip = [4, 8, 12, 16, 20].includes(i);
      g.glowSprites[i].scale.setScalar(isTip ? 0.025 : 0.012);
      g.glowSprites[i].material.opacity = isTip ? 0.2 : 0.1;
    }

    // ── Update skeleton lines ──────────────────────────────────────
    const posArr = g.lines.geometry.attributes.position.array;
    for (let c = 0; c < HAND_CONNECTIONS.length; c++) {
      const [a, b] = HAND_CONNECTIONS[c];
      const la = sm[a], lb = sm[b];
      const off = c * 6;
      posArr[off] = la.x * this.scale;
      posArr[off + 1] = la.y * this.scale;
      posArr[off + 2] = la.z * this.scale;
      posArr[off + 3] = lb.x * this.scale;
      posArr[off + 4] = lb.y * this.scale;
      posArr[off + 5] = lb.z * this.scale;
    }
    g.lines.geometry.attributes.position.needsUpdate = true;
    g.lines.visible = true;
  }

  /** Get smoothed position of a specific landmark. */
  getPosition(handIdx, landmarkIdx) {
    const sm = this.smoothed[handIdx];
    if (!sm) return null;
    return new THREE.Vector3(
      sm[landmarkIdx].x * this.scale,
      sm[landmarkIdx].y * this.scale,
      sm[landmarkIdx].z * this.scale
    );
  }

  /** Get smoothed wrist position. */
  getWrist(handIdx = 0) {
    return this.getPosition(handIdx, 0);
  }

  /** Get index fingertip position. */
  getIndexTip(handIdx = 0) {
    return this.getPosition(handIdx, 8);
  }

  /** Detect pinch gesture (thumb tip ↔ index tip). */
  getPinchAmount(handIdx = 0) {
    const thumb = this.getPosition(handIdx, 4);
    const index = this.getPosition(handIdx, 8);
    if (!thumb || !index) return 0;
    const dist = thumb.distanceTo(index);
    return Math.max(0, 1 - dist / 0.25);
  }

  /** Detect if the hand is closed into a fist */
  isFist(handIdx = 0) {
    const wrist = this.getPosition(handIdx, 0);
    const midBase = this.getPosition(handIdx, 9);
    if (!wrist || !midBase) return false;
    
    const palmDist = wrist.distanceTo(midBase);
    let sumDist = 0;
    
    // Check distance from wrist to all four fingertips (index, middle, ring, pinky)
    for (const tipIdx of [8, 12, 16, 20]) {
      const tip = this.getPosition(handIdx, tipIdx);
      if (!tip) return false;
      sumDist += wrist.distanceTo(tip);
    }
    
    const avgTipDist = sumDist / 4;
    
    // Open hand ratio is heavily > 2.0. 
    // Even a sloppy fist should be < 1.6
    return (avgTipDist / palmDist) < 1.6; 
  }

  hideHand(handIdx) {
    if (!this.groups[handIdx]) return;
    const g = this.groups[handIdx];
    g.dots.forEach((d) => (d.visible = false));
    g.glowSprites.forEach((s) => (s.visible = false));
    g.lines.visible = false;
  }
}
