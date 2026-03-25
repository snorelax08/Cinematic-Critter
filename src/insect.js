/**
 * CreatureManager — Manages the Dragonfly, Butterfly, and the cinematic morphing transition between them.
 */
import * as THREE from 'three';

class Dragonfly {
  constructor(manager) {
    this.manager = manager;
    this.group = new THREE.Group();
    this.wingAngle = 0;
    this.wingSpeed = 25;
    
    this._emissionPoints = { wingTips: [], bodyCenter: new THREE.Vector3(), tailTip: new THREE.Vector3() };
    this._build();
  }

  _build() {
    this._buildThorax();
    this._buildAbdomen();
    this._buildHead();
    this._buildWings();
    this._buildTailGlow();
  }

  _buildThorax() {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0x0d6050, emissive: 0x00ccaa, emissiveIntensity: 0.3,
      metalness: 0.65, roughness: 0.12, transparent: true, opacity: 0.88, clearcoat: 1.0,
    });
    const geo = new THREE.CapsuleGeometry(0.09, 0.18, 12, 16);
    geo.rotateX(Math.PI / 2);
    this.thorax = new THREE.Mesh(geo, mat);
    this.group.add(this.thorax);
  }

  _buildAbdomen() {
    this.abdomenSegments = [];
    const baseMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a5545, emissive: 0x00bbaa, emissiveIntensity: 0.2,
      metalness: 0.6, roughness: 0.15, transparent: true, opacity: 0.85, clearcoat: 0.8,
    });
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const geo = new THREE.CapsuleGeometry(0.07 * (1 - t * 0.72), 0.08, 8, 8);
      geo.rotateX(Math.PI / 2);
      const mat = baseMat.clone();
      mat.emissiveIntensity = (i % 2 === 0) ? 0.15 + t * 0.15 : 0.25 + t * 0.15;
      mat.emissive = (i % 2 === 0) ? new THREE.Color(0x00aa88) : new THREE.Color(0x00ddbb);
      const seg = new THREE.Mesh(geo, mat);
      seg.position.set(0, -i * 0.003, 0.2 + i * 0.11);
      this.group.add(seg);
      this.abdomenSegments.push(seg);
    }
  }

  _buildHead() {
    const headMat = new THREE.MeshPhysicalMaterial({
      color: 0x0a6050, emissive: 0x22ddbb, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.1, clearcoat: 1.0,
    });
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), headMat);
    this.head.position.set(0, 0.02, -0.18);
    this.group.add(this.head);

    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x114840, emissive: 0x55ffdd, emissiveIntensity: 0.4,
      metalness: 0.8, roughness: 0.05, clearcoat: 1.0, iridescence: 0.8,
    });
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), eyeMat.clone());
      eye.position.set(0.045 * side, 0.035, -0.22);
      eye.scale.set(1.1, 1.0, 0.8);
      this.group.add(eye);
      this.eyes.push(eye);
    }
  }

  _buildWings() {
    this.forePivot = new THREE.Group(); this.forePivot.position.set(0, 0.06, -0.04); this.group.add(this.forePivot);
    this.hindPivot = new THREE.Group(); this.hindPivot.position.set(0, 0.06, 0.06); this.group.add(this.hindPivot);

    const wingMat = new THREE.MeshPhysicalMaterial({
      color: 0xbbffee, emissive: 0x44ffcc, emissiveIntensity: 0.2,
      metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, clearcoat: 0.6, iridescence: 1.0, depthWrite: false, blending: THREE.AdditiveBlending,
    });

    this.foreWings = [];
    for (const side of [-1, 1]) {
      const { mesh, tipMarker } = this._createWing(1.1, 0.22, side, wingMat);
      this.forePivot.add(mesh);
      this.foreWings.push({ mesh, side, tipMarker });
    }
    this.hindWings = [];
    for (const side of [-1, 1]) {
      const { mesh, tipMarker } = this._createWing(0.9, 0.2, side, wingMat);
      this.hindPivot.add(mesh);
      this.hindWings.push({ mesh, side, tipMarker });
    }
  }

  _createWing(L, W, s, baseMat) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(L*0.1*s, W*0.4, L*0.25*s, W*0.9, L*0.4*s, W*0.85);
    shape.bezierCurveTo(L*0.6*s, W*0.65, L*0.8*s, W*0.3, L*s, W*0.05);
    shape.bezierCurveTo(L*0.85*s, -W*0.1, L*0.6*s, -W*0.15, L*0.35*s, -W*0.12);
    shape.bezierCurveTo(L*0.15*s, -W*0.06, L*0.05*s, -W*0.02, 0, 0);

    const geo = new THREE.ShapeGeometry(shape, 16);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, baseMat.clone());

    const veins = new THREE.Group();
    veins.rotation.x = -Math.PI / 2;
    const veinMat = new THREE.LineBasicMaterial({ color: 0x55ddbb, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending });
    veins.add(this._veinLine([[0,0], [L*0.25*s, W*0.1], [L*0.5*s, W*0.08], [L*0.75*s, W*0.05], [L*s, W*0.05]], veinMat));
    mesh.add(veins);

    const tipMarker = new THREE.Object3D();
    tipMarker.position.set(L * 0.95 * s, 0, W * 0.05);
    mesh.add(tipMarker);

    return { mesh, tipMarker };
  }

  _veinLine(pts2d, material) {
    const points = pts2d.map(p => new THREE.Vector3(p[0], p[1], 0.001));
    const geo = new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(points).getPoints(16));
    return new THREE.Line(geo, material);
  }

  _buildTailGlow() {
    const canvas = document.createElement('canvas');
    canvas.width = 32; canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(80, 255, 200, 0.5)');
    grd.addColorStop(0.25, 'rgba(40, 180, 140, 0.15)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 32, 32);
    
    this.tailGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), color: 0x44ffbb, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.tailGlow.scale.setScalar(0.08);
    this.group.add(this.tailGlow);

    this.tailLight = new THREE.PointLight(0x00ffaa, 0.25, 0.4);
    this.group.add(this.tailLight);
  }

  setOpacityMultiplier(mult) {
    this.thorax.material.opacity = 0.88 * mult;
    this.head.material.opacity = 0.8 * mult;
    this.eyes.forEach(e => e.material.opacity = 0.9 * mult);
    this.abdomenSegments.forEach((seg, i) => seg.material.opacity = 0.85 * mult);
    this.foreWings.concat(this.hindWings).forEach(w => {
      // Base opacity varies with speed, mult is applied on top during update
      w.opacityMult = mult;
    });
    this.tailGlow.material.opacity = 0.35 * mult;
    this.tailLight.intensity = 0.25 * mult;
  }

  update(time, delta, moveSpeed, pinchAmount, globalMult) {
    const flapFreq = this.wingSpeed + moveSpeed * 6 + pinchAmount * 3;
    this.wingAngle += delta * flapFreq;

    const BASE_TILT = -0.35;
    const HIND_PHASE = Math.PI / 3;

    // Forewings
    const foreFlap = Math.sin(this.wingAngle) * 0.6;
    const forePitch = Math.cos(this.wingAngle) * 0.25;
    for (const fw of this.foreWings) {
      fw.mesh.rotation.z = foreFlap * fw.side;
      fw.mesh.rotation.x = forePitch;
      fw.mesh.rotation.y = BASE_TILT;
      const angularVel = Math.abs(Math.cos(this.wingAngle));
      fw.mesh.material.opacity = (0.15 + (1 - angularVel) * 0.3 + pinchAmount * 0.1) * (fw.opacityMult ?? 1);
      fw.mesh.material.emissiveIntensity = 0.1 + angularVel * 0.1;
    }

    // Hindwings
    const hindFlap = Math.sin(this.wingAngle + HIND_PHASE) * 0.55;
    const hindPitch = Math.cos(this.wingAngle + HIND_PHASE) * 0.22;
    for (const hw of this.hindWings) {
      hw.mesh.rotation.z = hindFlap * hw.side;
      hw.mesh.rotation.x = hindPitch;
      hw.mesh.rotation.y = BASE_TILT;
      const angularVel = Math.abs(Math.cos(this.wingAngle + HIND_PHASE));
      hw.mesh.material.opacity = (0.15 + (1 - angularVel) * 0.3 + pinchAmount * 0.1) * (hw.opacityMult ?? 1);
      hw.mesh.material.emissiveIntensity = 0.1 + angularVel * 0.1;
    }

    // Abdomen wave
    for (let i = 0; i < this.abdomenSegments.length; i++) {
      this.abdomenSegments[i].position.x = Math.sin(time * 1.8 + i * 0.5) * 0.003 * (1 + i * 0.15);
      this.abdomenSegments[i].position.y = -i * 0.003 + Math.sin(time * 2.0 + i * 0.6) * 0.002 * (1 + i * 0.1);
    }

    const lastSeg = this.abdomenSegments[this.abdomenSegments.length - 1];
    this.tailGlow.position.copy(lastSeg.position);
    this.tailGlow.position.z += 0.06;
    this.tailLight.position.copy(this.tailGlow.position);

    // Update Emission Points
    this._emissionPoints.wingTips = [];
    for (const fw of this.foreWings) {
      const p = new THREE.Vector3(); fw.tipMarker.getWorldPosition(p); this._emissionPoints.wingTips.push(p);
    }
    for (const hw of this.hindWings) {
      const p = new THREE.Vector3(); hw.tipMarker.getWorldPosition(p); this._emissionPoints.wingTips.push(p);
    }
    this.thorax.getWorldPosition(this._emissionPoints.bodyCenter);
    lastSeg.getWorldPosition(this._emissionPoints.tailTip);
  }

  getEmissionPoints() { return this._emissionPoints; }
}

class Butterfly {
  constructor(manager) {
    this.manager = manager;
    this.group = new THREE.Group();
    this.wingAngle = 0;
    
    this._emissionPoints = { wingTips: [], bodyCenter: new THREE.Vector3(), tailTip: new THREE.Vector3() };
    this._build();
  }

  _build() {
    this._buildBody();
    this._buildWings();
  }

  _buildBody() {
    // Shorter, softer body, emissive core, purple/pink theme
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0x220530, emissive: 0x5a1b88, emissiveIntensity: 0.4,
      metalness: 0.2, roughness: 0.8, transparent: true, opacity: 0.9,
    });
    
    const geo = new THREE.CapsuleGeometry(0.06, 0.25, 12, 16);
    geo.rotateX(Math.PI / 2);
    this.body = new THREE.Mesh(geo, bodyMat);
    this.group.add(this.body);

    // Antennae (curved lines)
    const antMat = new THREE.LineBasicMaterial({ color: 0xaabbff, transparent: true, opacity: 0.6 });
    for (const side of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.02 * side, 0.06, -0.1),
        new THREE.Vector3(0.08 * side, 0.12, -0.2),
        new THREE.Vector3(0.12 * side, 0.15, -0.25),
      ]);
      const antGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(10));
      this.group.add(new THREE.Line(antGeo, antMat));
    }
    
    this.bodyLight = new THREE.PointLight(0xcc66ff, 0.3, 0.6);
    this.group.add(this.bodyLight);
  }

  _buildWings() {
    this.forePivot = new THREE.Group(); this.forePivot.position.set(0, 0.05, -0.05); this.group.add(this.forePivot);
    this.hindPivot = new THREE.Group(); this.hindPivot.position.set(0, 0.05, 0.05); this.group.add(this.hindPivot);

    // Highly detailed transmission material for wings
    const wingMat = new THREE.MeshPhysicalMaterial({
      color: 0x330f55, emissive: 0x6611cc, emissiveIntensity: 0.15,
      metalness: 0.1, roughness: 0.2, transmission: 0.8, thickness: 0.05, // Glass-like scattering
      transparent: true, opacity: 0.85, side: THREE.DoubleSide, iridescence: 1.0, iridescenceIOR: 1.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    });

    this.foreWings = [];
    for (const side of [-1, 1]) {
      // Large broad upper wings
      const { mesh, tipMarker } = this._createWing(1.4, 1.0, side, wingMat, true);
      this.forePivot.add(mesh);
      this.foreWings.push({ mesh, side, tipMarker });
    }
    this.hindWings = [];
    for (const side of [-1, 1]) {
      // Rounded lower wings
      const { mesh, tipMarker } = this._createWing(1.1, 0.9, side, wingMat, false);
      this.hindPivot.add(mesh);
      this.hindWings.push({ mesh, side, tipMarker });
    }
  }

  _createWing(L, W, s, baseMat, isFore) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    if (isFore) {
      // Broad triangular forewing
      shape.bezierCurveTo(L*0.2*s, W*0.8, L*0.6*s, W*1.0, L*s, W*0.8); // Top edge
      shape.bezierCurveTo(L*1.1*s, W*0.4, L*0.8*s, -W*0.1, L*0.2*s, -W*0.2); // Outer to bottom
      shape.lineTo(0,0);
    } else {
      // Rounded hindwing
      shape.bezierCurveTo(L*0.4*s, W*0.2, L*0.9*s, W*0.1, L*s, -W*0.4);
      shape.bezierCurveTo(L*0.8*s, -W*0.9, L*0.3*s, -W*1.0, L*0.1*s, -W*0.3);
      shape.lineTo(0,0);
    }

    const geo = new THREE.ShapeGeometry(shape, 32);
    geo.rotateX(-Math.PI / 2);

    // Micro-imperfections: warp the geometry slightly for organic feel
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        // Subtle z-warp based on x/y to give the wing a slight cup/bend
        const x = pos.getX(i);
        const z = pos.getZ(i);
        pos.setY(i, Math.sin(x*3) * Math.cos(z*3) * 0.04);
    }
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, baseMat.clone());

    // Veins
    const veins = new THREE.Group();
    veins.rotation.x = -Math.PI / 2;
    const veinMat = new THREE.LineBasicMaterial({ color: 0xffaadd, transparent: true, opacity: 0.15 });
    // Radiating veins from base
    const numVeins = isFore ? 6 : 5;
    for (let v = 1; v <= numVeins; v++) {
      const angle = isFore ? (v/numVeins) * 1.5 : -(v/numVeins) * 1.2;
      const r = isFore ? L * 0.9 : L * 0.8;
      veins.add(this._veinLine([[0,0], [Math.sin(angle)*r*0.5*s, Math.cos(angle)*W*0.5], [Math.sin(angle*1.1)*r*s, Math.cos(angle*1.1)*W]], veinMat));
    }
    mesh.add(veins);

    const tipMarker = new THREE.Object3D();
    if (isFore) tipMarker.position.set(L * 0.9 * s, 0, W * 0.7);
    else tipMarker.position.set(L * 0.9 * s, 0, -W * 0.4);
    mesh.add(tipMarker);

    return { mesh, tipMarker };
  }

  _veinLine(pts2d, material) {
    const points = pts2d.map(p => new THREE.Vector3(p[0], p[1], 0.005));
    const geo = new THREE.BufferGeometry().setFromPoints(new THREE.CatmullRomCurve3(points).getPoints(16));
    return new THREE.Line(geo, material);
  }

  setOpacityMultiplier(mult) {
    this.body.material.opacity = 0.9 * mult;
    this.bodyLight.intensity = 0.3 * mult;
    this.foreWings.concat(this.hindWings).forEach(w => {
      w.mesh.material.opacity = 0.85 * mult;       // Keep it fairly opaque for the rich colors
      w.mesh.material.emissiveIntensity = 0.15 * mult;
    });
  }

  update(time, delta, moveSpeed, pinchAmount, globalMult) {
    // Asymmetric, slow, graceful flap
    // Remap sine for fast downstroke, slow upstroke
    this.wingAngle += delta * (4 + moveSpeed * 2);
    let rawFlap = Math.sin(this.wingAngle);
    // Asymmetry trick: steepen the falling part
    const flap = rawFlap > 0 ? Math.pow(rawFlap, 1.5) : -Math.pow(-rawFlap, 0.5);

    const BASE_TILT = 0.1; // slight upward tilt for butterfly wings
    const HIND_LAG = 0.15; // very slight lag

    for (const fw of this.foreWings) {
      fw.mesh.rotation.z = flap * 0.9 * fw.side; 
      fw.mesh.rotation.x = Math.sin(this.wingAngle) * 0.1; // Minimal pitch
      fw.mesh.rotation.y = BASE_TILT;
      // Wing flex during flap
      fw.mesh.scale.x = 1 - Math.abs(flap) * 0.1;
    }

    const hindFlap = Math.sin(this.wingAngle - HIND_LAG) > 0 
      ? Math.pow(Math.sin(this.wingAngle - HIND_LAG), 1.5) 
      : -Math.pow(-Math.sin(this.wingAngle - HIND_LAG), 0.5);

    for (const hw of this.hindWings) {
      hw.mesh.rotation.z = hindFlap * 0.8 * hw.side;
      hw.mesh.rotation.x = Math.sin(this.wingAngle - HIND_LAG) * 0.1;
      hw.mesh.rotation.y = BASE_TILT;
      hw.mesh.scale.x = 1 - Math.abs(hindFlap) * 0.1;
    }

    // Body bobbing
    this.body.position.y = Math.sin(this.wingAngle * 2) * 0.02;

    this._emissionPoints.wingTips = [];
    for (const fw of this.foreWings) {
      const p = new THREE.Vector3(); fw.tipMarker.getWorldPosition(p); this._emissionPoints.wingTips.push(p);
    }
    for (const hw of this.hindWings) {
      const p = new THREE.Vector3(); hw.tipMarker.getWorldPosition(p); this._emissionPoints.wingTips.push(p);
    }
    this.body.getWorldPosition(this._emissionPoints.bodyCenter);
    this._emissionPoints.tailTip.copy(this._emissionPoints.bodyCenter); // Butterfly doesn't have a long tail
  }

  getEmissionPoints() { return this._emissionPoints; }
}

export class Insect { // Exporting as Insect to avoid touching main.js imports
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    // Use the 10x scale for both to be prominent
    this.group.scale.setScalar(0.14);
    scene.add(this.group);

    this.dragonfly = new Dragonfly(this);
    this.butterfly = new Butterfly(this);
    this.group.add(this.dragonfly.group);
    this.group.add(this.butterfly.group);

    this.activeType = 'dragonfly';
    this.butterfly.group.visible = false;
    this.dragonfly.setOpacityMultiplier(1.0);
    this.butterfly.setOpacityMultiplier(0.0);

    this.targetPos = new THREE.Vector3(0, 0.3, 0);
    this.currentPos = new THREE.Vector3(0, 0.3, 0);
    
    // Cinematic Morphing State
    this.isTransforming = false;
    this.transitionTimer = 0;
    this.transitionDuration = 1.0; // 1 second total
    this.morphState = 0; // 0: Idle, 1: Build-up, 2: Dissolve, 3: Swirl/Reform

    // Hover logic
    this.hoverPhase = 0;
  }

  setTarget(position) {
    if (position) {
      this.targetPos.copy(position);
      this.targetPos.y += 0.1;
    }
  }

  getActiveType() {
    return this.activeType;
  }

  triggerMorph() {
    if (this.isTransforming) return;
    this.isTransforming = true;
    this.transitionTimer = 0;
    this.nextType = this.activeType === 'dragonfly' ? 'butterfly' : 'dragonfly';
    console.log(`Morphing to ${this.nextType}...`);
  }

  update(time, delta, pinchAmount = 0) {
    const moveDir = this.targetPos.clone().sub(this.currentPos);
    const speed = moveDir.length();

    // Flight paths: Butterfly drifts more and curves, Dragonfly is direct
    if (this.activeType === 'butterfly') {
      // Gentle curved drifting + vertical bob
      this.targetPos.x += Math.sin(time * 0.5) * 0.05;
      this.targetPos.y += Math.sin(time * 1.2) * 0.02;
      this.currentPos.lerp(this.targetPos, 0.03); // Slower following
      
      // Face direction but retain uprightness
      if (speed > 0.001) {
        const targetYaw = Math.atan2(moveDir.x, moveDir.z);
        this.group.rotation.y += (targetYaw - this.group.rotation.y) * 0.02;
      }
      // Slight bank on turn
      this.group.rotation.z = -moveDir.x * 0.5;
      this.group.rotation.x = Math.sin(time) * 0.05; // Gentle pitch bob
    } else {
      // Dragonfly
      this.currentPos.lerp(this.targetPos, 0.06); // Fast strict following
      this.hoverPhase += delta * 2.0;
      this.group.position.y += Math.sin(this.hoverPhase) * 0.008;
      this.group.position.x += Math.sin(this.hoverPhase * 0.5 + 1.2) * 0.003;

      if (speed > 0.001) {
        const targetYaw = Math.atan2(moveDir.x, moveDir.z);
        this.group.rotation.y += (targetYaw - this.group.rotation.y) * 0.04;
      }
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, -moveDir.y * 0.4, 0.05);
      this.group.rotation.z = 0;
    }

    this.group.position.copy(this.currentPos);

    // ── Morphing State Machine ───────────────────────────────────
    let dfMult = this.activeType === 'dragonfly' ? 1 : 0;
    let bfMult = this.activeType === 'butterfly' ? 1 : 0;

    if (this.isTransforming) {
      this.transitionTimer += delta;
      const t = this.transitionTimer / this.transitionDuration; // 0.0 to 1.0

      if (t < 0.3) {
        // Stage 1: Energy Build-up (0.0 to 0.3)
        // Handled by particles.js (we pass isTransforming flag)
        this.morphState = 1;
      } else if (t < 0.6) {
        // Stage 2: Dissolve (0.3 to 0.6)
        this.morphState = 2;
        const fadeOut = 1 - ((t - 0.3) / 0.3); // 1 to 0
        if (this.activeType === 'dragonfly') dfMult = fadeOut;
        else bfMult = fadeOut;
      } else if (t < 0.9) {
        // Stage 3 & 4: Swirl & Reformation (0.6 to 0.9)
        this.morphState = 3;
        // Make the NEW creature visible and fade in
        if (this.nextType === 'dragonfly') this.dragonfly.group.visible = true;
        else this.butterfly.group.visible = true;

        const fadeIn = (t - 0.6) / 0.3; // 0 to 1
        if (this.nextType === 'dragonfly') {
          dfMult = fadeIn; bfMult = 0;
        } else {
          bfMult = fadeIn; dfMult = 0;
        }
      } else if (t >= 1.0) {
        // Complete
        this.activeType = this.nextType;
        this.isTransforming = false;
        dfMult = this.activeType === 'dragonfly' ? 1 : 0;
        bfMult = this.activeType === 'butterfly' ? 1 : 0;
        
        this.dragonfly.group.visible = this.activeType === 'dragonfly';
        this.butterfly.group.visible = this.activeType === 'butterfly';
        this.morphState = 0;
      }

      // Add a jitter effect during dissolve/reform
      if (this.morphState === 2 || this.morphState === 3) {
         this.group.position.x += (Math.random() - 0.5) * 0.02;
         this.group.position.y += (Math.random() - 0.5) * 0.02;
      }
    }

    this.dragonfly.setOpacityMultiplier(dfMult);
    this.butterfly.setOpacityMultiplier(bfMult);

    if (dfMult > 0) this.dragonfly.update(time, delta, speed, pinchAmount, dfMult);
    if (bfMult > 0) this.butterfly.update(time, delta, speed, pinchAmount, bfMult);
  }

  getPosition() {
    return this.group.position.clone();
  }

  getEmissionPoints() {
    // Return points for whoever is currently visible/active
    if (this.isTransforming && this.morphState >= 3) {
      return this.nextType === 'dragonfly' ? this.dragonfly.getEmissionPoints() : this.butterfly.getEmissionPoints();
    }
    return this.activeType === 'dragonfly' ? this.dragonfly.getEmissionPoints() : this.butterfly.getEmissionPoints();
  }
}
