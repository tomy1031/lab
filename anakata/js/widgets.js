// js/widgets.js — physical controls you take in your hand: a vertical lever (the 4th coordinate, ana up and
// kata down), knobs that turn one axis into another (XW, YW, ZW), and a grip that lets you turn a floating
// object like a real thing. Each works three ways: grabbed directly by a hand in VR, dragged with the laser,
// or dragged with the mouse / finger.
import * as THREE from 'three';
import { FONT } from './tubes.js';

const V = () => new THREE.Vector3();

// closest point parameters between a ray and a line (p0 + s·u); returns s (along the line) and the distance
function rayLine(ray, p0, u) {
  const w0 = ray.origin.clone().sub(p0);
  const a = ray.direction.dot(ray.direction), b = ray.direction.dot(u), c = u.dot(u);
  const d = ray.direction.dot(w0), e = u.dot(w0);
  const den = a * c - b * b;
  if (Math.abs(den) < 1e-9) return null;
  const t = (b * e - c * d) / den; // along the ray
  const s = (a * e - b * d) / den; // along the line
  const pr = ray.at(t, V()), pl = p0.clone().addScaledVector(u, s);
  return { t, s, dist: pr.distanceTo(pl) };
}

export class Slider {
  // a vertical rail of `len` metres; value 0 (bottom) … 1 (top)
  constructor({ len = 0.46, color = '#ffb24c', label = '', top = '', bottom = '', onChange } = {}) {
    this.len = len;
    this.value = 0.5;
    this.onChange = onChange;
    this.group = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 12), new THREE.MeshStandardMaterial({ color: '#8f98c8', roughness: 0.4, metalness: 0.5 }));
    rail.position.y = len / 2;
    this.group.add(rail);
    // gradient glow along the rail: blue (kata) at the bottom, orange (ana) at the top
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, len, 12, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying float vY; void main(){ vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vY; void main(){ vec3 c = mix(vec3(0.25,0.62,1.0), vec3(1.0,0.58,0.18), vY); gl_FragColor = vec4(c, 0.35); }',
    }));
    gl.position.y = len / 2;
    this.group.add(gl);
    for (const y of [0, len]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 20), new THREE.MeshStandardMaterial({ color: '#3a4170', roughness: 0.6 }));
      cap.position.y = y;
      this.group.add(cap);
    }
    this.knobMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.3 });
    this.knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16), this.knobMat);
    this.group.add(this.knob);
    const lab = (t, y, col) => {
      if (!t) return;
      const s = textPlane(t, { h: 0.032, color: col });
      s.position.set(0.035, y, 0);
      s.geometry.translate(s.userData.w / 2, 0, 0);
      this.group.add(s);
    };
    lab(top, len + 0.01, '#ffb070');
    lab(bottom, -0.01, '#7cc4ff');
    lab(label, len / 2, '#dfe4ff');
    this.set(0.5, false);
    this.item = {
      enabled: () => this.group.visible && this.group.parent?.visible !== false,
      near: (p) => this.knobWorld().distanceTo(p) - 0.03,
      rayHit: (ray) => this.rayHit(ray),
      press: (p, hit, direct) => this.press(p, hit, direct),
      drag: (p) => this.drag(p),
      release: () => { this.grab = null; this.knobMat.emissiveIntensity = 0.35; },
      hoverOn: () => { this.knobMat.emissiveIntensity = 0.8; },
      hoverOff: () => { if (!this.grab) this.knobMat.emissiveIntensity = 0.35; },
    };
  }

  knobWorld() { return this.knob.getWorldPosition(V()); }

  axis() {
    const p0 = this.group.localToWorld(V());
    const p1 = this.group.localToWorld(new THREE.Vector3(0, this.len, 0));
    return { p0, u: p1.sub(p0) };
  }

  set(v, emit = true) {
    v = THREE.MathUtils.clamp(v, 0, 1);
    this.value = v;
    this.knob.position.y = v * this.len;
    if (emit) this.onChange?.(v);
  }

  rayHit(ray) {
    if (!this.group.visible) return null;
    const { p0, u } = this.axis();
    const r = rayLine(ray, p0, u);
    if (!r || r.t < 0 || r.s < -0.08 || r.s > 1.08 || r.dist > 0.045) return null;
    return { d: r.t, point: ray.at(r.t, V()), s: r.s };
  }

  press(p, hit, direct) {
    const { p0, u } = this.axis();
    const s = direct ? p.pos.clone().sub(p0).dot(u) / u.lengthSq() : hit.s;
    this.grab = { off: this.value - s, direct };
    this.knobMat.emissiveIntensity = 1;
    return true;
  }

  drag(p) {
    if (!this.grab) return;
    const { p0, u } = this.axis();
    let s;
    if (this.grab.direct) s = p.pos.clone().sub(p0).dot(u) / u.lengthSq();
    else {
      const r = rayLine(p.ray, p0, u);
      if (!r) return;
      s = r.s;
    }
    const before = this.value;
    this.set(s + this.grab.off);
    if (Math.round(before * 20) !== Math.round(this.value * 20)) p.haptic(0.12, 8);
  }
}

export class Dial {
  // a knob lying in its group's XZ plane (turns about the group's +Y)
  constructor({ r = 0.042, color = '#9fb0ff', label = '', sub = '', onTurn } = {}) {
    this.r = r;
    this.onTurn = onTurn;
    this.angle = 0;
    this.group = new THREE.Group();
    this.spin = new THREE.Group();
    this.group.add(this.spin);
    this.mat = new THREE.MeshStandardMaterial({ color: '#2a3160', roughness: 0.35, metalness: 0.5, emissive: color, emissiveIntensity: 0.12 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, 0.028, 40), this.mat);
    body.position.y = 0.014;
    this.spin.add(body);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(r * 1.7, 0.016, 0.012), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
    grip.position.y = 0.034;
    this.spin.add(grip);
    const notch = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    notch.position.set(r * 0.78, 0.03, 0);
    this.spin.add(notch);
    // tick ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.15, r * 1.3, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    this.group.add(ring);
    if (label) {
      const t = textPlane(label, { h: 0.03, color: '#ffffff', weight: 900 });
      t.rotation.x = -Math.PI / 2;
      t.position.set(0, 0.003, r * 1.3 + 0.026);
      this.group.add(t);
    }
    if (sub) {
      const t = textPlane(sub, { h: 0.02, color: '#b9c2f5' });
      t.rotation.x = -Math.PI / 2;
      t.position.set(0, 0.003, r * 1.3 + 0.056);
      this.group.add(t);
    }
    this.item = {
      enabled: () => this.group.visible && this.group.parent?.visible !== false,
      near: (p) => this.center().distanceTo(p) - this.r,
      rayHit: (ray) => {
        const s = new THREE.Sphere(this.center(), this.r * 1.35);
        const pt = ray.intersectSphere(s, V());
        return pt ? { d: pt.distanceTo(ray.origin), point: pt } : null;
      },
      press: (p, hit, direct) => {
        this.grab = { direct, a: direct ? this.handAngle(p) : this.rayAngle(p.ray) };
        this.mat.emissiveIntensity = 0.6;
        return true;
      },
      drag: (p) => {
        if (!this.grab) return;
        const a = this.grab.direct ? this.handAngle(p) : this.rayAngle(p.ray);
        if (a == null || this.grab.a == null) { this.grab.a = a; return; }
        let d = a - this.grab.a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.grab.a = a;
        this.turn(d);
        this.acc = (this.acc || 0) + Math.abs(d);
        if (this.acc > 0.26) { this.acc = 0; p.haptic(0.15, 10); }
      },
      release: () => { this.grab = null; this.mat.emissiveIntensity = 0.12; },
      hoverOn: () => { this.mat.emissiveIntensity = 0.45; },
      hoverOff: () => { if (!this.grab) this.mat.emissiveIntensity = 0.12; },
    };
  }

  center() { return this.group.localToWorld(new THREE.Vector3(0, 0.02, 0)); }

  turn(d) {
    this.angle += d;
    this.spin.rotation.y = this.angle;
    this.onTurn?.(d);
  }

  // the angle of a world point around the knob, in its own plane
  localAngle(pw) {
    const l = this.group.worldToLocal(pw.clone());
    if (Math.hypot(l.x, l.z) < 1e-4) return null;
    return Math.atan2(-l.z, l.x);
  }

  // laser / mouse: like a crank — where the ray meets the knob's plane, around its centre
  rayAngle(ray) {
    const n = new THREE.Vector3(0, 1, 0).transformDirection(this.group.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, this.center());
    const pt = ray.intersectPlane(plane, V());
    return pt ? this.localAngle(pt) : null;
  }

  // hand: twisting the wrist — the hand's right-pointing axis, seen in the knob's plane
  handAngle(p) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(p.quat);
    const c = this.center();
    return this.localAngle(c.add(right));
  }
}

// turn a floating object by hand: grabbed directly it follows your hand's rotation; with a laser or the
// mouse you roll it like a trackball. onRotate gets a world-space quaternion to apply.
export class Turner {
  constructor({ center, radius, onRotate, onGrab }) {
    this.centerFn = center;
    this.radius = radius;
    this.onRotate = onRotate;
    this.onGrab = onGrab;
    this.item = {
      enabled: () => this.enabled !== false,
      near: (p) => this.centerFn().distanceTo(p) - this.radius,
      rayHit: (ray) => {
        const pt = ray.intersectSphere(new THREE.Sphere(this.centerFn(), this.radius), V());
        return pt ? { d: pt.distanceTo(ray.origin), point: pt } : null;
      },
      press: (p, hit, direct) => {
        this.grab = { direct, q: p.quat.clone(), v: direct ? null : this.arcVec(p.ray, hit.point) };
        this.onGrab?.(true);
        return true;
      },
      drag: (p) => {
        if (!this.grab) return;
        if (this.grab.direct) {
          const dq = p.quat.clone().multiply(this.grab.q.clone().invert());
          this.grab.q.copy(p.quat);
          this.onRotate?.(dq);
        } else {
          const v = this.arcVec(p.ray);
          if (!v || !this.grab.v) { this.grab.v = v; return; }
          const dq = new THREE.Quaternion().setFromUnitVectors(this.grab.v, v);
          this.grab.v = v;
          this.onRotate?.(dq);
        }
      },
      release: () => { this.grab = null; this.onGrab?.(false); },
    };
  }

  // a point on a virtual ball around the centre (behind the ray's closest approach if it misses)
  arcVec(ray, hint) {
    const c = this.centerFn();
    let pt = hint || ray.intersectSphere(new THREE.Sphere(c, this.radius * 1.6), V());
    if (!pt) {
      const t = c.clone().sub(ray.origin).dot(ray.direction);
      pt = ray.at(t, V());
    }
    const v = pt.sub(c);
    return v.lengthSq() > 1e-8 ? v.normalize() : null;
  }
}

// flat text on a plane (labels on the console)
export function textPlane(text, { h = 0.03, color = '#fff', weight = 700, px = 64 } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${weight} ${px}px ${FONT}`;
  c.width = Math.ceil(ctx.measureText(text).width + px * 0.4);
  c.height = Math.ceil(px * 1.3);
  ctx.font = `${weight} ${px}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const w = (h * c.width) / c.height;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.userData.w = w;
  return m;
}

// the console in front of you: a tilted desk with knobs, and a lever standing at its left
export class Console {
  constructor({ dials = [], slider = null }) {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, -0.4);
    const deskW = 0.2 + dials.length * 0.15;
    this.plate = new THREE.Group();
    this.plate.position.set(0.05, 0.96, 0);
    this.plate.rotation.x = 0.5;
    this.group.add(this.plate);
    const top = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.024, 0.2), new THREE.MeshStandardMaterial({ color: '#151a3a', roughness: 0.5, metalness: 0.4 }));
    top.position.y = -0.012;
    this.plate.add(top);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(deskW + 0.01, 0.006, 0.206), new THREE.MeshBasicMaterial({ color: '#5a6cff', transparent: true, opacity: 0.6 }));
    edge.position.y = -0.026;
    this.plate.add(edge);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.9, 16), new THREE.MeshStandardMaterial({ color: '#1d2246', roughness: 0.6, metalness: 0.3 }));
    stem.position.set(0.05, 0.47, 0.02);
    this.group.add(stem);
    this.dials = dials.map((d, i) => {
      const dial = new Dial(d);
      dial.group.position.set(-deskW / 2 + 0.17 + i * 0.15 - 0.03, 0, -0.03);
      this.plate.add(dial.group);
      return dial;
    });
    if (slider) {
      this.slider = new Slider(slider);
      this.slider.group.position.set(-deskW / 2 - 0.1 + 0.05, 0.86, 0.02);
      this.group.add(this.slider.group);
    }
    this.items = [...this.dials.map((d) => d.item), ...(this.slider ? [this.slider.item] : [])];
  }
}
