// js/gloves.js — your fists. In VR each glove follows a Quest Touch controller (grip pose) or, with hand
// tracking, the hand itself (wrist + fingers). The game reads where the glove was last frame and where it is
// now (to sweep it through a target without tunnelling, even on a fast punch) and how fast it moved in the
// direction the punch should go. On a PC the gloves are animated: by your keys, or by the autoplay bot.
import * as THREE from 'three';
import { HAND_COLOR } from './targets.js';

function gloveMesh(side) {
  const g = new THREE.Group();
  const col = new THREE.Color(HAND_COLOR[side]);
  const mat = new THREE.MeshPhysicalMaterial({
    color: col, roughness: 0.36, clearcoat: 0.75, clearcoatRoughness: 0.22, sheen: 0.4, sheenColor: new THREE.Color('#ffffff'),
    emissive: col.clone(), emissiveIntensity: 0.12,
  });
  const white = new THREE.MeshPhysicalMaterial({ color: '#f7f4ec', roughness: 0.45, clearcoat: 0.4 });
  const dark = new THREE.MeshBasicMaterial({ color: '#13202c' });
  // the mitt: a sphere stretched forward, flatter under the palm, rolled up at the knuckles
  const geo = new THREE.SphereGeometry(1, 40, 28);
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const front = Math.max(0, -z);
    if (y < 0) y *= 0.8;
    y += 0.16 * front * front * (y > 0 ? 1 : 0.25);
    P.setXYZ(i, x * (0.06 + 0.01 * front), y * 0.066, z * 0.09 - 0.014);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, mat);
  // thumb, tucked along the inner side
  const s = side === 'L' ? 1 : -1;
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.05, 6, 12), mat);
  thumb.rotation.set(Math.PI / 2, s * 0.22, 0);
  thumb.position.set(s * 0.054, 0.006, -0.028);
  thumb.scale.set(0.9, 1, 1.15);
  // a white patch on the back of the hand
  const patch = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), white);
  patch.scale.set(0.034, 0.01, 0.03);
  patch.position.set(0, 0.07, -0.004);
  patch.rotation.x = -0.25;
  // the cuff: hand colour with a white band, open toward the wrist
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.052, 0.07, 32), mat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.004, 0.07);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.0505, 0.009, 10, 40), white);
  band.position.set(0, -0.004, 0.058);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.04, 28), dark);
  hole.position.set(0, -0.004, 0.1055);
  g.add(body, thumb, patch, cuff, band, hole);
  g.userData.mat = mat;
  return g;
}

// a short ribbon of light behind a fast-moving glove
class Trail {
  constructor(color, parent) {
    this.n = 14;
    this.pts = [];
    const pos = new Float32Array(this.n * 2 * 3);
    const a = new Float32Array(this.n * 2);
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(a, 1));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 } },
      vertexShader: 'attribute float alpha; varying float vA; void main() { vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vA; void main() { gl_FragColor = vec4(uColor * vA * uOpacity, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    parent.add(this.mesh);
    this.opacity = 0;
  }
  update(p, up, speed, dt, visible) {
    this.pts.unshift(p.clone());
    if (this.pts.length > this.n) this.pts.length = this.n;
    const want = visible ? Math.min(1, Math.max(0, (speed - 1.2) / 2.5)) : 0;
    this.opacity += (want - this.opacity) * Math.min(1, dt * 14);
    this.mesh.material.uniforms.uOpacity.value = this.opacity;
    this.mesh.visible = this.opacity > 0.01;
    if (!this.mesh.visible) return;
    const pos = this.geo.attributes.position.array, al = this.geo.attributes.alpha.array;
    for (let i = 0; i < this.n; i++) {
      const q = this.pts[Math.min(i, this.pts.length - 1)];
      const f = 1 - i / (this.n - 1);
      const w = 0.045 * f;
      pos.set([q.x + up.x * w, q.y + up.y * w, q.z + up.z * w, q.x - up.x * w, q.y - up.y * w, q.z - up.z * w], i * 6);
      al[i * 2] = al[i * 2 + 1] = f * f * 0.8;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

export class Glove {
  constructor(side, parent) {
    this.side = side;
    this.mesh = gloveMesh(side);
    parent.add(this.mesh);
    this.trail = new Trail(HAND_COLOR[side], parent);
    this.pos = new THREE.Vector3(side === 'L' ? -0.2 : 0.2, 1.3, -0.3); // fist centre, world
    this.prev = this.pos.clone();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.hist = []; // recent velocities for "how hard was that punch"
    this.tracked = false;
    this.source = null;
    this.glow = 0;
  }

  setPose(p, q, dt) {
    if (!this.tracked) { this.prev.copy(p); this.vel.set(0, 0, 0); this.hist.length = 0; }
    else this.prev.copy(this.pos);
    this.pos.copy(p);
    this.quat.copy(q);
    if (dt > 0) {
      const v = new THREE.Vector3().subVectors(this.pos, this.prev).divideScalar(dt);
      this.vel.lerp(v, 0.6);
      this.hist.push(v);
      if (this.hist.length > 6) this.hist.shift();
    }
    this.tracked = true;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    this.mesh.visible = true;
  }

  // best recent speed along a direction (world)
  speedAlong(dir) {
    let m = 0;
    for (const v of this.hist) m = Math.max(m, v.dot(dir));
    return m;
  }

  lost() {
    this.tracked = false;
    this.mesh.visible = false;
    this.trail.mesh.visible = false;
  }

  haptic(intensity, ms) {
    const g = this.source && this.source.gamepad;
    const h = g && g.hapticActuators && g.hapticActuators[0];
    if (h && h.pulse) { try { h.pulse(intensity, ms); } catch { /* not supported */ } }
    else if (g && g.vibrationActuator && g.vibrationActuator.playEffect) {
      g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity }).catch(() => {});
    }
  }

  update(dt) {
    this.glow = Math.max(0, this.glow - dt * 4);
    this.mesh.userData.mat.emissiveIntensity = 0.12 + this.glow * 0.9;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
    this.trail.update(this.pos, up, this.vel.length(), dt, this.mesh.visible);
  }
}

const GRIP_OFFSET = new THREE.Vector3(0, 0, -0.035); // fist centre in front of the controller's grip

export class Input {
  constructor(scene) {
    this.gloves = { L: new Glove('L', scene), R: new Glove('R', scene) };
    this.head = new THREE.Vector3(0, 1.6, 0);
    this.headQuat = new THREE.Quaternion();
    this.rays = { L: { o: new THREE.Vector3(), d: new THREE.Vector3(), on: false, src: null }, R: { o: new THREE.Vector3(), d: new THREE.Vector3(), on: false, src: null } };
    this.selects = []; // pending 'select' events: side
    this.handMode = false;
    // laser pointers for the menus
    this.pointers = {};
    for (const s of ['L', 'R']) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: HAND_COLOR[s], transparent: true, opacity: 0.8 }));
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), new THREE.MeshBasicMaterial({ color: '#fff', depthTest: false }));
      dot.renderOrder = 20;
      line.visible = dot.visible = false;
      line.frustumCulled = false;
      scene.add(line, dot);
      this.pointers[s] = { line, dot };
    }
  }

  bindSession(session) {
    session.addEventListener('select', (e) => {
      const s = e.inputSource.handedness === 'left' ? 'L' : 'R';
      this.selects.push(s);
    });
  }

  readXR(frame, ref, dt) {
    const vp = frame.getViewerPose(ref);
    if (vp) {
      const p = vp.transform.position, o = vp.transform.orientation;
      this.head.set(p.x, p.y, p.z);
      this.headQuat.set(o.x, o.y, o.z, o.w);
    }
    const seen = { L: false, R: false };
    let hands = false;
    for (const src of frame.session.inputSources) {
      const side = src.handedness === 'left' ? 'L' : src.handedness === 'right' ? 'R' : null;
      if (!side) continue;
      const g = this.gloves[side];
      g.source = src;
      let p = null, q = null;
      if (src.hand) {
        hands = true;
        const w = src.hand.get('wrist'), m = src.hand.get('middle-finger-phalanx-proximal');
        const pw = w && frame.getJointPose(w, ref), pm = m && frame.getJointPose(m, ref);
        if (pw && pm) {
          const a = pw.transform.position, b = pm.transform.position, o = pw.transform.orientation;
          p = new THREE.Vector3(a.x + (b.x - a.x) * 0.75, a.y + (b.y - a.y) * 0.75, a.z + (b.z - a.z) * 0.75);
          q = new THREE.Quaternion(o.x, o.y, o.z, o.w);
        }
      } else if (src.gripSpace) {
        const gp = frame.getPose(src.gripSpace, ref);
        if (gp) {
          const a = gp.transform.position, o = gp.transform.orientation;
          q = new THREE.Quaternion(o.x, o.y, o.z, o.w);
          p = new THREE.Vector3(a.x, a.y, a.z).add(GRIP_OFFSET.clone().applyQuaternion(q));
        }
      }
      if (p) { g.setPose(p, q, dt); seen[side] = true; }
      const r = this.rays[side];
      const rp = src.targetRaySpace && frame.getPose(src.targetRaySpace, ref);
      if (rp) {
        const a = rp.transform.position, o = rp.transform.orientation;
        r.o.set(a.x, a.y, a.z);
        r.d.set(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
        r.on = true;
        r.src = src;
      } else r.on = false;
      // no controller button pauses the game (A/B/X/Y are too easy to press while punching):
      // pausing is the Meta button — see the session's visibilitychange in main.js
    }
    this.handMode = hands;
    for (const s of ['L', 'R']) if (!seen[s]) { this.gloves[s].lost(); this.rays[s].on = false; }
  }

  takeSelects() { const s = this.selects; this.selects = []; return s; }

  showPointers(on, hits = {}) {
    for (const s of ['L', 'R']) {
      const P = this.pointers[s], r = this.rays[s];
      const vis = on && r.on;
      P.line.visible = vis;
      P.dot.visible = vis && !!hits[s];
      if (!vis) continue;
      const len = hits[s] ? hits[s].distance : 1.2;
      P.line.position.copy(r.o);
      P.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), r.d);
      P.line.scale.set(1, 1, len);
      if (hits[s]) { P.dot.position.copy(hits[s].point); P.dot.quaternion.copy(hits[s].quat); }
    }
  }
}

// PC: gloves near the camera; a punch is a quick out-and-back to a target point. The animation runs on the
// song clock (not on frame time), so the fist arrives on time even when frames are slow.
export class DeskGloves {
  constructor(input) {
    this.input = input;
    this.anim = { L: null, R: null };
    this.now = 0;
  }
  rest(side, cam) {
    return new THREE.Vector3(side === 'L' ? -0.2 : 0.2, -0.3, -0.42).applyQuaternion(cam.quaternion).add(cam.position);
  }
  // punch toward world point `to`, arriving `lead` seconds (song time) from now
  punch(side, to, dir, lead = 0.09) {
    this.anim[side] = { t0: this.now, hit: this.now + lead, lead, to: to.clone(), dir: new THREE.Vector3(...dir) };
  }
  busy(side) { const a = this.anim[side]; return !!a && this.now < a.hit; }
  update(dt, cam, songT) {
    this.now = songT;
    for (const side of ['L', 'R']) {
      const g = this.input.gloves[side];
      const rest = this.rest(side, cam);
      let p = rest;
      const a = this.anim[side];
      if (a) {
        const t = songT - a.t0, back = 0.16;
        const start = a.to.clone().addScaledVector(a.dir, -0.32);
        const end = a.to.clone().addScaledVector(a.dir, 0.05);
        if (t < 0) p = rest;
        else if (t < a.lead) {
          const f = t / a.lead;
          p = f < 0.35 ? rest.clone().lerp(start, f / 0.35) : start.clone().lerp(a.to, (f - 0.35) / 0.65);
        } else if (t < a.lead + 0.03) p = a.to.clone().lerp(end, (t - a.lead) / 0.03);
        else if (t < a.lead + 0.03 + back) p = end.clone().lerp(rest, (t - a.lead - 0.03) / back);
        else this.anim[side] = null;
      }
      const q = cam.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, side === 'L' ? 0.12 : -0.12, 0)));
      g.setPose(p, q, dt);
    }
  }
}
