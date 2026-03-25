/**
 * Post-Processing — Bloom/glow pipeline
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function createPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);

  // Main render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom / glow pass
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.35,  // strength — subtle glow on brightest elements
    0.2,   // radius — tight, crisp
    0.65   // threshold — catches insect highlights
  );
  composer.addPass(bloomPass);

  // Output pass (tone mapping + color space)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return { composer, bloomPass };
}
