// js/sky.js — the sky dome (a gradient that deepens as you climb), the sun, haze that thins with altitude,
// and a few soft clouds around you.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.62, 0.64).normalize(); // from the south-west, mid-afternoon

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uZenith: { value: new THREE.Color(0x2f6fd0) },
      uHorizon: { value: new THREE.Color(0xc9def0) },
      uGround: { value: new THREE.Color(0x8aa2b4) },
      uSun: { value: SUN_DIR.clone() },
      uAlt: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith, uHorizon, uGround, uSun;
        uniform float uAlt;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          // the horizon dips as you climb
          float dip = -min(0.12, uAlt / 120000.0);
          float t = clamp((h - dip) / 0.45, 0.0, 1.0);
          vec3 zen = mix(uZenith, vec3(0.05, 0.16, 0.42), clamp(uAlt / 25000.0, 0.0, 1.0));
          vec3 col = mix(uHorizon, zen, pow(t, 0.55));
          if (h < dip) col = mix(uHorizon, uGround, clamp((dip - h) / 0.2, 0.0, 1.0));
          float s = max(dot(d, normalize(uSun)), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    scene.fog = new THREE.Fog(this.uniforms.uHorizon.value.clone(), 1000, 60000);
    this.clouds = this.makeClouds();
    scene.add(this.clouds);
  }

  makeClouds() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const px = 30 + Math.random() * 68, py = 40 + Math.random() * 48, r = 18 + Math.random() * 26;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const group = new THREE.Group();
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, opacity: 0.85 });
    this.cloudSeed = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(mat);
      const a = Math.random() * Math.PI * 2, d = 4000 + Math.random() * 26000;
      const y = 1800 + Math.random() * 2600;
      const w = 1500 + Math.random() * 2500;
      s.scale.set(w, w * 0.45, 1);
      s.userData.off = new THREE.Vector3(Math.cos(a) * d, y, Math.sin(a) * d);
      group.add(s);
    }
    group.renderOrder = 2;
    return group;
  }

  // camera world position, height above the sea
  update(cam, dt, showClouds = true) {
    this.dome.position.copy(cam);
    const alt = Math.max(0, cam.y);
    this.uniforms.uAlt.value = alt;
    // haze: close in near the ground, far away from high up
    const f = this.scene.fog;
    f.far = Math.min(450000, 45000 + alt * 22);
    f.near = f.far * 0.04;
    // clouds wrap around you (a field that slides with the camera, so you never fly out of it)
    this.clouds.visible = showClouds;
    if (showClouds) {
      const W = 60000;
      for (const s of this.clouds.children) {
        const o = s.userData.off;
        o.x += dt * 4; // a slow drift
        s.position.set(cam.x + ((((o.x - cam.x) % W) + W * 1.5) % W) - W / 2, o.y, cam.z + ((((o.z - cam.z) % W) + W * 1.5) % W) - W / 2);
      }
    }
  }

  dispose() {
    this.dome.geometry.dispose();
    this.dome.material.dispose();
    this.dome.removeFromParent();
    this.clouds.removeFromParent();
  }
}
