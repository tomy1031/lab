// js/core/renderer.js — WebGL renderer, scene, camera and rig (§10.14 step 4, §10.16, OPUS-A).
import * as THREE from 'three';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x9fd0f0, 1);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.domElement.id = 'aw-canvas';
  (container || document.body).appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.name = 'scene';
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / Math.max(1, window.innerHeight), 0.08, 3000);
  camera.name = 'camera';
  const rig = new THREE.Group();
  rig.name = 'rig';
  rig.add(camera);
  scene.add(rig);
  camera.position.set(0, 1.6, 0);

  function resize() {
    if (renderer.xr.isPresenting) return;
    const w = window.innerWidth, h = Math.max(1, window.innerHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  return { renderer, scene, camera, rig, resize };
}
