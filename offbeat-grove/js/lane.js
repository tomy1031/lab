// js/lane.js — the beat lane on the ground in front of you. Every eighth note is a line that travels toward
// you exactly like the targets do: solid white lines are the beats "1 2 3 4" (表拍), dashed gold lines are
// the "&" in between (裏拍), and each line carries its count on both sides. A target that floats above a
// dashed line will arrive on the "&". The bright line at your feet is "now".
import * as THREE from 'three';
import { canvasTexture, FONT } from './util.js';

function atlas() {
  const { ctx, tex } = canvasTexture(1024, 128);
  const labels = ['1', '&', '2', '&', '3', '&', '4', '&'];
  ctx.clearRect(0, 0, 1024, 128);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach((l, i) => {
    ctx.font = `900 ${l === '&' ? 92 : 104}px ${FONT}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeText(l, i * 128 + 64, 70);
    ctx.fillStyle = '#fff';
    ctx.fillText(l, i * 128 + 64, 70);
  });
  tex.anisotropy = 8;
  return tex;
}

export class Lane {
  constructor(parent) {
    this.u = {
      uBeat: { value: 0 }, uSpb: { value: 0.5 }, uV0: { value: 2.6 }, uK: { value: 2.0 }, uHitZ: { value: -0.5 },
      uAlpha: { value: 0 }, uLabels: { value: 1 }, uSix: { value: 0 }, tAtlas: { value: atlas() }, uHead: { value: 0 },
    };
    const g = new THREE.PlaneGeometry(2.4, 17, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0.012, -8.2);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vP;
        void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uBeat, uSpb, uV0, uK, uHitZ, uAlpha, uLabels, uSix;
        uniform sampler2D tAtlas;
        varying vec2 vP;
        float distOf(float tau) { return tau >= 0.0 ? uV0 * tau + uK * tau * tau : uV0 * tau; }
        float tauOf(float d) { return d >= 0.0 ? (-uV0 + sqrt(uV0 * uV0 + 4.0 * uK * d)) / (2.0 * uK) : d / uV0; }
        void main() {
          const float W = 0.62;
          float x = vP.x, ax = abs(x);
          float d = uHitZ - vP.y;
          float b = uBeat + tauOf(d) / uSpb;
          float n = floor(b * 2.0 + 0.5);
          float e = d - distOf((n * 0.5 - uBeat) * uSpb);
          float idx = mod(n, 8.0);
          bool onb = mod(n, 2.0) < 0.5;
          bool bar = idx < 0.5;
          float inLane = 1.0 - smoothstep(W - 0.03, W, ax);
          vec3 rgb = vec3(0.04, 0.08, 0.06);
          float a = 0.3 * inLane;
          float lw = bar ? 0.03 : onb ? 0.02 : 0.016;
          float line = (1.0 - smoothstep(lw, lw + 0.012, abs(e))) * inLane;
          if (!onb) line *= step(0.45, fract(x * 4.0 + 0.2));
          vec3 lc = bar ? vec3(1.0, 0.93, 0.62) : onb ? vec3(0.96, 0.98, 1.0) : vec3(1.0, 0.76, 0.22);
          rgb = mix(rgb, lc, line); a = max(a, line * (onb ? 0.95 : 0.9));
          if (uSix > 0.5) {
            float n4 = floor(b * 4.0 + 0.5);
            float e4 = d - distOf((n4 * 0.25 - uBeat) * uSpb);
            float tick = (1.0 - smoothstep(0.008, 0.016, abs(e4))) * step(0.5, mod(n4, 2.0)) * inLane * step(W - 0.18, ax);
            rgb = mix(rgb, vec3(1.0, 0.62, 0.88), tick); a = max(a, tick * 0.8);
          }
          float border = (1.0 - smoothstep(0.006, 0.016, abs(ax - W)));
          rgb = mix(rgb, vec3(0.9, 1.0, 0.92), border * 0.7); a = max(a, border * 0.45);
          if (uLabels > 0.5 && ax > W + 0.05 && ax < W + 0.37 && e > 0.03 && e < 0.35) {
            float u = (ax - W - 0.05) / 0.32;
            if (x < 0.0) u = 1.0 - u;
            float lab = texture2D(tAtlas, vec2((idx + u) / 8.0, (e - 0.03) / 0.32)).a;
            rgb = mix(rgb, onb ? vec3(1.0) : vec3(1.0, 0.8, 0.3), lab); a = max(a, lab * 0.95);
          }
          float hit = (1.0 - smoothstep(0.012, 0.05, abs(d))) * inLane;
          float pulse = exp(-fract(uBeat) * 7.0);
          rgb = mix(rgb, vec3(1.0, 0.97, 0.85), hit); a = max(a, hit * (0.55 + 0.45 * pulse));
          a *= (1.0 - smoothstep(9.0, 14.0, d)) * smoothstep(-0.7, -0.25, d) * uAlpha;
          gl_FragColor = vec4(rgb, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  set(beat, spb, speed, labels, six) {
    this.u.uBeat.value = beat;
    this.u.uSpb.value = spb;
    this.u.uV0.value = speed.v0;
    this.u.uK.value = speed.k;
    this.u.uLabels.value = labels ? 1 : 0;
    this.u.uSix.value = six ? 1 : 0;
  }
  fade(target, dt) {
    const u = this.u.uAlpha;
    u.value += (target - u.value) * Math.min(1, dt * 3);
    this.mesh.visible = u.value > 0.01;
  }
}
