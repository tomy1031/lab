// engine/renderer.js — WebGL renderer with optional bloom (EffectComposer) and three quality levels
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const QUALITY = {
  high: { pixel: 1.5, bloom: true, shadows: true, shadowSize: 2048 },
  mid: { pixel: 1.0, bloom: true, shadows: true, shadowSize: 1024 },
  low: { pixel: 0.75, bloom: false, shadows: false, shadowSize: 512 },
};

export class Renderer {
  constructor(canvas, quality = 'high') {
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    const pmrem = new THREE.PMREMGenerator(r);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene = null; this.camera = null;
    this.bloomCfg = { strength: 0.6, radius: 0.5, threshold: 0.85 };
    this.setQuality(quality);
    addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    const hadShadows = this.q ? this.q.shadows : null;
    this.qname = QUALITY[q] ? q : 'high';
    this.q = QUALITY[this.qname];
    this.r.shadowMap.enabled = this.q.shadows;
    this.buildComposer();
    this.resize();
    // recompiling every shader stalls the screen for a moment: only do it when shadows are switched
    if (this.scene && hadShadows !== null && hadShadows !== this.q.shadows) {
      this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.needsUpdate = true; } });
    }
    this.onQuality?.(this.q);
  }

  buildComposer() {
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (!this.q.bloom) return;
    const size = this.r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 });
    const c = this.composer = new EffectComposer(this.r, rt);
    this.renderPass = new RenderPass(this.scene || new THREE.Scene(), this.camera || new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), this.bloomCfg.strength, this.bloomCfg.radius, this.bloomCfg.threshold);
    c.addPass(this.renderPass);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
  }

  setScene(scene, camera, bloom = {}) {
    this.scene = scene; this.camera = camera;
    scene.environment = this.envMap;
    this.bloomCfg = { strength: 0.6, radius: 0.5, threshold: 0.85, ...bloom };
    if (this.composer) {
      this.renderPass.scene = scene; this.renderPass.camera = camera;
      this.bloom.strength = this.bloomCfg.strength; this.bloom.radius = this.bloomCfg.radius; this.bloom.threshold = this.bloomCfg.threshold;
    }
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.r.setPixelRatio(Math.min(devicePixelRatio || 1, this.q.pixel));
    this.r.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    if (this.composer) {
      this.composer.setPixelRatio(Math.min(devicePixelRatio || 1, this.q.pixel));
      this.composer.setSize(w, h);
    }
    this.onResize?.(h * Math.min(devicePixelRatio || 1, this.q.pixel));
  }

  render() {
    if (!this.scene || !this.camera) return;
    if (this.composer) this.composer.render();
    else this.r.render(this.scene, this.camera);
  }
}
