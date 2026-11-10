// js/world/props.js — FABLE
// しかけ（Prop）：見た目と setState。ロジック（標的・火ゾーン・判定）は game が anchors の位置で行う。
import * as THREE from 'three';
import { part, merge, G } from './geo.js';
import { structMaterial, toWorld, yawRot } from './landmarks/common.js';
import { buildTower } from './landmarks/towers.js';
import { buildShrine } from './landmarks/shrines.js';
import { buildWaylight, buildBrazier } from './landmarks/camps.js';
import { LAKE_LEVEL } from './layout.js';

const VIEW = { chest: 80, pedestal: 80, crackrock: 150, thornvine: 110, iceblock: 150, pinwheel: 80, sleepbell: 110, racering: 150, lightbridge: 700, dummy: 80, appletree: 150, bush: 60 };

export function createProps(env, sp) {
  const group = new THREE.Group();
  group.name = 'aw-props';
  const { fx, col, hf } = env;
  const geoCache = {};
  const cached = (key, make) => geoCache[key] || (geoCache[key] = make());
  const shared = structMaterial({ glow: 0xffd76a, amt: 0.25, night: 0.5 });
  const anims = [];        // { t, dur, fn(k) }
  const animate = (dur, fn) => { anims.push({ t: 0, dur, fn }); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const realItems = () => { const it = env.ctx.items; return !!(it && !it.isStub && it.defs && it.defs.apple && typeof it.spawn === 'function'); };

  const builders = {
    tower: (d) => buildTower(env, d, d.data.tower),
    shrine: (d) => buildShrine(env, d),
    waylight: (d) => buildWaylight(env, d),
    brazier: (d) => buildBrazier(env, d),

    chest(d) {
      const wood = 0x7a5536, woodD = 0x543a26, gold = 0xf2c66b;
      const body = new THREE.Mesh(cached('chestBody', () => merge([
        part(G.box(0.95, 0.5, 0.62), { pos: [0, 0.27, 0], bottom: woodD, top: wood, vary: 0.1 }),
        part(G.box(1.0, 0.07, 0.67), { pos: [0, 0.05, 0], color: gold, glow: 0.3 }),
        part(G.box(0.1, 0.5, 0.66), { pos: [-0.36, 0.27, 0], color: gold, glow: 0.3 }),
        part(G.box(0.1, 0.5, 0.66), { pos: [0.36, 0.27, 0], color: gold, glow: 0.3 }),
      ])), shared);
      const lid = new THREE.Mesh(cached('chestLid', () => merge([
        part(new THREE.CylinderGeometry(0.33, 0.33, 0.95, 8, 1, false, -Math.PI / 2, Math.PI), { rot: [0, 0, Math.PI / 2], pos: [0, 0.0, -0.31], scale: [1, 0.82, 1], bottom: woodD, top: wood }),
        part(G.box(0.12, 0.1, 0.06), { pos: [0, 0.02, -0.64], color: gold, glow: 0.8 }),
        part(G.box(1.0, 0.06, 0.66), { pos: [0, 0.0, -0.31], color: gold, glow: 0.3 }),
      ])), shared);
      lid.position.set(0, 0.53, 0.31);
      const g = new THREE.Group(); g.add(body, lid);
      const anchors = { lid: toWorld(d, 0, 0.75, 0), loot: toWorld(d, 0, 1.0, 0) };
      col.addCollider({ x: d.x, z: d.z, r: 0.55, y0: d.y, y1: d.y + 0.8, kind: 'structure' });
      const gl = fx.glows.add({ x: d.x, y: d.y + 0.7, z: d.z, size: 0.7, color: 0xffd76a, intensity: 0.32, flicker: 0.3 });
      let sparkT = Math.random() * 2;
      return {
        object3D: g, anchors, state: { open: false },
        onState(key, v) {
          if (key !== 'open') return;
          const from = lid.rotation.x, to = v ? 1.95 : 0;
          animate(env.ready ? 0.5 : 0.01, (k) => { lid.rotation.x = from + (to - from) * (1 - (1 - k) * (1 - k)); });
          fx.glows.set(gl, { intensity: v ? 0 : 0.32 });
          if (v && env.ready) { fx.api.flash(anchors.loot, { color: 0xffd76a, size: 3, life: 0.6 }); fx.api.emit('shard', anchors.loot, { count: 16 }); }
        },
        update(view, dist) {
          if (this.state.open || dist > 30) return;
          sparkT -= view.dt;
          if (sparkT <= 0) { sparkT = 1.2 + Math.random(); fx.api.emit('shard', anchors.lid, { count: 1, speed: 0.6, life: 1.2 }); }
        },
      };
    },

    pedestal(d) {
      const stone = 0xa9a79c, stoneD = 0x77756c;
      const body = new THREE.Mesh(cached('pedestal', () => merge([
        part(G.cyl(0.55, 0.7, 0.34, 6), { pos: [0, 0.17, 0], bottom: stoneD, top: stone }),
        part(G.cyl(0.36, 0.46, 0.4, 6), { pos: [0, 0.52, 0], bottom: stoneD, top: stone, jitter: 0.02 }),
        part(G.ring(0.44, 0.52, 6), { pos: [0, 0.345, 0], color: 0x7fe9ff, glow: 1 }),
      ])), shared);
      const sword = new THREE.Mesh(cached('pedSword', () => merge([
        part(G.box(0.07, 0.72, 0.016), { pos: [0, 1.02, 0], bottom: 0xcfd8e6, top: 0xffffff, glow: 0.25 }),
        part(G.box(0.26, 0.045, 0.05), { pos: [0, 1.4, 0], color: 0xf2c66b, glow: 0.4 }),
        part(G.cyl(0.022, 0.026, 0.2, 6), { pos: [0, 1.52, 0], color: 0x5a4636 }),
        part(G.octa(0.04), { pos: [0, 1.65, 0], color: 0x7fe9ff, glow: 1 }),
      ])), shared);
      sword.rotation.z = 0.12;
      const g = new THREE.Group(); g.add(body, sword);
      const item = toWorld(d, -0.18, 1.5, 0);
      const anchors = { item, lid: item, loot: item };
      col.addCollider({ x: d.x, z: d.z, r: 0.6, y0: d.y, y1: d.y + 0.75, kind: 'structure' });
      const gl = fx.glows.add({ x: item.x, y: item.y - 0.3, z: item.z, size: 1.6, color: 0x7fe9ff, intensity: 0.6, flicker: 0.15 });
      return {
        object3D: g, anchors, state: { taken: false, open: false },
        onState(key, v) {
          if (key !== 'taken' && key !== 'open') return;
          sword.visible = !v;
          fx.glows.set(gl, { intensity: v ? 0 : 0.6 });
          if (v && env.ready) fx.api.emit('shard', item, { count: 14, color: 0x7fe9ff });
        },
      };
    },

    crackrock(d) {
      const r = d.r;
      const mesh = new THREE.Mesh(cached('crack', () => {
        const c = (p, n) => { const k = 0.5 + 0.5 * Math.max(0, n.y); return [0.3 * k, 0.27 * k, 0.24 * k]; };
        const P = [
          part(G.dodeca(1), { pos: [0, 0.55, 0], scale: [1.1, 0.85, 1.0], color: c, jitter: 0.12 }),
          part(G.dodeca(0.6), { pos: [0.75, 0.3, 0.45], color: c, jitter: 0.08 }),
          part(G.dodeca(0.5), { pos: [-0.8, 0.25, -0.3], color: c, jitter: 0.08 }),
        ];
        // ひび（内側から光る筋）
        for (let i = 0; i < 7; i++) {
          const a = i * 0.9, y = 0.3 + (i % 4) * 0.25;
          P.push(part(G.box(0.05, 0.5, 0.05), { pos: [Math.sin(a) * 0.93 * (1 - (y - 0.55) * (y - 0.55) * 0.6), y, Math.cos(a) * 0.86], rot: [Math.cos(a) * 0.5, a, 0.6 * Math.sin(i * 2.3)], color: 0xffb347, glow: 1 }));
        }
        return merge(P);
      }), shared);
      mesh.scale.setScalar(r);
      const rubble = new THREE.Mesh(cached('rubble', () => merge([0, 1, 2, 3, 4].map((i) => part(G.dodeca(0.22 + (i % 3) * 0.08), { pos: [Math.sin(i * 1.9) * 0.8, 0.1, Math.cos(i * 1.9) * 0.8], color: 0x6f675e, jitter: 0.05 })))), shared);
      rubble.scale.setScalar(r); rubble.visible = false;
      const g = new THREE.Group(); g.add(mesh, rubble);
      const anchors = { center: toWorld(d, 0, r * 0.6, 0) };
      let handle = col.addCollider({ x: d.x, z: d.z, r: r * 1.0, y0: d.y - 1, y1: d.y + r * 1.5, kind: 'rock' });
      return {
        object3D: g, anchors, state: { broken: false },
        onState(key, v) {
          if (key !== 'broken') return;
          mesh.visible = !v; rubble.visible = !!v;
          if (v && handle) { col.removeCollider(handle); handle = null; }
          if (!v && !handle) handle = col.addCollider({ x: d.x, z: d.z, r, y0: d.y - 1, y1: d.y + r * 1.5, kind: 'rock' });
          if (v && env.ready) { fx.api.flash(anchors.center, { color: 0xffb347, size: 6, life: 0.4 }); fx.api.emit('dust', anchors.center, { count: 26, speed: 4, size: 0.6 }); fx.api.emit('spark', anchors.center, { count: 16 }); }
        },
      };
    },

    thornvine(d) {
      const r = d.r;
      const mesh = new THREE.Mesh(cached('thorn', () => {
        const P = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI, rr = 0.75 + (i % 3) * 0.14;
          P.push(part(G.torus(rr, 0.07, 4, 9, Math.PI), { rot: [0, a, 0], pos: [Math.sin(i * 2.1) * 0.2, 0, Math.cos(i * 1.3) * 0.2], bottom: 0x2e2a3a, top: 0x4a3f5c }));
          for (let k = 1; k < 5; k++) {
            const t = (k / 5) * Math.PI;
            P.push(part(G.cone(0.05, 0.24, 4), { pos: [Math.cos(t) * rr * Math.cos(a) + Math.sin(i * 2.1) * 0.2, Math.sin(t) * rr + 0.1, -Math.cos(t) * rr * Math.sin(a) + Math.cos(i * 1.3) * 0.2], rot: [k * 1.3, i, k * 0.7], color: 0x6b6770 }));
          }
        }
        P.push(part(G.octa(0.12), { pos: [0, 0.5, 0], color: 0xc23bff, glow: 1 }));
        return merge(P);
      }), cached('thornMat', () => structMaterial({ glow: 0xc23bff, amt: 0.7, night: 0.5 })));
      mesh.scale.setScalar(r);
      const g = new THREE.Group(); g.add(mesh);
      const anchors = { center: toWorld(d, 0, r * 0.5, 0) };
      let handle = col.addCollider({ x: d.x, z: d.z, r: r * 0.95, y0: d.y - 1, y1: d.y + r * 1.2, kind: 'structure' });
      return {
        object3D: g, anchors, state: { burnt: false },
        onState(key, v) {
          if (key !== 'burnt') return;
          if (v && handle) { col.removeCollider(handle); handle = null; }
          if (v && env.ready) {
            fx.api.emit('ember', anchors.center, { count: 30, speed: 2.4 }); fx.api.emit('smoke', anchors.center, { count: 10 });
            animate(0.9, (k) => { mesh.scale.setScalar(r * (1 - k)); if (k >= 1) mesh.visible = false; });
          } else mesh.visible = !v;
        },
      };
    },

    iceblock(d) {
      const r = d.r;
      const mesh = new THREE.Mesh(cached('ice', () => {
        const c = (p, n) => { const k = 0.7 + 0.3 * Math.max(0, n.y); return [0.42 * k, 0.78 * k, 0.92 * k]; };
        return merge([
          part(G.cyl(0.62, 0.9, 1.5, 6, 1), { pos: [0, 0.75, 0], color: c, jitter: 0.1, glow: 0.3 }),
          part(G.cone(0.62, 0.7, 6), { pos: [0, 1.85, 0], color: c, jitter: 0.08, glow: 0.4 }),
          part(G.cone(0.34, 1.1, 5), { pos: [0.75, 0.55, 0.3], rot: [0.2, 0, -0.5], color: c, glow: 0.4 }),
          part(G.cone(0.3, 0.9, 5), { pos: [-0.7, 0.45, -0.35], rot: [-0.2, 0, 0.55], color: c, glow: 0.4 }),
        ]);
      }), cached('iceMat', () => structMaterial({ glow: 0x9fe3f5, amt: 0.45, night: 0.5, rim: 0.6 })));
      mesh.scale.setScalar(r);
      const g = new THREE.Group(); g.add(mesh);
      const anchors = { center: toWorld(d, 0, r * 0.9, 0) };
      let handle = col.addCollider({ x: d.x, z: d.z, r: r * 0.9, y0: d.y - 1, y1: d.y + r * 2.2, kind: 'structure' });
      return {
        object3D: g, anchors, state: { melted: false },
        onState(key, v) {
          if (key !== 'melted') return;
          if (v && handle) { col.removeCollider(handle); handle = null; }
          if (v && env.ready) {
            fx.api.emit('splash', anchors.center, { count: 24 });
            animate(1.4, (k) => { mesh.scale.set(r * (1 + 0.2 * k), r * (1 - k), r * (1 + 0.2 * k)); if (k >= 1) mesh.visible = false; });
          } else mesh.visible = !v;
        },
      };
    },

    pinwheel(d) {
      const stem = new THREE.Mesh(cached('pinStem', () => merge([
        part(G.cyl(0.025, 0.04, 1.1, 5), { pos: [0, 0.55, 0], bottom: 0x3f8f3c, top: 0x8fd060 }),
        part(new THREE.PlaneGeometry(0.34, 0.14), { pos: [0.17, 0.4, 0], rot: [0, 0, 0.5], color: 0x5fae4a }),
        part(new THREE.PlaneGeometry(0.34, 0.14), { pos: [-0.17, 0.62, 0], rot: [0, Math.PI, -0.5], color: 0x5fae4a }),
      ])), cached('pinStemMat', () => structMaterial({ side: THREE.DoubleSide })));
      const mat = structMaterial({ glow: 0xffd76a, amt: 0.1, night: 0.2, side: THREE.DoubleSide });
      const rotor = new THREE.Mesh(cached('pinRotor', () => {
        const P = [part(G.octa(0.07), { color: 0xffd84d, glow: 1 })];
        const cols = [0xffffff, 0x9ad0ff, 0xffffff, 0xff8fb3, 0xffffff, 0xffd84d];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const tri = new THREE.BufferGeometry();
          tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.36, 0.05, 0.05, 0.2, 0.22, -0.03]), 3));
          tri.computeVertexNormals();
          P.push(part(tri, { rot: [0, 0, a], color: cols[i], glow: 0.6 }));
        }
        return merge(P);
      }), mat);
      rotor.position.set(0, 1.12, 0.05);
      const g = new THREE.Group(); g.add(stem, rotor);
      const anchors = { center: toWorld(d, 0, 1.12, 0) };
      const gl = fx.glows.add({ x: anchors.center.x, y: anchors.center.y, z: anchors.center.z, size: 1.1, color: 0xffd76a, intensity: 0 });
      return {
        object3D: g, anchors, state: { spin: 0, bloomed: false },
        onState(key, v) {
          if (key === 'bloomed') {
            mat.uniforms.uGlowAmt.value = v ? 1.2 : 0.1;
            fx.glows.set(gl, { intensity: v ? 0.8 : 0 });
            if (v && env.ready) { fx.api.emit('petal', anchors.center, { count: 18 }); fx.api.flash(anchors.center, { color: 0xffd76a, size: 3, life: 0.6 }); }
          }
        },
        update(view) { rotor.rotation.z -= view.dt * (0.4 + env.world.wind.strength * 1.2 + (this.state.spin || 0) * 16); },
      };
    },

    sleepbell(d) {
      const dy = d.data.dy;
      const P = [];
      if (!d.data.hang) {
        // しなった竿の先に吊るす
        P.push(part(G.cyl(0.05, 0.11, dy + 0.9, 5, 3), { pos: [-0.9, (dy + 0.9) / 2, 0], rot: [0, 0, -0.05], bottom: 0x5a4636, top: 0x7a6248 }));
        P.push(part(G.cyl(0.03, 0.05, 1.1, 4), { pos: [-0.42, dy + 0.86, 0], rot: [0, 0, -1.25], color: 0x7a6248 }));
      }
      P.push(part(G.cyl(0.012, 0.012, 0.7, 3), { pos: [0, dy + 0.5, 0], color: 0xd9c9a0 }));
      const pole = new THREE.Mesh(merge(P), shared);
      const mat = structMaterial({ glow: 0x7fe9ff, amt: 0.15, night: 0.4 });
      const bell = new THREE.Mesh(cached('bell', () => merge([
        part(G.cyl(0.07, 0.2, 0.26, 7, 1, true), { pos: [0, -0.13, 0], bottom: 0xcfa24a, top: 0xffe08a, glow: 0.5 }),
        part(G.cyl(0.21, 0.22, 0.04, 7, 1, true), { pos: [0, -0.27, 0], color: 0xf2c66b, glow: 0.5 }),
        part(G.octa(0.05), { pos: [0, -0.34, 0], color: 0x7fe9ff, glow: 1 }),
        part(new THREE.PlaneGeometry(0.1, 0.3), { pos: [0, -0.56, 0], color: 0x7fe9ff, glow: 0.4, sway: 0.4 }),
        part(new THREE.PlaneGeometry(0.1, 0.3), { pos: [0, -0.56, 0], rot: [0, Math.PI, 0], color: 0x7fe9ff, glow: 0.4, sway: 0.4 }),
      ])), mat);
      bell.position.set(0, dy + 0.15, 0);
      const g = new THREE.Group(); g.add(pole, bell);
      const anchors = { center: toWorld(d, 0, dy, 0) };
      if (!d.data.hang) { const p = toWorld(d, -0.9, 0, 0); col.addCollider({ x: p.x, z: p.z, r: 0.16, y0: d.y, y1: d.y + dy + 1, kind: 'structure' }); }
      const gl = fx.glows.add({ x: anchors.center.x, y: anchors.center.y, z: anchors.center.z, size: 0.9, color: 0x7fe9ff, intensity: 0.25, flicker: 0.2 });
      let swing = 0;
      return {
        object3D: g, anchors, state: { rung: false },
        onState(key, v) {
          if (key !== 'rung') return;
          mat.uniforms.uGlowAmt.value = v ? 1.3 : 0.15;
          mat.uniforms.uGlowCol.value.set(v ? 0xffd76a : 0x7fe9ff);
          fx.glows.set(gl, { intensity: v ? 0.9 : 0.25, color: v ? 0xffd76a : 0x7fe9ff });
          if (v && env.ready) { swing = 1; fx.api.flash(anchors.center, { color: 0xffe9a8, size: 3, life: 0.5 }); fx.api.emit('shard', anchors.center, { count: 12 }); }
        },
        update(view) {
          const idle = Math.sin(view.elapsed * 1.3 + d.x) * 0.06 * (0.5 + env.world.wind.strength);
          if (swing > 0.01) swing *= Math.exp(-view.dt * 1.2); else swing = 0;
          bell.rotation.z = idle + Math.sin(view.elapsed * 9) * 0.6 * swing;
        },
      };
    },

    racering(d) {
      const mat = structMaterial({ glow: 0x7fe9ff, amt: 1.1, night: 0.4, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(cached('ring', () => merge([
        part(G.torus(1.5, 0.06, 5, 28), { color: 0xdff6ff, glow: 1 }),
        part(G.torus(1.72, 0.025, 4, 28), { color: 0xffe9a8, glow: 0.8 }),
        ...[0, 1, 2, 3].map((i) => part(G.octa(0.1), { pos: [Math.sin(i * Math.PI / 2 + 0.78) * 1.5, Math.cos(i * Math.PI / 2 + 0.78) * 1.5, 0], color: 0xffffff, glow: 1 })),
      ])), mat);
      mesh.position.y = 1.6;
      const g = new THREE.Group(); g.add(mesh);
      const anchors = { center: toWorld(d, 0, 1.6, 0) };
      const start = !!d.data.start;
      const gl = fx.glows.add({ x: anchors.center.x, y: anchors.center.y, z: anchors.center.z, size: 3.4, color: 0x7fe9ff, intensity: start ? 0.45 : 0 });
      const self = {
        object3D: g, anchors, state: { visible: start, passed: false }, hidden: !start,
        onState(key, v) {
          if (key === 'visible') { self.hidden = !v; g.visible = !!v; fx.glows.set(gl, { intensity: v ? 0.45 : 0 }); if (v && env.ready) fx.api.emit('shard', anchors.center, { count: 8, color: 0x7fe9ff }); }
          if (key === 'passed') {
            mat.uniforms.uGlowCol.value.set(v ? 0xffd76a : 0x7fe9ff);
            fx.glows.set(gl, { color: v ? 0xffd76a : 0x7fe9ff });
            if (v && env.ready) { fx.api.emit('shard', anchors.center, { count: 18 }); fx.api.flash(anchors.center, { color: 0xffd76a, size: 4, life: 0.4 }); }
          }
        },
        update(view) { mesh.rotation.z = view.elapsed * 0.5 + d.x; },
      };
      return self;
    },

    lightbridge(d) {
      // 桟橋の先（北）から小島の岸まで
      const pier = sp.landmarks.pier;
      const z0 = pier.z - 32.9;
      let z1 = z0 - 20;
      while (z1 > -40 && hf.heightAt(pier.x, z1) < LAKE_LEVEL + 1.0) z1 -= 1;
      z1 -= 1.5;
      const len = z0 - z1, n = Math.round(len / 3.6);
      const P = [];
      for (let i = 0; i < n; i++) P.push(part(G.box(3.0, 0.07, 3.0), { pos: [0, -0.04, -(i + 0.5) * (len / n)], color: i % 2 ? 0xdff6ff : 0xbfe9ff, glow: 1 }));
      for (const sx of [-1.62, 1.62]) P.push(part(G.box(0.07, 0.07, len), { pos: [sx, 0.02, -len / 2], color: 0xffe9a8, glow: 1 }));
      const mesh = new THREE.Mesh(merge(P), structMaterial({ glow: 0x9fe9ff, amt: 1.0, night: 0.3 }));
      mesh.position.set(0, 0, z0 - d.z);
      const g = new THREE.Group(); g.add(mesh);
      g.visible = false;
      const y = LAKE_LEVEL + 1.15;
      const anchors = { from: V(pier.x, y, z0), to: V(pier.x, y, z1) };
      let plat = null;
      const glA = fx.glows.add({ x: pier.x, y: y + 0.5, z: z0, size: 4, color: 0x9fe9ff, intensity: 0 });
      const glB = fx.glows.add({ x: pier.x, y: y + 0.5, z: z1, size: 4, color: 0x9fe9ff, intensity: 0 });
      const self = {
        object3D: g, anchors, state: { on: false }, hidden: true,
        onState(key, v) {
          if (key !== 'on') return;
          self.hidden = !v; g.visible = !!v;
          fx.glows.set(glA, { intensity: v ? 0.7 : 0 }); fx.glows.set(glB, { intensity: v ? 0.7 : 0 });
          if (v && !plat) plat = col.addPlatform({ x0: pier.x - 1.55, x1: pier.x + 1.55, z0: z1, z1: z0 + 0.2, y, surface: 'stone' });
          if (!v && plat) { col.removePlatform(plat); plat = null; }
          if (v && env.ready) { fx.api.flash(anchors.from, { color: 0x9fe9ff, size: 10, life: 1.0 }); fx.api.ribbon(anchors.from, anchors.to, { color: 0x9fe9ff, life: 3 }); }
        },
      };
      return self;
    },

    dummy(d) {
      const mesh = new THREE.Mesh(cached('dummy', () => merge([
        part(G.cyl(0.07, 0.09, 1.7, 6), { pos: [0, 0.85, 0], color: 0x6b5140 }),
        part(G.cyl(0.05, 0.05, 1.3, 5), { pos: [0, 1.32, 0], rot: [0, 0, Math.PI / 2], color: 0x6b5140 }),
        part(G.cyl(0.24, 0.2, 0.62, 8), { pos: [0, 1.08, 0], bottom: 0xc9a85c, top: 0xe6cf8a, vary: 0.1 }),
        part(G.sphere(0.19, 7, 5), { pos: [0, 1.68, 0], color: 0xe6cf8a }),
        part(G.torus(0.22, 0.03, 4, 8), { pos: [0, 1.2, 0], rot: [Math.PI / 2, 0, 0], color: 0x9a3f35 }),
        part(G.ring(0.06, 0.1, 8), { pos: [0, 1.1, -0.245], rot: [Math.PI / 2, 0, 0], color: 0xff8f6a, glow: 0.4 }),
      ])), cached('dummyMat', () => structMaterial({ side: THREE.DoubleSide })));
      const pivot = new THREE.Group(); pivot.add(mesh);
      const g = new THREE.Group(); g.add(pivot);
      const anchors = { center: toWorld(d, 0, 1.1, 0), head: toWorld(d, 0, 1.68, 0) };
      col.addCollider({ x: d.x, z: d.z, r: 0.28, y0: d.y, y1: d.y + 1.8, kind: 'structure' });
      let wob = 0, ph = 0;
      return {
        object3D: g, anchors, state: { hit: 0 },
        onState(key) { if (key === 'hit') { wob = 1; ph = Math.random() * 6.28; } },
        update(view) {
          if (wob <= 0.01) { if (wob !== 0) { wob = 0; pivot.rotation.set(0, 0, 0); } return; }
          wob *= Math.exp(-view.dt * 3.2);
          pivot.rotation.x = Math.sin(view.elapsed * 15) * 0.28 * wob * Math.cos(ph);
          pivot.rotation.z = Math.sin(view.elapsed * 15) * 0.28 * wob * Math.sin(ph);
        },
      };
    },

    appletree(d) {
      const mesh = new THREE.Mesh(cached('apple', () => merge([
        part(G.cyl(0.14, 0.26, 2.0, 6, 2), { pos: [0, 1.0, 0], bottom: 0x5a4636, top: 0x7a5f4a, jitter: 0.03 }),
        part(G.cyl(0.07, 0.1, 1.2, 4), { pos: [0.5, 1.95, 0.1], rot: [0, 0, -0.9], color: 0x7a5f4a }),
        part(G.cyl(0.07, 0.1, 1.1, 4), { pos: [-0.45, 2.05, -0.2], rot: [0.3, 0, 0.9], color: 0x7a5f4a }),
        part(G.ico(1.5, 1), { pos: [0, 3.2, 0], scale: [1.25, 0.8, 1.25], bottom: 0x4a9a40, top: 0xb4e070, smooth: new THREE.Vector3(0, 2.5, 0), sway: 1, jitter: 0.1 }),
        part(G.ico(1.0, 0), { pos: [1.2, 2.7, 0.4], scale: [1.1, 0.8, 1.1], bottom: 0x44903c, top: 0xa6d866, smooth: new THREE.Vector3(1.2, 2.2, 0.4), sway: 1 }),
        part(G.ico(1.0, 0), { pos: [-1.1, 2.75, -0.5], scale: [1.1, 0.8, 1.1], bottom: 0x44903c, top: 0xa6d866, smooth: new THREE.Vector3(-1.1, 2.2, -0.5), sway: 1 }),
      ])), shared);
      const FP = [[1.05, 1.86, 0.4], [-0.95, 1.9, -0.55], [0.15, 1.98, -1.05]];
      const fruits = new THREE.Mesh(cached('appleFruit', () => merge(FP.map((p) => merge([
        part(G.ico(0.085, 0), { pos: p, bottom: 0xff8a2b, top: 0xffd84d, glow: 0.35 }),
        part(G.cyl(0.006, 0.006, 0.14, 3), { pos: [p[0], p[1] + 0.13, p[2]], color: 0x5a4636 }),
      ])))), shared);
      const per = fruits.geometry.getAttribute('position').count / 3;
      const g = new THREE.Group(); g.add(mesh, fruits);
      const anchors = {};
      FP.forEach((p, i) => { anchors['fruit' + i] = toWorld(d, p[0], p[1], p[2]); });
      col.addCollider({ x: d.x, z: d.z, r: 0.3, y0: d.y, y1: d.y + 3, kind: 'tree' });
      const n0 = d.data.fruit ?? 3;
      fruits.geometry = fruits.geometry.clone();
      return {
        object3D: g, anchors, state: { fruit: n0 },
        onState(key, v) { if (key === 'fruit') { const n = Math.max(0, Math.min(3, v | 0)); fruits.geometry.setDrawRange(0, n * per); this.n = n; fruits.visible = n > 0; } },
        // 近くでは items が本物の実を anchors に出すので、飾りの実は遠景だけ
        update(view, dist) { fruits.visible = this.n > 0 && !(realItems() && dist < 27); },
      };
    },

    bush(d) {
      const bomb = d.data.itemId === 'bomb';
      const mesh = new THREE.Mesh(cached('bush' + bomb, () => merge([
        part(G.ico(0.62, 1), { pos: [0, 0.42, 0], scale: [1.2, 0.72, 1.1], bottom: bomb ? 0x587f5a : 0x2f5a57, top: bomb ? 0xa8c896 : 0x7fb8a8, smooth: new THREE.Vector3(0, 0, 0), sway: 0.5, jitter: 0.06 }),
        part(G.ico(0.4, 0), { pos: [0.55, 0.3, 0.2], scale: [1.1, 0.75, 1.1], bottom: bomb ? 0x587f5a : 0x2f5a57, top: bomb ? 0x9fbf8c : 0x74ad9d, smooth: new THREE.Vector3(0.5, 0, 0.2), sway: 0.5 }),
      ])), shared);
      const FP = [[0.3, 0.74, -0.42], [-0.42, 0.7, -0.25], [0.62, 0.52, -0.2]];
      const fruits = new THREE.Mesh(cached('bushFruit' + bomb, () => merge(FP.map((p) => part(bomb ? G.ico(0.1, 0) : G.octa(0.065), { pos: p, bottom: bomb ? 0xd0432b : 0x8fd8ff, top: bomb ? 0xffb347 : 0xeafcff, glow: 0.6 })))), cached('bushMat' + bomb, () => structMaterial({ glow: bomb ? 0xff8a4a : 0x9fe3f5, amt: 0.5, night: 0.7 })));
      const per = fruits.geometry.getAttribute('position').count / 3;
      const g = new THREE.Group(); g.add(mesh, fruits);
      const anchors = {};
      FP.forEach((p, i) => { anchors['fruit' + i] = toWorld(d, p[0], p[1], p[2]); });
      const n0 = d.data.fruit ?? 2;
      fruits.geometry = fruits.geometry.clone();
      return {
        object3D: g, anchors, state: { fruit: n0 },
        onState(key, v) { if (key === 'fruit') { const n = Math.max(0, Math.min(3, v | 0)); fruits.geometry.setDrawRange(0, n * per); this.n = n; fruits.visible = n > 0; } },
        update(view, dist) { fruits.visible = this.n > 0 && !(realItems() && dist < 27); },
      };
    },
  };

  // ── 登録 ──
  const list = [], byId = {}, kinds = {};
  for (const d of sp.props) {
    const b = builders[d.kind];
    if (!b) continue;
    let built;
    try { built = b(d); } catch (e) { console.warn('[world] prop build failed', d.id, e); continue; }
    const o = built.object3D;
    o.position.set(d.x, d.y, d.z);
    o.rotation.y = yawRot(d.yaw || 0);
    o.name = 'prop:' + d.id;
    group.add(o);
    const prop = {
      id: d.id, kind: d.kind, x: d.x, y: d.y, z: d.z, r: built.r ?? d.r, yaw: d.yaw || 0, object3D: o,
      state: built.state, anchors: built.anchors, data: d.data,
      setState(key, value) {
        this.state[key] = value;
        try { built.onState && built.onState.call(built, key, value); } catch (e) { console.warn('[world] prop state', d.id, key, e); }
        try { env.ctx.events && env.ctx.events.emit('prop:state', { id: d.id, kind: d.kind, key, value }); } catch (e) { /* noop */ }
      },
      _built: built, _view: built.viewDist ?? VIEW[d.kind] ?? 150,
    };
    // 既定の状態を見た目に反映（イベントは出さない）
    for (const k in built.state) { try { built.onState && built.onState.call(built, k, built.state[k]); } catch (e) { /* noop */ } }
    if (d.data && d.data.lit) { built.state.lit = true; built.onState.call(built, 'lit', true); }
    if (built.hidden) o.visible = false;
    list.push(prop); byId[d.id] = prop;
    (kinds[d.kind] || (kinds[d.kind] = [])).push(prop);
  }
  const api = {
    list, byId,
    ofKind: (kind) => kinds[kind] || [],
    near(x, z, radius, out = []) {
      out.length = 0;
      for (let i = 0; i < list.length; i++) { const p = list[i], dx = p.x - x, dz = p.z - z, rr = radius + (p.r || 0); if (dx * dx + dz * dz <= rr * rr) out.push(p); }
      return out;
    },
  };

  let cullT = 0;
  const active = [];
  function update(view) {
    for (let i = anims.length - 1; i >= 0; i--) {
      const a = anims[i];
      a.t += view.dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) anims.splice(i, 1);
    }
    cullT -= view.dt;
    if (cullT <= 0 || view.jump) {
      cullT = 0.25;
      active.length = 0;
      for (let i = 0; i < list.length; i++) {
        const p = list[i], dx = p.x - view.cam.x, dz = p.z - view.cam.z, d2 = dx * dx + dz * dz;
        const vis = !p._built.hidden && d2 < p._view * p._view;
        p.object3D.visible = vis;
        if (vis && p._built.update && d2 < 150 * 150) { p._dist = Math.sqrt(d2); active.push(p); }
      }
    }
    for (let i = 0; i < active.length; i++) { const p = active[i]; p._built.update.call(p._built, view, p._dist); }
  }
  return { group, update, api };
}
