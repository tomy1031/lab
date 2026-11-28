// js/room.js — where the duel happens: a meeting room high up in an office tower at night. A long table
// with a glowing duel mat in the middle, the city lights through the windows, soft light from above.
// Everything is built from primitives and canvas textures (works offline, light enough for Quest).
import * as THREE from 'three';
import { canvasTex } from './board.js';

export const TABLE_H = 0.74; // table top height (metres), a normal desk

function skyline(w = 2048, h = 512) {
  const { ctx: c, tex } = canvasTex(w, h);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#060b22'); g.addColorStop(0.55, '#13204e'); g.addColorStop(1, '#3a2d5e');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // stars
  c.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 160; i++) { const x = (i * 733) % w, y = (i * 389) % (h * 0.45); c.fillRect(x, y, 1.6, 1.6); }
  // far towers
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [base, col, lit, scale] of [[0.62, '#1a2348', 0.25, 0.6], [0.72, '#0e1530', 0.45, 1]]) {
    let x = 0;
    while (x < w) {
      const bw = (30 + rnd() * 70) * scale, bh = (60 + rnd() * 220) * scale;
      const top = h * base - bh + h * 0.28;
      c.fillStyle = col; c.fillRect(x, top, bw, h - top);
      if (rnd() < 0.25) { c.fillStyle = '#ff4d4d'; c.fillRect(x + bw / 2 - 1.5, top - 6, 3, 3); }
      for (let wy = top + 8; wy < h - 4; wy += 9 * scale) for (let wx = x + 5; wx < x + bw - 5; wx += 8 * scale) {
        if (rnd() < lit) { c.fillStyle = rnd() < 0.8 ? 'rgba(255,214,140,0.85)' : 'rgba(160,220,255,0.85)'; c.fillRect(wx, wy, 3.5 * scale, 4 * scale); }
      }
      x += bw + rnd() * 6;
    }
  }
  return tex;
}

function carpet() {
  const { ctx: c, tex } = canvasTex(512, 512);
  c.fillStyle = '#1b2236'; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; c.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
  c.strokeStyle = 'rgba(120,150,220,0.08)'; c.lineWidth = 2;
  for (let x = 0; x < 512; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 512); c.stroke(); c.beginPath(); c.moveTo(0, x); c.lineTo(512, x); c.stroke(); }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

function wood() {
  const { ctx: c, tex } = canvasTex(512, 256);
  c.fillStyle = '#2a1d16'; c.fillRect(0, 0, 512, 256);
  for (let y = 0; y < 256; y += 2) { c.fillStyle = `rgba(${90 + Math.sin(y * 0.21) * 20},${60 + Math.sin(y * 0.13) * 10},40,0.25)`; c.fillRect(0, y, 512, 1); }
  return tex;
}

export class Room {
  constructor(scene, renderer) {
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.background = new THREE.Color('#070b1c');
    scene.fog = new THREE.Fog('#070b1c', 9, 22);
    // lights
    const hemi = new THREE.HemisphereLight('#c9d8ff', '#2a2238', 1.1);
    this.group.add(hemi);
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(1.5, 4, 2);
    this.group.add(key);
    const rim = new THREE.PointLight('#7fb0ff', 6, 6, 1.6);
    rim.position.set(0, 2.2, -1.4);
    this.group.add(rim);
    // floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ map: carpet(), roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);
    // window wall (a big cylinder around the room shows the city)
    const sky = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 7, 48, 1, true, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ map: skyline(), side: THREE.BackSide, fog: false }));
    sky.material.map.wrapS = THREE.RepeatWrapping;
    sky.material.map.repeat.set(2, 1);
    sky.position.y = 2.6;
    this.group.add(sky);
    // window mullions
    const mull = new THREE.MeshStandardMaterial({ color: '#0d1224', roughness: 0.6 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 7, 0.12), mull);
      m.position.set(Math.sin(a) * 8.9, 2.6, Math.cos(a) * 8.9);
      this.group.add(m);
    }
    const sill = new THREE.Mesh(new THREE.CylinderGeometry(8.95, 8.95, 0.5, 48, 1, true), mull);
    sill.material.side = THREE.DoubleSide;
    sill.position.y = 0.25;
    this.group.add(sill);
    // ceiling lights ring
    const ringMat = new THREE.MeshBasicMaterial({ color: '#cfe0ff' });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.03, 8, 64), ringMat);
    ring.rotation.x = Math.PI / 2; ring.position.y = 3.2;
    this.group.add(ring);
    // the table
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 1.5), new THREE.MeshStandardMaterial({ map: wood(), roughness: 0.5, metalness: 0.05 }));
    top.position.y = TABLE_H - 0.025;
    this.group.add(top);
    const legMat = new THREE.MeshStandardMaterial({ color: '#11151f', metalness: 0.6, roughness: 0.4 });
    for (const [x, z] of [[-0.85, -0.65], [0.85, -0.65], [-0.85, 0.65], [0.85, 0.65]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, TABLE_H - 0.05, 0.06), legMat);
      leg.position.set(x, (TABLE_H - 0.05) / 2, z);
      this.group.add(leg);
    }
    // chairs (yours is behind you; theirs across)
    for (const z of [1.05, -1.05]) this.group.add(chair(z));
    this.table = top;
    // floating dust motes for depth
    const n = 160, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 8; pos[i * 3 + 1] = Math.random() * 3; pos[i * 3 + 2] = (Math.random() - 0.5) * 8; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(pg, new THREE.PointsMaterial({ color: '#9fc0ff', size: 0.015, transparent: true, opacity: 0.5, depthWrite: false }));
    this.group.add(this.motes);
    this.t = 0;
  }
  tick(dt) {
    this.t += dt;
    this.motes.rotation.y += dt * 0.01;
  }
}

function chair(z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#232a3d', roughness: 0.8 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.48), mat);
  seat.position.y = 0.46;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.07), mat);
  back.position.set(0, 0.8, Math.sign(z) * 0.22);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), new THREE.MeshStandardMaterial({ color: '#888', metalness: 0.7, roughness: 0.3 }));
  post.position.y = 0.21;
  g.add(seat, back, post);
  g.position.z = z * 1.15;
  return g;
}
