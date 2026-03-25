/**
 * Advanced Particle System — A living VFX engine with dynamic velocity fields,
 * cinematic vortex morphing states, and creature-specific color grading.
 */
import * as THREE from 'three';

// ── Smooth noise for organic flow ──────────────────────────────────
function hash(x, y) {
  let h = ((x * 374761393 + y * 668265263) | 0);
  h = ((h ^ (h >> 13)) * 1274126177) | 0; return (h & 0x7fffffff) / 2147483647;
}
function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x, y) {
  return smoothNoise(x, y) * 0.6 + smoothNoise(x * 2.1, y * 2.1) * 0.3 + smoothNoise(x * 4.3, y * 4.3) * 0.1;
}

// ── Config ─────────────────────────────────────────────────────────
const EMITTED_COUNT = 800;   // Increased density for cinematic feel
const AMBIENT_MID = 200;     
const AMBIENT_FAR = 400;     
const TRAIL_MAX = 80;

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    
    // Smooth target colors for creature transition
    this.currentColor = new THREE.Vector3(0.0, 1.0, 0.8); // Teal
    this.targetColorDF = new THREE.Vector3(0.0, 1.0, 0.8);
    this.targetColorBF = new THREE.Vector3(0.8, 0.2, 1.0); // Pink/Purple
    
    this._buildEmittedParticles();
    this._buildAmbientLayers();
    this._buildTrail();
    this.emitHead = 0;
  }

  _makeStarTexture() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;

    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
    grd.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grd.addColorStop(0.05, 'rgba(200, 255, 245, 0.85)');
    grd.addColorStop(0.15, 'rgba(100, 220, 200, 0.25)');
    grd.addColorStop(0.35, 'rgba(30, 80, 70, 0.03)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  _buildEmittedParticles() {
    const starTex = this._makeStarTexture();
    const geo = new THREE.BufferGeometry();

    const positions = new Float32Array(EMITTED_COUNT * 3);
    const sizes = new Float32Array(EMITTED_COUNT);
    const lifetimes = new Float32Array(EMITTED_COUNT);
    const phases = new Float32Array(EMITTED_COUNT);
    const pTypes = new Float32Array(EMITTED_COUNT); // 0=dust, 1=sparkle, 2=accent

    for (let i = 0; i < EMITTED_COUNT; i++) {
      positions[i * 3 + 2] = -100;
      lifetimes[i] = 0;
      phases[i] = Math.random() * Math.PI * 2;
      
      const roll = Math.random();
      if (roll < 0.6) {
        pTypes[i] = 0.0; // Dust (micro)
        sizes[i] = 0.15 + Math.random() * 0.2;
      } else if (roll < 0.9) {
        pTypes[i] = 1.0; // Sparkle (mid)
        sizes[i] = 0.5 + Math.random() * 0.5;
      } else {
        pTypes[i] = 2.0; // Accent (large, bright)
        sizes[i] = 1.0 + Math.random() * 0.6;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('pType', new THREE.BufferAttribute(pTypes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTexture: { value: starTex },
        uTime: { value: 0 },
        uBaseColor: { value: this.currentColor },
      },
      vertexShader: `
        attribute float size;
        attribute float lifetime;
        attribute float phase;
        attribute float pType;
        uniform float uTime;
        uniform vec3 uBaseColor;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float hueShift = sin(phase) * 0.05;
          vColor = uBaseColor + vec3(hueShift, hueShift*0.5, -hueShift);
          if (pType > 1.5) vColor += vec3(0.5); // Accents are whiter
          
          float fadeIn = smoothstep(0.0, 0.15, lifetime);
          float fadeOut = smoothstep(0.0, 0.3, 1.0 - lifetime);
          
          float twinkle = 1.0;
          if (pType > 0.5) {
            twinkle = sin(uTime * (4.0 + phase) + phase * 6.28) * 0.4 + 0.6;
            twinkle = pow(twinkle, 3.0);
          }
          
          vAlpha = fadeIn * fadeOut * twinkle * (pType < 0.5 ? 0.4 : 0.85);
          
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          
          // Size depth perspective
          float s = size * lifetime * (45.0 / -mvPos.z);
          
          gl_PointSize = max(s, 0.3);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          if (tex.a < 0.01) discard;
          gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
        }
      `,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.emitted = new THREE.Points(geo, mat);
    this.scene.add(this.emitted);

    this.emitVelocities = Array.from({ length: EMITTED_COUNT }, () => new THREE.Vector3());
    this.emitAges = new Float32Array(EMITTED_COUNT);
    this.emitMaxAge = new Float32Array(EMITTED_COUNT);
  }

  _buildAmbientLayers() {
    const starTex = this._makeStarTexture();
    this.ambientLayers = [];

    const configs = [
      { count: AMBIENT_MID, sizeRange: [0.08, 0.3], spread: 1.8, depthRange: [-1.0, -0.2], alpha: 0.3 },
      { count: AMBIENT_FAR, sizeRange: [0.03, 0.12], spread: 3.5, depthRange: [-3.0, -1.0], alpha: 0.15 },
    ];

    for (const cfg of configs) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(cfg.count * 3);
      const sizes = new Float32Array(cfg.count);
      const phases = new Float32Array(cfg.count);

      for (let i = 0; i < cfg.count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * cfg.spread;
        positions[i * 3 + 1] = (Math.random() - 0.5) * cfg.spread * 0.7;
        positions[i * 3 + 2] = cfg.depthRange[0] + Math.random() * (cfg.depthRange[1] - cfg.depthRange[0]);
        sizes[i] = cfg.sizeRange[0] + Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]);
        phases[i] = Math.random() * Math.PI * 2;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTexture: { value: starTex },
          uTime: { value: 0 },
          uBaseAlpha: { value: cfg.alpha },
          uBaseColor: { value: this.currentColor }
        },
        vertexShader: `
          attribute float size;
          attribute float phase;
          uniform float uTime;
          uniform float uBaseAlpha;
          uniform vec3 uBaseColor;
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vColor = uBaseColor * 0.5 + vec3(0.3); // Ambient takes on some tint
            float twinkle = sin(uTime * (1.5 + phase * 0.5) + phase * 6.28) * 0.5 + 0.5;
            twinkle = pow(twinkle, 5.0);
            vAlpha = uBaseAlpha * (0.05 + twinkle * 0.95);
            vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = max(size * (40.0 / -mvPos.z), 0.2);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform sampler2D uTexture;
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vec4 tex = texture2D(uTexture, gl_PointCoord);
            if (tex.a < 0.01) discard;
            gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
          }
        `,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      });

      const points = new THREE.Points(geo, mat);
      this.scene.add(points);
      this.ambientLayers.push({ points, mat });
    }
  }

  _buildTrail() {
    const starTex = this._makeStarTexture();
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_MAX * 3);
    const sizes = new Float32Array(TRAIL_MAX);
    const alphas = new Float32Array(TRAIL_MAX);

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTexture: { value: starTex }, uBaseColor: { value: this.currentColor } },
      vertexShader: `
        attribute float size; attribute float alpha;
        uniform vec3 uBaseColor;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vAlpha = alpha; vColor = uBaseColor;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (30.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(uTexture, gl_PointCoord);
          if (tex.a < 0.01) discard;
          gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha * 0.35);
        }
      `,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.trail = new THREE.Points(geo, mat);
    this.trailHead = 0;
    this.scene.add(this.trail);
  }

  triggerBurst(position) {
    const posArr = this.emitted.geometry.attributes.position.array;
    const lifetimes = this.emitted.geometry.attributes.lifetime.array;
    const sizes = this.emitted.geometry.attributes.size.array;

    for (let b = 0; b < 25; b++) {
      const idx = this.emitHead % EMITTED_COUNT;
      this.emitHead++;

      posArr[idx * 3] = position.x;
      posArr[idx * 3 + 1] = position.y;
      posArr[idx * 3 + 2] = position.z;
      lifetimes[idx] = 1.0;
      sizes[idx] = 0.5 + Math.random() * 1.0;
      this.emitAges[idx] = 0;
      this.emitMaxAge[idx] = 0.8 + Math.random() * 1.2;

      const dir = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5))
        .normalize().multiplyScalar(0.008 + Math.random() * 0.015);
      this.emitVelocities[idx].copy(dir);
    }
  }

  update(time, delta, insectPos, emissionPoints, pinchAmount, activeType, isTransforming, morphState) {
    // ── Update Color Grading based on Creature ─────────────────
    const targetCol = activeType === 'dragonfly' ? this.targetColorDF : this.targetColorBF;
    this.currentColor.lerp(targetCol, 0.05);
    
    this.emitted.material.uniforms.uTime.value = time;
    this.emitted.material.uniforms.uBaseColor.value.copy(this.currentColor);
    
    for (const layer of this.ambientLayers) {
      layer.mat.uniforms.uTime.value = time;
      layer.mat.uniforms.uBaseColor.value.copy(this.currentColor);
    }
    this.trail.material.uniforms.uBaseColor.value.copy(this.currentColor);

    // ── Spawn Particles ─────────────────────────────────────────
    let emitMultiplier = 1;
    if (isTransforming) {
      if (morphState === 1) emitMultiplier = 3;  // Energy build up
      if (morphState === 2) emitMultiplier = 8;  // Heavy dissolve emission
      if (morphState === 3) emitMultiplier = 5;  // Swirl reformation
    }
    
    const emitRate = (8 + pinchAmount * 12) * emitMultiplier;
    
    if (emissionPoints) {
      for (let e = 0; e < Math.floor(emitRate); e++) {
        const idx = this.emitHead % EMITTED_COUNT;
        this.emitHead++;

        // During dissolve, spawn directly from body center to simulate shattering
        let spawnPos;
        if (isTransforming && morphState >= 2) {
          spawnPos = emissionPoints.bodyCenter.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1,
            (Math.random() - 0.5) * 0.1
          ));
        } else {
          const sourceRoll = Math.random();
          if (sourceRoll < 0.6 && emissionPoints.wingTips.length > 0) {
            const tip = emissionPoints.wingTips[Math.floor(Math.random() * emissionPoints.wingTips.length)];
            spawnPos = tip.clone().add(new THREE.Vector3((Math.random()-0.5)*0.005, (Math.random()-0.5)*0.005, (Math.random()-0.5)*0.005));
          } else if (sourceRoll < 0.9) {
            spawnPos = emissionPoints.bodyCenter.clone().add(new THREE.Vector3((Math.random()-0.5)*0.008, (Math.random()-0.5)*0.008, (Math.random()-0.5)*0.008));
          } else {
            spawnPos = emissionPoints.tailTip.clone().add(new THREE.Vector3((Math.random()-0.5)*0.004, (Math.random()-0.5)*0.004, (Math.random()-0.5)*0.004));
          }
        }

        const posArr = this.emitted.geometry.attributes.position.array;
        const lifetimes = this.emitted.geometry.attributes.lifetime.array;

        posArr[idx * 3] = spawnPos.x;
        posArr[idx * 3 + 1] = spawnPos.y;
        posArr[idx * 3 + 2] = spawnPos.z;
        lifetimes[idx] = 1.0;
        this.emitAges[idx] = 0;
        this.emitMaxAge[idx] = isTransforming ? (1.0 + Math.random() * 1.5) : (2.0 + Math.random() * 3.0);

        // Initial Velocity
        if (isTransforming && morphState === 2) {
           // Explosive expansion
           const dir = spawnPos.clone().sub(insectPos).normalize();
           this.emitVelocities[idx].set(dir.x * 0.015, dir.y * 0.015, dir.z * 0.015);
        } else {
           const dir = spawnPos.clone().sub(insectPos).normalize();
           this.emitVelocities[idx].set(dir.x * 0.002, dir.y * 0.001, dir.z * 0.002);
        }
      }
    }

    // ── Update Movement (Vortex & Flow Fields) ─────────────────
    const posArr = this.emitted.geometry.attributes.position.array;
    const lifetimes = this.emitted.geometry.attributes.lifetime.array;

    for (let i = 0; i < EMITTED_COUNT; i++) {
      if (lifetimes[i] <= 0) continue;

      this.emitAges[i] += delta;
      lifetimes[i] = Math.max(0, 1.0 - (this.emitAges[i] / this.emitMaxAge[i]));
      if (lifetimes[i] <= 0) { posArr[i * 3 + 2] = -100; continue; }

      const ix = i * 3, iy = i * 3 + 1, iz = i * 3 + 2;
      const p = new THREE.Vector3(posArr[ix], posArr[iy], posArr[iz]);
      const toInsect = insectPos.clone().sub(p);
      const dist = toInsect.length();

      // Advanced Flow Logic
      if (isTransforming) {
        if (morphState === 1) { // Energy pull
           this.emitVelocities[i].add(toInsect.normalize().multiplyScalar(0.0005));
        } else if (morphState >= 2) { // Vortex Swirl
           const up = new THREE.Vector3(0, 1, 0);
           const tangent = toInsect.clone().cross(up).normalize();
           // Spiral inwards and up
           this.emitVelocities[i].add(tangent.multiplyScalar(0.0015)); // Orbit
           this.emitVelocities[i].y += 0.0002; // Updraft
           if (dist > 0.05) this.emitVelocities[i].add(toInsect.normalize().multiplyScalar(0.0008)); // Pull
        }
      } else {
        // Normal Organic Flow Field
        const nx = fbm(p.y * 4 + time * 0.3, p.z * 4) - 0.5;
        const ny = fbm(p.z * 4 + time * 0.3, p.x * 4) - 0.5;
        const nz = fbm(p.x * 4 + time * 0.3, p.y * 4) - 0.5;

        // Butterfly moves slower, driftier
        const mag = activeType === 'butterfly' ? 0.00004 : 0.00008;
        this.emitVelocities[i].x += nx * mag;
        this.emitVelocities[i].y += ny * mag - 0.00001; 
        this.emitVelocities[i].z += nz * mag;
      }

      this.emitVelocities[i].multiplyScalar(0.985); // drag
      posArr[ix] += this.emitVelocities[i].x;
      posArr[iy] += this.emitVelocities[i].y;
      posArr[iz] += this.emitVelocities[i].z;
    }

    this.emitted.geometry.attributes.position.needsUpdate = true;
    this.emitted.geometry.attributes.lifetime.needsUpdate = true;

    // ── Trail Update ───────────────────────────────────────────
    const tPos = this.trail.geometry.attributes.position.array;
    const tSizes = this.trail.geometry.attributes.size.array;
    const tAlphas = this.trail.geometry.attributes.alpha.array;

    const tidx = this.trailHead % TRAIL_MAX;
    tPos[tidx * 3] = insectPos.x + (Math.random() - 0.5) * 0.002;
    tPos[tidx * 3 + 1] = insectPos.y + (Math.random() - 0.5) * 0.002;
    tPos[tidx * 3 + 2] = insectPos.z + (Math.random() - 0.5) * 0.002;
    tSizes[tidx] = 0.3 + pinchAmount * 0.4;
    tAlphas[tidx] = 0.5;
    this.trailHead++;

    for (let i = 0; i < TRAIL_MAX; i++) {
      tSizes[i] *= 0.96;
      tAlphas[i] *= 0.95;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
    this.trail.geometry.attributes.size.needsUpdate = true;
    this.trail.geometry.attributes.alpha.needsUpdate = true;
  }
}
