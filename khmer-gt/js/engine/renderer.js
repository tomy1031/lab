// js/engine/renderer.js — Three.js WebGLRenderer, ACES tone mapping, dynamic PMREM environment reflection, resize handling
import * as THREE from 'three';

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
    this.r.toneMappingExposure = 1.12;
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.12, 1600);
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

  // Generate an equirectangular procedural sky + neon/sunlight reflection map for glossy GT car paint
  updateEnvironment(course) {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const ctx = cv.getContext('2d');
    const s = course.sky;

    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, s.top);
    grad.addColorStop(0.36, s.mid);
    grad.addColorStop(0.50, s.horizon);
    grad.addColorStop(0.54, s.ground);
    grad.addColorStop(1.0, '#090b10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 128);

    // Sun or Cyber Neon specular highlights in reflection map
    if (course.isCyber) {
      const streaks = [
        [45, 58, 70, 6, 'rgba(0, 240, 255, 0.9)'],
        [150, 52, 65, 5, 'rgba(255, 31, 122, 0.85)'],
        [20, 42, 40, 4, 'rgba(255, 196, 0, 0.7)'],
        [210, 60, 40, 6, 'rgba(0, 240, 255, 0.8)'],
      ];
      for (const [x, y, w, h, col] of streaks) {
        ctx.fillStyle = col;
        ctx.fillRect(x, y, w, h);
      }
    } else {
      const sunGrad = ctx.createRadialGradient(190, 48, 2, 190, 48, 36);
      sunGrad.addColorStop(0, '#ffffff');
      sunGrad.addColorStop(0.25, s.sunColor);
      sunGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sunGrad;
      ctx.fillRect(140, 10, 100, 80);
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;

    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromEquirectangular(tex);
    tex.dispose();
    this.scene.environment = this.envRT.texture;
    this.r.toneMappingExposure = course.isCyber ? 1.28 : 1.12;
  }

  render() {
    this.r.render(this.scene, this.camera);
  }
}
