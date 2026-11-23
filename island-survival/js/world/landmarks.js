// world/landmarks.js — fixed places with their own meshes: the rock cave on the hill's flank (a natural shelter:
// rain 1.0, wind 0.9, 21 °C — DESIGN.md §8.2, §12.3) and the wreck on the north-east shore with salvage
// (nails, wire, sail cloth, rope, glass bottles, a barrel, a rusty tool box — §8.2 `wreck`).
import * as THREE from 'three';
import { RNG } from '../core/rng.js';

export class Landmarks {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.name = 'landmarks';
  }

  init(game) {
    this.game = game;
    game.world.scene.add(this.group);
    this.buildCave();
    this.buildWreck();
  }

  buildCave() {
    const g = this.game, t = g.world.terrain, L = g.world.layout.cave;
    const rng = new RNG(91);
    // move the entrance onto solid ground on the hill side
    const p = { x: L.x, z: L.z };
    const y = t.heightAt(p.x, p.z);
    const mat = new THREE.MeshStandardMaterial({ color: '#6f685e', roughness: 1, flatShading: true });
    const dark = new THREE.MeshBasicMaterial({ color: '#0b0a09' });
    const grp = new THREE.Group();
    grp.position.set(p.x, y, p.z);
    // face away from the hill top
    const pk = g.world.layout.peak;
    grp.rotation.y = Math.atan2(p.x - pk.x, p.z - pk.z);
    // an arch of boulders and a roof slab
    for (let i = 0; i < 14; i++) {
      const a = (i / 13) * Math.PI;
      const r = rng.float(1.1, 1.7);
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), mat);
      m.position.set(Math.cos(a) * 3.2, Math.sin(a) * 3.0, rng.float(-0.4, 0.4));
      m.rotation.set(rng.next() * 3, rng.next() * 3, 0);
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 7), mat);
    roof.position.set(0, 3.6, -3); roof.rotation.x = 0.08;
    roof.castShadow = true; grp.add(roof);
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 7), mat); w.position.set(sx * 3.6, 1.6, -3); grp.add(w); }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), dark); back.position.set(0, 1.8, -6.4); grp.add(back);
    this.group.add(grp);
    // shelter zone: from the entrance inward
    const inward = new THREE.Vector3(0, 0, -3).applyAxisAngle(new THREE.Vector3(0, 1, 0), grp.rotation.y);
    this.cave = { x: p.x + inward.x, z: p.z + inward.z, r: 3.6, floor: y };
    // walls block walking through the sides
    for (const sx of [-1, 1]) {
      const side = new THREE.Vector3(sx * 3.6, 0, -3).applyAxisAngle(new THREE.Vector3(0, 1, 0), grp.rotation.y);
      g.world.nodes.add({ kind: 'collider', x: p.x + side.x, y, z: p.z + side.z, r: 0.9, solid: true, cr: 0.9, alive: true });
    }
  }

  buildWreck() {
    const g = this.game, t = g.world.terrain, L = g.world.layout.wreck;
    const s = t.shorePoint(Math.atan2(L.z, L.x), 0.6) || { x: L.x, z: L.z };
    const y = Math.max(-0.4, t.heightAt(s.x, s.z));
    const wood = new THREE.MeshStandardMaterial({ color: '#5a4430', roughness: 0.95, flatShading: true });
    const paint = new THREE.MeshStandardMaterial({ color: '#2f5e7a', roughness: 0.8, flatShading: true });
    const grp = new THREE.Group();
    grp.position.set(s.x, y, s.z);
    grp.rotation.set(0.12, Math.atan2(s.x, s.z) + 1.2, 0.35);
    // a broken hull: ribs + planks
    for (let i = 0; i < 9; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 5, 10, Math.PI), wood);
      rib.position.set(0, 0.6, -4 + i * 1.0); rib.rotation.z = Math.PI;
      rib.scale.set(1, 1.2 - Math.abs(i - 4) * 0.08, 1);
      grp.add(rib);
    }
    for (let k = 0; k < 6; k++) {
      const a = Math.PI + (k / 5) * Math.PI;
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 7 - (k % 2) * 2.5), k < 2 ? paint : wood);
      pl.position.set(Math.cos(a) * 1.55, 0.6 + Math.sin(a) * 1.8, -0.2 + (k % 3) * 0.4);
      pl.rotation.z = a + Math.PI / 2;
      grp.add(pl);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 6, 6), wood);
    mast.position.set(0.4, 2.2, 0.5); mast.rotation.z = 1.1; grp.add(mast);
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.group.add(grp);
    // salvage on and around the wreck
    const rng = new RNG(1234);
    const loot = [['nail', 4], ['nail', 4], ['wire', 1], ['sailcloth', 1], ['rope_scrap', 1], ['rope_scrap', 1], ['glass_bottle', 1], ['metal_scrap', 1], ['metal_scrap', 1], ['tarp', 1], ['can', 1]];
    for (const [id, n] of loot) {
      const a = rng.float(0, Math.PI * 2), r = rng.float(1.5, 5);
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      g.spawnDrop?.(id, n, x, z, { q: rng.int(50, 85) });
    }
    this.wreck = { x: s.x, z: s.z };
    g.world.nodes.add({ kind: 'collider', x: s.x, y, z: s.z, r: 1.4, solid: true, cr: 1.4, alive: true });
  }

  /** the cave shelter if (x, z) is inside it */
  shelterAt(x, z) {
    const c = this.cave;
    if (c && Math.hypot(x - c.x, z - c.z) < c.r) return { rain: 1, wind: 0.9, insul: 0, name: '洞窟', fireInside: true, sleep: 0, cave: true, bugproof: false };
    return null;
  }
}
