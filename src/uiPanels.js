/**
 * Floating UI Panels — Translucent 3D code blocks anchored in space
 */
import * as THREE from 'three';

const CODE_SNIPPETS = [
  `// hand_tracker.init()
const vision = await
  FilesetResolver
  .forVisionTasks(wasm);

landmarker = HandLandmarker
  .createFromOptions({
    numHands: 2,
    delegate: 'GPU'
  });`,

  `// particle_system.glsl
uniform float uTime;
varying vec3 vColor;

void main() {
  float d = length(
    gl_PointCoord - 0.5
  );
  float alpha = 
    smoothstep(0.5,0.0,d);
  gl_FragColor = 
    vec4(vColor, alpha);
}`,

  `// insect.morph(t)
const elongation = 
  1 + morphT * 0.6;
thorax.scale.z = 
  0.8 * elongation;

for (wing of wings) {
  wing.flap(
    sin(time * 8.0)
  );
}`,
];

export class UIPanels {
  constructor(scene) {
    this.scene = scene;
    this.panels = [];
    this._build();
  }

  _build() {
    const positions = [
      { x: -0.65, y: 0.20, z: -0.3, ry: 0.25 },
      { x: 0.65, y: 0.10, z: -0.3, ry: -0.25 },
      { x: 0.0, y: -0.35, z: -0.5, ry: 0.0 },
    ];

    for (let i = 0; i < CODE_SNIPPETS.length; i++) {
      const panel = this._makePanel(CODE_SNIPPETS[i], i);
      const pos = positions[i];
      panel.group.position.set(pos.x, pos.y, pos.z);
      panel.group.rotation.y = pos.ry;
      this.scene.add(panel.group);
      this.panels.push({ ...panel, basePos: new THREE.Vector3(pos.x, pos.y, pos.z) });
    }
  }

  _makePanel(code, index) {
    const group = new THREE.Group();

    // ── Render text to canvas ──────────────────────────────────────
    const canvas = document.createElement('canvas');
    const width = 420, height = 320;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = 'rgba(8, 15, 25, 0.88)';
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(0, 255, 180, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(2, 2, width - 4, height - 4, 10);
    ctx.stroke();

    // Title bar
    ctx.fillStyle = 'rgba(0, 255, 180, 0.08)';
    ctx.fillRect(0, 0, width, 32);
    ctx.fillStyle = 'rgba(0, 255, 180, 0.6)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillText(`module_${index}.glsl`, 12, 21);

    // Dot indicators
    const dotColors = ['#ff5f57', '#ffbd2e', '#28c840'];
    dotColors.forEach((c, j) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(width - 20 - j * 18, 16, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Code text
    const lines = code.split('\n');
    ctx.font = '13px JetBrains Mono, monospace';
    lines.forEach((line, lineIdx) => {
      const y = 55 + lineIdx * 20;
      if (line.startsWith('//')) {
        ctx.fillStyle = 'rgba(100, 180, 140, 0.7)';
      } else if (line.includes('const') || line.includes('uniform') || line.includes('varying') || line.includes('void') || line.includes('for') || line.includes('float')) {
        ctx.fillStyle = 'rgba(120, 200, 255, 0.9)';
      } else {
        ctx.fillStyle = 'rgba(0, 255, 160, 0.85)';
      }
      ctx.fillText(line, 16, y);
    });

    // ── Create textured plane ──────────────────────────────────────
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const planeGeo = new THREE.PlaneGeometry(0.42, 0.32);
    const planeMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    const plane = new THREE.Mesh(planeGeo, planeMat);
    group.add(plane);

    // ── Edge glow ──────────────────────────────────────────────────
    const edgeGeo = new THREE.PlaneGeometry(0.44, 0.34);
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0x00ffb4,
      transparent: true,
      opacity: 0.03,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.z = -0.001;
    group.add(edge);

    return { group, plane, edge, canvas, ctx };
  }

  update(time, handWristPos) {
    for (let i = 0; i < this.panels.length; i++) {
      const panel = this.panels[i];

      // Gentle floating animation
      panel.group.position.y = panel.basePos.y + Math.sin(time * 0.8 + i * 2) * 0.015;
      panel.group.position.x = panel.basePos.x + Math.sin(time * 0.5 + i * 1.5) * 0.008;

      // Subtle rotation
      panel.group.rotation.z = Math.sin(time * 0.6 + i) * 0.02;

      // Edge glow pulse
      panel.edge.material.opacity = 0.04 + Math.sin(time * 2 + i * 1.3) * 0.03;

      // If hand is near, panels react (move slightly toward camera)
      if (handWristPos) {
        const dist = panel.group.position.distanceTo(handWristPos);
        if (dist < 0.5) {
          panel.plane.material.opacity = 0.9 + (0.5 - dist) * 0.2;
          panel.edge.material.opacity = 0.1 + (0.5 - dist) * 0.15;
        }
      }
    }
  }
}
