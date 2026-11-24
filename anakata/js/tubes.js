// js/tubes.js — thick lines for VR. A WebGL line is one pixel wide in a headset, so every edge here is a
// short cylinder drawn by instancing: one draw call for all of them, each instance carrying its two ends,
// a colour at each end and a radius at each end (so an edge can fade from blue to orange as it runs from
// kata to ana, and thin out where the projection pushes it far away).
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute vec3 aCA;
attribute vec3 aCB;
attribute vec2 aR;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vV;
#include <fog_pars_vertex>
void main() {
  vec3 d = aB - aA;
  float L = length(d);
  vec3 dir = L > 1e-6 ? d / L : vec3(0.0, 1.0, 0.0);
  vec3 up = abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 u = normalize(cross(dir, up));
  vec3 w = cross(dir, u);
  float t = position.y;
  float r = mix(aR.x, aR.y, t);
  vec3 radial = u * position.x + w * position.z;
  vec3 p = aA + dir * (t * L) + radial * r;
  vCol = mix(aCA, aCB, t);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * radial);
  vV = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform float uOpacity;
uniform float uGlow;
varying vec3 vCol;
varying vec3 vN;
varying vec3 vV;
#include <fog_pars_fragment>
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  float lam = 0.55 + 0.45 * max(dot(n, normalize(vec3(0.3, 0.8, 0.5))), 0.0);
  float rim = pow(1.0 - abs(dot(n, v)), 2.0);
  vec3 c = vCol * lam + vCol * rim * 0.6 + vCol * uGlow;
  gl_FragColor = vec4(c, uOpacity);
  #include <fog_fragment>
}`;

export class Tubes {
  constructor(max, { radial = 7, opacity = 1, glow = 0.15, fog = false } = {}) {
    const base = new THREE.CylinderGeometry(1, 1, 1, radial, 1, true);
    base.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    const attr = (k) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.a = { aA: attr(3), aB: attr(3), aCA: attr(3), aCB: attr(3), aR: attr(2) };
    for (const [k, v] of Object.entries(this.a)) g.setAttribute(k, v);
    g.instanceCount = 0;
    this.max = max;
    this.n = 0;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uOpacity: { value: opacity }, uGlow: { value: glow } }]),
      transparent: opacity < 1,
      depthWrite: opacity >= 1,
      fog,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.geometry = g;
  }

  begin() { this.n = 0; return this; }

  // a, b: [x,y,z] (or Vector3); ca, cb: [r,g,b]; ra, rb: radius in metres
  push(a, b, ca, cb, ra, rb = ra) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const { aA, aB, aCA, aCB, aR } = this.a;
    const ax = a.x ?? a[0], ay = a.y ?? a[1], az = a.z ?? a[2];
    const bx = b.x ?? b[0], by = b.y ?? b[1], bz = b.z ?? b[2];
    aA.array[i * 3] = ax; aA.array[i * 3 + 1] = ay; aA.array[i * 3 + 2] = az;
    aB.array[i * 3] = bx; aB.array[i * 3 + 1] = by; aB.array[i * 3 + 2] = bz;
    aCA.array.set(ca, i * 3);
    aCB.array.set(cb, i * 3);
    aR.array[i * 2] = ra; aR.array[i * 2 + 1] = rb;
  }

  end() {
    for (const v of Object.values(this.a)) {
      v.needsUpdate = true;
      v.clearUpdateRanges?.();
    }
    this.geometry.instanceCount = this.n;
    return this;
  }
}

// instanced spheres (vertices of the polytopes, beads on the world lines)
export class Beads {
  constructor(max, radius = 1, segs = 14) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(radius, segs, Math.max(6, segs * 0.66 | 0)),
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.18 }),
      max,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.max = max;
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
    this.n = 0;
  }

  begin() { this.n = 0; return this; }

  push(p, r, col) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.m.makeScale(r, r, r).setPosition(p[0] ?? p.x, p[1] ?? p.y, p[2] ?? p.z);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.setColorAt(i, this.c.setRGB(col[0], col[1], col[2]));
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return this;
  }
}

// a dynamic triangle mesh for the cross-sections (flat-shaded polygons, one colour per polygon)
export class PolyMesh {
  constructor(maxTris = 600, { opacity = 0.92 } = {}) {
    this.maxTris = maxTris;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(maxTris * 9), 3).setUsage(THREE.DynamicDrawUsage);
    this.nor = new THREE.BufferAttribute(new Float32Array(maxTris * 9), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(maxTris * 9), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nor);
    g.setAttribute('color', this.col);
    g.setDrawRange(0, 0);
    this.geometry = g;
    // flat, saturated colours with simple light: each face must keep its cell's colour to be readable
    this.material = new THREE.ShaderMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: opacity < 1, depthWrite: true, toneMapped: false,
      uniforms: { uOpacity: { value: opacity } },
      vertexShader: `varying vec3 vC; varying vec3 vN; varying vec3 vV;
        void main(){ vC = color; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uOpacity; varying vec3 vC; varying vec3 vN; varying vec3 vV;
        void main(){
          vec3 n = normalize(vN); vec3 v = normalize(vV);
          if (dot(n, v) < 0.0) n = -n;
          float lam = 0.5 + 0.5 * max(dot(n, normalize(vec3(0.35, 0.8, 0.5))), 0.0);
          float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 c = vC * lam + vec3(1.0) * rim * 0.25;
          gl_FragColor = vec4(pow(c, vec3(0.9)), uOpacity);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.t = 0;
  }

  begin() { this.t = 0; return this; }

  // pts: ordered polygon [[x,y,z]…] (scaled already), n: normal, c: colour
  polygon(pts, n, c) {
    for (let i = 1; i + 1 < pts.length; i++) {
      if (this.t >= this.maxTris) return;
      const o = this.t * 9;
      const tri = [pts[0], pts[i], pts[i + 1]];
      for (let k = 0; k < 3; k++) {
        this.pos.array[o + k * 3] = tri[k][0];
        this.pos.array[o + k * 3 + 1] = tri[k][1];
        this.pos.array[o + k * 3 + 2] = tri[k][2];
        this.nor.array.set(n, o + k * 3);
        this.col.array.set(c, o + k * 3);
      }
      this.t++;
    }
  }

  end() {
    this.geometry.setDrawRange(0, this.t * 3);
    this.pos.needsUpdate = this.nor.needsUpdate = this.col.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    return this;
  }
}

// a 2D label on a little canvas, always readable (used for axis names and numbers in the scene)
export function labelSprite(text, { size = 0.05, color = '#e8ecff', bg = 'rgba(8,10,24,0.0)', font = 700, px = 64 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${font} ${px}px ${FONT}`;
  const w = Math.ceil(ctx.measureText(text).width) + px * 0.6;
  c.width = w;
  c.height = px * 1.4;
  ctx.font = `${font} ${px}px ${FONT}`;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + px * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set((size * c.width) / c.height, size, 1);
  return s;
}

export const FONT = '"Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", system-ui, sans-serif';
