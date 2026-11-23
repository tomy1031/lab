// engine/renderer.js — WebGL renderer with three quality levels (pixel ratio, shadows, draw distance).
import * as THREE from 'three';

export const QUALITY = {
  high: { pixel: 1.5, shadows: true, shadowSize: 2048, terrainSeg: 320, flora: 'high', far: 1600 },
  mid: { pixel: 1.0, shadows: true, shadowSize: 1024, terrainSeg: 256, flora: 'mid', far: 1300 },
  low: { pixel: 0.75, shadows: false, shadowSize: 512, terrainSeg: 160, flora: 'low', far: 1000 },
};

export class Renderer {
  constructor(canvas, quality = 'high') {
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 1600);
    this.setQuality(quality);
    addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.qname = QUALITY[q] ? q : 'high';
    this.q = QUALITY[this.qname];
    this.r.shadowMap.enabled = this.q.shadows;
    this.camera.far = this.q.far;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.r.setPixelRatio(Math.min(devicePixelRatio || 1, this.q.pixel));
    this.r.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(scene) {
    this.r.render(scene, this.camera);
  }

  get info() { return this.r.info.render; }
}
