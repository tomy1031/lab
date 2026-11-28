// player/combat.js — shooting, throwing and striking (DESIGN.md §9.3, §22.2, §22.3).
//   arrows: gravity 9.8 m/s², drag (0.6 % of speed per metre), side wind, power ∝ (v / v0)²
//   rifle: 800 m/s, zeroed at 100 m, aim sway (stance, breathing, stamina, cold) and "hold your breath",
//          the shot scares animals within 150 m for 6 h; bolt 1.2 s
//   thrown spear 16 m/s · thrown stone 20 m/s · melee (spear thrust 2.2 m, knife / axe / club 1.6 m)
// Items on the ground (missed arrows, dropped things, drift) are "drop" nodes handled here too.
import * as THREE from 'three';
import { itemDef } from '../data/items.js';
import { makeStack } from '../sim/inventory.js';

const G = 9.8;

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.drawT = 0;           // seconds the bow has been drawn
    this.draw = 0;            // 0…1
    this.aiming = false;      // right button / gesture
    this.breath = { hold: 0, recover: 0 };
    this.boltT = 0;
    this.runT = 0;            // seconds since running (sway ×2 for 10 s)
    this.sway = new THREE.Vector2();
    this.dropMat = new THREE.MeshStandardMaterial({ color: '#c8b48a', roughness: 0.8 });
  }

  init(game) { this.game = game; }

  // ---------------------------------------------------------------- drops on the ground
  spawnDrop(id, n = 1, x, z, extra = {}) {
    const g = this.game, t = g.world.terrain;
    const d = itemDef(id);
    if (!d) { console.warn('drop: unknown item', id); return null; }
    const y = t.heightAt(x, z);
    const stack = extra.uid ? extra : makeStack(id, n, extra);
    const mesh = this.dropMesh(stack);
    mesh.position.set(x, y + 0.08, z);
    g.world.scene.add(mesh);
    const node = g.world.nodes.add({ kind: 'drop', x, y, z, r: 0.35, object3d: mesh, pickY: 0.2, priority: 1, data: { stack, name: d.name } });
    return node;
  }

  dropMesh(stack) {
    const d = itemDef(stack.id, stack);
    const grp = new THREE.Group();
    if (stack.id === 'arrow_pro' || stack.id === 'arrow') {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.7, 5), new THREE.MeshStandardMaterial({ color: '#7a5a38' }));
      s.rotation.z = Math.PI / 2 - 0.5; s.position.y = 0.15; grp.add(s);
      return grp;
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(d?.icon || '📦'), depthWrite: false }));
    sprite.scale.setScalar(0.45); sprite.position.y = 0.25;
    grp.add(sprite);
    const base = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.18, depthWrite: false }));
    base.rotation.x = -Math.PI / 2; base.position.y = 0.01;
    grp.add(base);
    return grp;
  }

  pickDrop(node) {
    const s = node.data.stack;
    this.game.sys.player.inv.addStack({ ...s, uid: undefined });
    this.game.world.nodes.remove(node);
    return s;
  }

  // ---------------------------------------------------------------- aiming
  /** the direction of a shot: camera forward (+ gesture aim offset) + sway */
  shotDir(spreadDeg = 0) {
    const cam = this.game.renderer.camera;
    const dir = new THREE.Vector3();
    const aim = this.game.hands?.ready ? this.game.hands.motion?.state?.aim : null;
    if (aim && this.game.setup?.control === 'gesture') {
      const ndc = new THREE.Vector2((aim.x - 0.5) * 2 * 0.6, -(aim.y - 0.5) * 2 * 0.6);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, cam);
      dir.copy(ray.ray.direction);
    } else if (this.game.player?.vr && this.game.player.aim) dir.copy(this.game.player.aim.dir);
    else cam.getWorldDirection(dir);
    const sx = (this.sway.x + (Math.random() - 0.5) * spreadDeg) * Math.PI / 180, sy = (this.sway.y + (Math.random() - 0.5) * spreadDeg) * Math.PI / 180;
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize();
    return dir.addScaledVector(right, sx).addScaledVector(up, sy).normalize();
  }

  /** rifle sway radius in degrees (§9.3 + §22.2) */
  swayRadius() {
    const g = this.game, P = g.player, body = g.sys.player.body;
    let r = 0.6 * (P.moveInfo.moving ? 3 : P.crouch ? 0.6 : 1);
    if (body.s.stamina < 30) r *= 2;
    r *= body.shake;
    if (this.runT > 0) r *= 2;
    if (this.breath.hold > 0) r *= 0.3; else if (this.breath.recover > 0) r *= 1.5;
    if (this.rested) r *= 0.4;
    return r;
  }

  update(dt) {
    const g = this.game, P = g.player;
    if (P.moveInfo.running) this.runT = 10; else this.runT = Math.max(0, this.runT - dt);
    this.breath.hold = Math.max(0, this.breath.hold - dt);
    if (this.breath.hold <= 0 && this.breath.wasHolding) { this.breath.wasHolding = false; this.breath.recover = 5; }
    this.breath.recover = Math.max(0, this.breath.recover - dt);
    this.boltT = Math.max(0, this.boltT - dt);
    // sway: a slow figure + breathing (4 s cycle)
    const t = performance.now() / 1000, R = this.aiming ? this.swayRadius() : 0;
    this.sway.set(Math.sin(t * 0.9) * R * 0.7 + Math.sin(t * 2.3) * R * 0.3, Math.sin(t * Math.PI / 2) * R * 0.8 + Math.cos(t * 1.7) * R * 0.2);
    // projectiles
    for (const p of this.projectiles) this.step(p, dt);
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  holdBreath() { if (this.breath.recover <= 0 && this.breath.hold <= 0) { this.breath.hold = 3; this.breath.wasHolding = true; } }

  // ---------------------------------------------------------------- firing
  /**
   * launch a projectile. kind: 'arrow' | 'bullet' | 'spear' | 'stone'. o: { v0, power, item (stack to drop where it lands), spread }
   */
  launch(kind, o) {
    const g = this.game, cam = g.renderer.camera;
    const dir = this.shotDir(o.spread || 0);
    const vrAim = this.game.player?.vr && this.game.player.aim;
    const pos = (vrAim ? vrAim.origin.clone() : cam.position.clone()).addScaledVector(dir, 0.4).add(new THREE.Vector3(0, vrAim ? 0 : -0.05, 0));
    let mesh = null;
    if (kind !== 'bullet') {
      mesh = new THREE.Group();
      const len = kind === 'spear' ? 1.7 : kind === 'arrow' ? 0.7 : 0.1;
      const m = kind === 'stone' ? new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color: '#77736b' }))
        : new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 5), new THREE.MeshStandardMaterial({ color: '#7a5a38' }));
      if (kind !== 'stone') m.rotation.x = Math.PI / 2;
      mesh.add(m);
      mesh.position.copy(pos);
      g.world.scene.add(mesh);
    }
    const W = g.sys.weather;
    const windAcc = new THREE.Vector3(Math.sin(W?.windDir ?? 0), 0, Math.cos(W?.windDir ?? 0)).multiplyScalar((W?.windSpeed ?? 0) * (kind === 'bullet' ? 0.005 : 0.08));
    const p = { kind, pos, vel: dir.clone().multiplyScalar(o.v0), v0: o.v0, power: o.power, mesh, item: o.item || null, t: 0, travelled: 0, done: false, windAcc, startPos: pos.clone() };
    this.projectiles.push(p);
    // bullets resolve within one frame or two
    if (kind === 'bullet') { for (let i = 0; i < 6 && !p.done; i++) this.step(p, 1 / 60); }
    return p;
  }

  step(p, dt) {
    if (p.done) return;
    const g = this.game, t = g.world.terrain;
    const sub = p.kind === 'bullet' ? 10 : 3;
    for (let k = 0; k < sub && !p.done; k++) {
      const h = dt / sub;
      const a = p.pos.clone();
      p.vel.y -= G * h;
      p.vel.addScaledVector(p.windAcc, h);
      const sp = p.vel.length();
      const stepLen = sp * h;
      if (p.kind === 'arrow' || p.kind === 'spear' || p.kind === 'stone') p.vel.multiplyScalar(Math.max(0, 1 - 0.006 * stepLen));
      p.pos.addScaledVector(p.vel, h);
      p.t += h; p.travelled += stepLen;
      // animals
      const hit = g.sys.fauna?.hitTest(a, p.pos, p.kind === 'spear' ? 0.05 : 0);
      if (hit) {
        if (p.kind === 'arrow' && g.sys.fauna.dodges(hit.animal, p.t)) { hit.animal.state !== 'flee' && g.sys.fauna.startFlee(hit.animal, g.player.pos.clone()); }
        else {
          const v = p.vel.length();
          const power = p.power * Math.min(1, (v / p.v0) ** 2);
          const res = g.sys.fauna.damage(hit, { power, kind: p.kind === 'bullet' ? 'bullet' : p.kind });
          g.bus.emit('hit', { kind: hit.animal.kind, name: hit.animal.sp.name, part: res.part, killed: res.killed, dist: p.startPos.distanceTo(p.pos), weapon: p.kind });
          this.finish(p, hit.point, true, hit.animal);
          return;
        }
      }
      // ground / water / trees
      const gy = t.heightAt(p.pos.x, p.pos.z);
      const sea = g.player.seaLevel;
      const solid = g.world.nodes.solids(p.pos.x, p.pos.z, 1).find((n) => Math.hypot(n.x - p.pos.x, n.z - p.pos.z) < (n.cr ?? 0.3) && p.pos.y < gy + (n.height || 6));
      if (p.pos.y <= gy || solid || p.travelled > 450) { this.finish(p, p.pos, false, null, solid); return; }
      if (p.pos.y <= sea && gy < sea) { this.finish(p, p.pos, false, null, null, true); return; }
    }
    if (p.mesh) { p.mesh.position.copy(p.pos); p.mesh.lookAt(p.pos.clone().add(p.vel)); }
  }

  finish(p, at, hitAnimal, animal, tree, water) {
    p.done = true;
    const g = this.game;
    if (p.mesh) g.world.scene.remove(p.mesh);
    if (p.kind === 'bullet') return;
    g.sys.sfx?.play(water ? 'splash' : hitAnimal ? 'arrow_hit' : 'arrow_miss');
    if (!p.item) return;
    // arrows: hit → stays with the animal (20 % pass through); miss → found 60 % of the time; rock → tip breaks 50 %
    let keep = true;
    if (p.kind === 'arrow') {
      const rocky = ['rocks', 'cliff', 'hill'].includes(g.world.terrain.zoneAt(at.x, at.z));
      keep = hitAnimal ? true : water ? false : g.rng.next() < 0.6 * (rocky ? 0.5 : 1);
      if (hitAnimal && animal?.node) { animal.node.data.arrows = (animal.node.data.arrows || 0) + 1; animal.node.data.arrowItem = p.item.id; return; }
      if (hitAnimal && animal) { animal.arrowsIn = (animal.arrowsIn || 0) + 1; animal.arrowItem = p.item.id; return; }
    }
    if (water && p.kind !== 'spear') keep = false;
    if (keep) this.spawnDrop(p.item.id, 1, at.x, at.z, { ...p.item, n: 1, uid: undefined });
  }

  /** melee strike along the view: returns the hit or null */
  melee(reach, power, kind = 'melee') {
    const g = this.game, cam = g.renderer.camera;
    const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    const a = cam.position.clone();
    if (g.player?.vr && g.player.aim) { dir.copy(g.player.aim.dir); a.copy(g.player.aim.origin); } // VR: along the right controller
    // reach down a bit so low animals (crabs, snakes) can be hit
    const b = a.clone().addScaledVector(dir, reach);
    let hit = g.sys.fauna?.hitTest(a, b, 0.12);
    if (!hit) { const low = b.clone(); low.y -= 0.9; hit = g.sys.fauna?.hitTest(a, low, 0.18); }
    if (!hit) return null;
    const res = g.sys.fauna.damage(hit, { power, kind });
    g.bus.emit('hit', { kind: hit.animal.kind, name: hit.animal.sp.name, part: res.part, killed: res.killed, dist: a.distanceTo(hit.point), weapon: kind });
    return { ...hit, ...res };
  }
}

const emojiCache = new Map();
function emojiTexture(ch) {
  if (emojiCache.has(ch)) return emojiCache.get(ch);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.font = '48px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ch, 32, 36);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  emojiCache.set(ch, t);
  return t;
}
