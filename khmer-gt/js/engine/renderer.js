// js/engine/renderer.js — Three.js WebGLRenderer with ACES tone mapping, high-res Sky IBL reflections & Quest 3S perf stats
import * as THREE from 'three';
import { getSkyEquirectTexture } from './textures.js';

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.r.setSize(window.innerWidth, window.innerHeight, false);
    this.r.toneMapping = THREE.ACESFilmicToneMapping;
    this.r.toneMappingExposure = 1.15;
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.12, 1800);
    this.scene.add(this.camera);

    this.pmrem = new THREE.PMREMGenerator(this.r);
    this.pmrem.compileEquirectangularShader();
    this.envRT = null;

    this.onResize = () => {
      if (this.r.xr.isPresenting) return;
      const w = window.innerWidth;
      const h = Math.max(1, window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.r.setSize(w, h, false);
    };
    window.addEventListener('resize', this.onResize);
  }

  // Generate crisp PMREM Image-Based Lighting from the high-res 1024x512 procedural Sky + Clouds + Sun/Neon map
  updateEnvironment(course) {
    const skyTex = getSkyEquirectTexture(course);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromEquirectangular(skyTex);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = course.isCyber ? 1.35 : 1.15;
    this.r.toneMappingExposure = course.isCyber ? 1.24 : 1.08;
  }

  getPerfStats() {
    const info = this.r.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  render() {
    this.r.render(this.scene, this.camera);
  }
}
