// js/table.js — the duel mat in 3D and every card on it. sync(D) makes the table match the duel state:
// each card is one object found by its id (hand / team / back / field / plots by uid, V stages by slot, bugs by
// bid), so a card that moves from the hand to the team glides there. New cards come from the deck, cards that
// leave go to the discard pile.
//
// The V is drawn on the mat: the design stages go down the left arm, Coding sits at the bottom, the tests go up
// the right arm at the same heights as the stages they check (dotted lines join the pairs), Release is at the top
// right. Stages not placed yet are shown as see-through "plans" on their slots, so the whole project is always in
// view; the next one glows.
import * as THREE from 'three';
import { CardMesh, CARD_W, CARD_H, faceTexture, clearFaceCache } from './cardmesh.js';
import { canvasTex } from './board.js';
import { TABLE_H } from './room.js';
import { FONT } from './text.js';
import { C } from './engine.js';
import { cardFace } from './faces.js';

const Y = TABLE_H + 0.002;
const UP = new THREE.Vector3(0, 1, 0);
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); // face up on the table
const FLAT_DOWN = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI)); // face down
const ENEMY_FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI)); // face up, readable from the enemy side (we keep ours readable instead)

export const Z = { enemy: -0.5, enemyHand: -0.7, team: 0.37, back: 0.37 };
export const SLOT_SCALE = 0.9;

// positions of the V slots for a track (index → {x, z, level, side})
export function vLayout(track) {
  const groups = track.map((id) => C(id).group);
  const mk = groups.indexOf('make');
  const nDesign = groups.filter((g) => g === 'design').length;
  const dz = 0.128, dx = nDesign >= 3 ? 0.138 : 0.16, zBottom = 0.15;
  const out = [];
  let testLevel = 0, topZ = zBottom;
  track.forEach((id, i) => {
    const g = groups[i];
    let level, side;
    if (g === 'design') { level = mk - i; side = -1; }
    else if (g === 'make') { level = 0; side = 0; }
    else if (g === 'test') { testLevel++; level = testLevel; side = 1; }
    else { level = Math.max(1, testLevel); side = 2; }
    let x = side === 0 ? 0 : side === -1 ? -level * dx : level * dx;
    let z = zBottom - level * dz;
    if (side === 2) { x = testLevel * dx + 0.16; z = zBottom - testLevel * dz; }
    topZ = Math.min(topZ, z);
    out.push({ x, z, level, side, id });
  });
  out.opsPos = { x: out[out.length - 1].x + 0.15, z: out[out.length - 1].z };
  out.topZ = topZ;
  return out;
}

// a canvas texture with a big number / text (for the little signs on bugs and troubles)
function labelSprite(w = 128, h = 64) {
  const { canvas, ctx, tex } = canvasTex(w, h);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.renderOrder = 40;
  s.raycast = () => {};
  s.userData.paint = (text, bg = '#d22', fg = '#fff') => {
    if (s.userData.last === text + bg) return;
    s.userData.last = text + bg;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(4, 4, w - 8, h - 8, h / 2 - 4); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = fg; ctx.font = `900 ${h * 0.62}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
    tex.needsUpdate = true;
  };
  return s;
}

// a bug: a red beetle (found) or a pale egg with "?" (not found yet). Size 1, 2, 4, 8 makes it bigger.
const bugMat = new THREE.MeshStandardMaterial({ color: '#e0262f', roughness: 0.35, metalness: 0.1, emissive: '#400000' });
const bugDark = new THREE.MeshStandardMaterial({ color: '#2a0a0c', roughness: 0.6 });
const eggMat = new THREE.MeshStandardMaterial({ color: '#f3e9ff', roughness: 0.3, transparent: true, opacity: 0.85, emissive: '#3a2a55' });
const BUG_HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
const BUG_GEO = { hit: new THREE.SphereGeometry(0.02, 8, 6), body: new THREE.SphereGeometry(0.011, 12, 8), head: new THREE.SphereGeometry(0.0062, 10, 6), leg: new THREE.CylinderGeometry(0.0009, 0.0009, 0.012, 4), egg: new THREE.SphereGeometry(0.01, 12, 8) };
function makeBug() {
  const g = new THREE.Group();
  const beetle = new THREE.Group();
  const body = new THREE.Mesh(BUG_GEO.body, bugMat);
  body.scale.set(1, 0.65, 1.3);
  const head = new THREE.Mesh(BUG_GEO.head, bugDark);
  head.position.set(0, 0.001, -0.014);
  beetle.add(body, head);
  const legG = BUG_GEO.leg;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(legG, bugDark);
    l.position.set(s * 0.011, -0.002, -0.006 + i * 0.006);
    l.rotation.z = s * 1.1;
    beetle.add(l);
  }
  const egg = new THREE.Mesh(BUG_GEO.egg, eggMat);
  egg.scale.set(0.85, 1.15, 0.85);
  egg.position.y = 0.004;
  const label = labelSprite();
  label.scale.set(0.026, 0.013, 1);
  label.position.y = 0.024;
  // a still, invisible ball is what the pointer hits (the bug itself wiggles and bounces)
  const hit = new THREE.Mesh(BUG_GEO.hit, BUG_HIT_MAT);
  hit.position.y = 0.006;
  for (const part of [beetle, egg]) part.traverse((x) => { x.raycast = () => {}; });
  g.add(hit, beetle, egg, label);
  g.userData.parts = { beetle, egg, label };
  return g;
}

// a hologram that rises from a card (a stage's or trouble's picture on a glowing plane)
export function hologram(card, size = 0.16) {
  const { ctx, tex } = canvasTex(256, 256);
  const g = new THREE.Group();
  ctx.clearRect(0, 0, 256, 256);
  const face = faceTexture(card);
  // draw the art region of the card face (it is a canvas texture)
  const src = face.image;
  ctx.save();
  ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(src, 30, 172, 452, 250, -60, 26, 376, 208);
  ctx.restore();
  ctx.strokeStyle = 'rgba(160,230,255,0.9)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(128, 128, 120, 0, Math.PI * 2); ctx.stroke();
  tex.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  m.renderOrder = 35;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.35, size * 0.45, 0.25, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#7fe3ff', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 0.125;
  g.add(beam, m);
  g.userData.plane = m; g.userData.beam = beam;
  return g;
}

export class Table {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    app.scene.add(this.group);
    this.cards = new Map(); // key → CardMesh
    this.bugs = new Map(); // bid → bug object
    this.extras = new THREE.Group(); // V lines, slot frames
    this.group.add(this.extras);
    this.mat = this.makeMat();
    this.group.add(this.mat);
    this.handGroup = new THREE.Group(); // PC: on the camera. VR: in the world
    this.over = new Map(); // key → {pos, quat, scale} overrides for effects
    this.hoverKey = null;
    this.highlight = new Map(); // key → colour
    this.dim = false;
    this.t = 0;
    this.stamps = new Map();
    this.layout = null;
    this.vr = false;
    // the deck / discard piles (a few stacked card backs)
    this.piles = {};
    for (const [name, x, z, enemy] of [['deck', 0.63, 0.13, false], ['discard', 0.76, 0.13, false], ['edeck', 0.56, -0.5, true], ['ediscard', 0.69, -0.5, true]]) {
      const g = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const c = new CardMesh({ id: 'pile', type: 'unit', name: '' });
        c.quaternion.copy(name.includes('discard') ? FLAT : FLAT_DOWN);
        if (name.includes('discard')) c.visible = false;
        c.position.set(0, i * 0.0022, 0);
        c.scale.setScalar(0.85);
        g.add(c);
      }
      g.position.set(x, Y, z);
      g.userData.hit = { kind: 'pile', pile: name };
      g.userData.count = 0;
      const lab = labelSprite(160, 64);
      lab.scale.set(0.06, 0.024, 1);
      lab.position.set(0, 0.05, 0.05);
      g.add(lab);
      g.userData.label = lab;
      this.group.add(g);
      this.piles[name] = g;
    }
  }

  makeMat() {
    const { ctx: c, tex } = canvasTex(2048, 1600);
    const W = 2048, H = 1600;
    const g = c.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, '#16285a'); g.addColorStop(1, '#0a1230');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(127,227,255,0.12)'; c.lineWidth = 2;
    for (let x = 0; x < W; x += 64) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = 0; y < H; y += 64) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    c.strokeStyle = 'rgba(255,207,63,0.6)'; c.lineWidth = 8;
    c.beginPath(); c.roundRect(20, 20, W - 40, H - 40, 60); c.stroke();
    // the centre line between the two sides
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 4; c.setLineDash([24, 18]);
    c.beginPath(); c.moveTo(60, H * 0.33); c.lineTo(W - 60, H * 0.33); c.stroke(); c.setLineDash([]);
    tex.anisotropy = 8;
    this.matCanvas = { c, tex, W, H };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.84, 1.44), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = TABLE_H + 0.0005;
    return m;
  }

  // zone labels painted on the mat (metres → mat pixels)
  paintZones(chapterTrack) {
    const { c, tex, W, H } = this.matCanvas;
    const px = (x) => (x / 1.84 + 0.5) * W, pz = (z) => (z / 1.44 + 0.5) * H;
    const zone = (x0, z0, x1, z1, label, col) => {
      c.fillStyle = col.replace('1)', '0.08)'); c.strokeStyle = col.replace('1)', '0.45)'); c.lineWidth = 4;
      c.beginPath(); c.roundRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0), 24); c.fill(); c.stroke();
      c.fillStyle = col.replace('1)', '0.75)'); c.font = `800 30px ${FONT}`; c.textAlign = 'left';
      c.fillText(label, px(x0) + 16, pz(z0) + 38);
    };
    zone(-0.29, -0.6, 0.29, -0.4, 'トラブル  Trouble', 'rgba(190,140,255,1)');
    zone(-0.74, -0.6, -0.38, -0.4, 'たくらみ  Plot', 'rgba(150,160,220,1)');
    zone(-0.74, 0.27, -0.26, 0.47, 'チーム  Team', 'rgba(110,170,255,1)');
    zone(0.26, 0.27, 0.74, 0.47, 'そなえ  Guard / Doc', 'rgba(255,140,190,1)');
    tex.needsUpdate = true;
  }

  // set up the V for this duel: slots, pair lines, plan cards
  setTrack(D) {
    this.extras.clear();
    for (const [k, m] of this.cards) if (k.startsWith('v:') || k.startsWith('plan:')) { this.group.remove(m); this.cards.delete(k); }
    this.layout = vLayout(D.track);
    this.paintZones();
    const L = this.layout;
    // the V line
    const pts = L.filter((p) => p.side !== 2).map((p) => new THREE.Vector3(p.x, Y + 0.001, p.z));
    const vline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffcf3f', transparent: true, opacity: 0.55 }));
    this.extras.add(vline);
    // slot frames
    for (const p of L) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W * SLOT_SCALE + 0.012, CARD_H * SLOT_SCALE + 0.012), new THREE.MeshBasicMaterial({ color: p.side === 2 ? '#ffcf3f' : '#7fe3ff', transparent: true, opacity: 0.16, depthWrite: false }));
      f.rotation.x = -Math.PI / 2;
      f.position.set(p.x, Y + 0.0006, p.z);
      this.extras.add(f);
    }
    // pair lines (dotted): test ↔ the stages it checks
    this.pairLines = [];
    for (const [tid, pids] of Object.entries(D.pair)) {
      const ti = D.track.indexOf(tid);
      for (const pid of pids) {
        const pi = D.track.indexOf(pid);
        const a = L[ti], b = L[pi];
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(b.x + 0.05, Y + 0.0015, b.z), new THREE.Vector3(a.x - 0.05, Y + 0.0015, a.z)]);
        const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#7fe3ff', dashSize: 0.012, gapSize: 0.01, transparent: true, opacity: 0.6 }));
        line.computeLineDistances();
        line.userData = { test: ti, stage: pi };
        this.extras.add(line);
        this.pairLines.push(line);
      }
    }
    // ops marker
    const ops = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 32), new THREE.MeshBasicMaterial({ color: '#ffcf3f', transparent: true, opacity: 0.5 }));
    ops.rotation.x = -Math.PI / 2; ops.position.set(L.opsPos.x, Y + 0.001, L.opsPos.z);
    this.extras.add(ops);
    this.opsRing = ops;
  }

  pilePos(name) { return this.piles[name].position.clone().add(new THREE.Vector3(0, 0.02, 0)); }

  // get (or make) the card object for a key
  ensure(key, card, from) {
    let m = this.cards.get(key);
    if (!m) {
      m = new CardMesh(card, { ruby: this.app.settings.ruby });
      if (from) { m.position.copy(from.pos); if (from.quat) m.quaternion.copy(from.quat); m.scale.setScalar(from.scale || 1); }
      this.group.add(m);
      this.cards.set(key, m);
      m.userData.key = key;
      m.userData.born = this.t;
    } else if (m.card.id !== card.id || m.card.faceKey !== card.faceKey) m.setCard(card, { ruby: this.app.settings.ruby });
    if (m.userData.leaving) { m.userData.leaving = 0; if (m.parent !== this.group && m.parent !== this.handGroup) this.group.add(m); }
    m.userData.seen = this.syncN;
    return m;
  }

  // ---- sync with the duel ----
  sync(D) {
    if (!this.layout) this.setTrack(D);
    this.syncN = (this.syncN || 0) + 1;
    const L = this.layout;
    const deckFrom = { pos: this.pilePos('deck'), quat: FLAT_DOWN, scale: 0.85 };
    const edeckFrom = { pos: this.pilePos('edeck'), quat: FLAT_DOWN, scale: 0.85 };
    // V slots: placed stages (solid) and plans (see-through)
    D.track.forEach((id, i) => {
      const p = L[i];
      const st = D.placed[i];
      const key = 'v:' + i;
      if (st && !st.skipped) {
        const m = this.ensure(key, cardFace(id, { stage: st }), { pos: new THREE.Vector3(p.x, Y + 0.25, p.z + 0.2), quat: FLAT, scale: 1.2 });
        m.target.pos.set(p.x, Y + 0.002, p.z);
        m.target.quat.copy(FLAT);
        m.target.scale = SLOT_SCALE;
        m.userData.hit = { kind: 'slot', idx: i, placed: true };
        m.setOpacity?.(1);
        this.stamp(i, m, st.approved);
        this.syncBugs(D, st, p);
      } else {
        const holeKey = 'hole:' + i;
        if (st && st.skipped) {
          // a hole: a cracked dark slot with its bugs
          const m = this.ensure(holeKey, cardFace(id, { hole: true }));
          m.target.pos.set(p.x, Y + 0.002, p.z); m.target.quat.copy(FLAT); m.target.scale = SLOT_SCALE;
          m.userData.hit = { kind: 'slot', idx: i, hole: true };
          this.syncBugs(D, st, p);
        }
        if (!st && i >= D.ptr && !D.released) {
          const m = this.ensure('plan:' + i, cardFace(id, { plan: true }));
          m.target.pos.set(p.x, Y + 0.002, p.z); m.target.quat.copy(FLAT); m.target.scale = SLOT_SCALE;
          m.userData.hit = { kind: 'plan', idx: i };
        }
      }
    });
    // hand (player)
    const hand = D.p.hand;
    hand.forEach((h, i) => {
      const m = this.ensure('c:' + h.uid, cardFace(h.id), deckFrom);
      m.userData.hit = { kind: 'hand', uid: h.uid, id: h.id };
      this.handPose(m, i, hand.length);
    });
    // team
    D.p.team.forEach((u, i) => {
      const m = this.ensure('c:' + u.uid, cardFace(u.id, { unit: u, D }), deckFrom);
      m.target.pos.set(-0.62 + i * 0.12, Y + 0.002, Z.team);
      m.target.quat.copy(FLAT);
      if (u.tired || u.acted) m.target.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), u.tired ? 0.5 : 0.18));
      m.target.scale = 1;
      m.userData.hit = { kind: 'team', uid: u.uid, id: u.id };
      this.unitSign(m, u, D);
    });
    // back row (guards face down, documents face up)
    D.p.back.forEach((b, i) => {
      const m = this.ensure('c:' + b.uid, cardFace(b.id), deckFrom);
      m.target.pos.set(0.38 + i * 0.12, Y + 0.002, Z.back);
      m.target.quat.copy(b.down ? FLAT_DOWN : FLAT);
      m.target.scale = 1;
      m.userData.hit = { kind: 'back', uid: b.uid, id: b.id, down: b.down };
    });
    // enemy field
    D.e.field.forEach((t, i) => {
      const m = this.ensure('c:' + t.uid, cardFace(t.id, { trouble: t, D }), edeckFrom);
      m.target.pos.set(-0.2 + i * 0.2, Y + 0.002, Z.enemy);
      m.target.quat.copy(FLAT);
      m.target.scale = 1;
      m.userData.hit = { kind: 'field', uid: t.uid, id: t.id };
      this.troubleSign(m, t);
    });
    D.e.plots.forEach((pl, i) => {
      const m = this.ensure('c:' + pl.uid, { id: 'back', type: 'enemy', name: '' }, edeckFrom);
      m.target.pos.set(-0.64 + i * 0.12, Y + 0.002, Z.enemy);
      m.target.quat.copy(FLAT_DOWN);
      m.target.scale = 1;
      m.userData.hit = { kind: 'plot', uid: pl.uid };
    });
    // enemy hand: face-down cards standing at the far edge
    D.e.hand.forEach((h, i) => {
      const n = D.e.hand.length;
      const m = this.ensure('c:' + h.uid, { id: 'back', type: 'enemy', name: '' }, edeckFrom);
      const x = 0.32 + (i - (n - 1) / 2) * 0.05;
      m.target.pos.set(x, TABLE_H + 0.09, Z.enemyHand);
      m.target.quat.setFromEuler(new THREE.Euler(0.35, Math.PI, (i - (n - 1) / 2) * 0.06));
      m.target.scale = 0.8;
      m.userData.hit = { kind: 'ehand', uid: h.uid };
    });
    // piles
    this.setPile('deck', D.p.deck.length);
    this.setPile('discard', D.p.discard.length, D.p.discard[D.p.discard.length - 1]);
    this.setPile('edeck', D.e.deck.length);
    this.setPile('ediscard', D.e.discard.length, D.e.discard[D.e.discard.length - 1]);
    // cards that left: fly to a discard pile, then go
    for (const [key, m] of this.cards) {
      if (m.userData.seen === this.syncN || this.over.has(key)) continue;
      if (m.userData.leaving) continue;
      m.userData.leaving = this.t;
      m.userData.hit = null;
      const enemy = key.startsWith('c:') && (m.card.type === 'enemy' || m.card.type === 'event' || m.card.kind === 'trouble' || m.card.kind === 'event' || m.card.kind === 'plot');
      const toPile = key.startsWith('plan:') || key.startsWith('v:') || key.startsWith('hole:') ? null : enemy ? 'ediscard' : 'discard';
      if (toPile) { m.target.pos.copy(this.pilePos(toPile)); m.target.quat.copy(FLAT); m.target.scale = 0.85; }
      else { m.target.pos.y += 0.06; m.target.scale *= 0.6; }
    }
    // bugs that are gone
    for (const [bid, b] of this.bugs) if (b.userData.seen !== this.syncN && !b.userData.leaving) { b.userData.leaving = this.t; }
    if (this.opsRing) this.opsRing.material.opacity = D.released ? 0.95 : 0.35;
    this.D = D;
  }

  setPile(name, n, topId) {
    const g = this.piles[name];
    g.userData.count = n;
    const show = Math.min(6, Math.ceil(n / 4));
    g.children.forEach((c, i) => { if (c.isGroup && c.card) c.visible = name.includes('discard') ? (i < show && n > 0) : i < show; });
    if (name.includes('discard') && topId) {
      const top = g.children.filter((c) => c.card)[Math.max(0, show - 1)];
      if (top && top.card.id !== topId) top.setCard(cardFace(topId), { ruby: this.app.settings.ruby });
    }
    g.userData.label.userData.paint(String(n), name.startsWith('e') ? '#6a3fb0' : '#2f6fe0');
  }

  stamp(i, m, on) {
    let s = this.stamps.get(i);
    if (!s && on) {
      const { ctx, tex } = canvasTex(128, 128);
      ctx.strokeStyle = '#e8262f'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8262f'; ctx.font = `900 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('承認', 64, 66);
      tex.needsUpdate = true;
      s = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.position.set(CARD_W * 0.3, -CARD_H * 0.32, 0.002);
      s.rotation.z = -0.3;
      s.renderOrder = 12;
      this.stamps.set(i, s);
      s.userData.born = this.t;
    }
    if (s) {
      if (s.parent !== m) m.add(s);
      s.visible = on;
    }
  }

  troubleSign(m, t) {
    if (!m.userData.sign) {
      const s = labelSprite(192, 80);
      s.scale.set(0.075, 0.031, 1);
      s.position.set(0, CARD_H * 0.55, 0.03);
      m.add(s);
      m.userData.sign = s;
      const nw = labelSprite(160, 64);
      nw.scale.set(0.05, 0.02, 1);
      nw.position.set(-CARD_W * 0.35, CARD_H * 0.55, 0.05);
      m.add(nw);
      m.userData.newSign = nw;
    }
    m.userData.sign.userData.paint(`圧 ${Math.max(0, t.pressure)}`, '#7a3fd0');
    m.userData.newSign.visible = !!t.isNew;
    if (t.isNew) m.userData.newSign.userData.paint('NEW!', '#ffcf3f', '#3a2500');
  }

  unitSign(m, u, D) {
    if (!m.userData.sign) {
      const s = labelSprite(192, 80);
      s.scale.set(0.075, 0.031, 1);
      s.position.set(0, CARD_H * 0.55, 0.03);
      m.add(s);
      m.userData.sign = s;
    }
    const p = D.unitPower(u);
    m.userData.sign.userData.paint(u.tired ? 'つかれ' : u.acted ? '対応ずみ' : `力 ${p}`, u.tired ? '#8a5a00' : u.acted ? '#55607a' : '#2f6fe0');
  }

  syncBugs(D, st, p) {
    const n = st.bugs.length;
    st.bugs.forEach((b, k) => {
      let o = this.bugs.get(b.bid);
      if (!o) {
        o = makeBug();
        o.position.set(p.x, Y + 0.12, p.z);
        o.userData.born = this.t;
        this.group.add(o);
        this.bugs.set(b.bid, o);
        o.userData.size = 0;
      }
      o.userData.seen = this.syncN;
      o.userData.data = b;
      o.userData.hit = b.found ? { kind: 'bug', idx: st.idx, bid: b.bid } : { kind: 'bugq', idx: st.idx, bid: b.bid };
      const cols = Math.min(4, n), row = Math.floor(k / 4), col = k % 4;
      const ox = (col - (Math.min(4, n - row * 4) - 1) / 2) * 0.03;
      o.userData.target = new THREE.Vector3(p.x + ox, Y + 0.01, p.z + 0.02 - row * 0.034);
      const { beetle, egg, label } = o.userData.parts;
      beetle.visible = b.found; egg.visible = !b.found;
      const sc = 1.7 * ([1, 1, 1.22, 1, 1.45, 1, 1, 1, 1.75][b.size] || 1);
      o.userData.scaleTarget = sc;
      label.userData.paint(b.found ? String(b.size) : '?', b.found ? (b.size >= 8 ? '#ff3d00' : b.size >= 4 ? '#e8262f' : '#c4363e') : '#7a6aa8');
      void cols;
    });
  }

  // the hand: PC — a fan on the camera at the bottom of the view; VR — a fan floating over the near edge
  handPose(m, i, n) {
    const t = m.target;
    const spread = n <= 1 ? 0 : (i / (n - 1) - 0.5);
    const hov = this.hoverKey === m.userData.key;
    const sel = this.app.sel && this.app.sel.kind === 'hand' && this.app.sel.uid === m.userData.hit?.uid;
    if (!this.vr) {
      // in camera space (the hand group is a child of the camera)
      const portrait = innerWidth < innerHeight;
      const width = Math.min(portrait ? 0.3 : 0.46, (portrait ? 0.05 : 0.068) * n);
      const x = spread * width - (portrait ? 0 : 0.02);
      const y = (portrait ? -0.2 : -0.262) + (hov || sel ? 0.075 : 0) - Math.abs(spread) * 0.025;
      t.pos.set(x, y, -0.6 + i * 0.0015);
      t.quat.setFromEuler(new THREE.Euler(0, 0, -spread * 0.3));
      t.scale = (hov || sel ? 1.25 : 0.86) * (portrait ? 0.75 : 1);
    } else {
      const width = Math.min(0.62, 0.09 * n);
      const x = spread * width;
      const a = spread * 0.9;
      const y = TABLE_H + 0.12 + (hov || sel ? 0.06 : 0) - Math.abs(spread) * 0.035;
      const z = 0.66 + Math.abs(spread) * 0.07 - (hov || sel ? 0.03 : 0);
      t.pos.set(x, y, z);
      t.quat.setFromEuler(new THREE.Euler(-0.85, -a * 0.6, 0, 'YXZ'));
      t.scale = hov || sel ? 1.2 : 1.05;
    }
    m.userData.inHand = true;
  }

  // world-space position of a thing on the table (for effects)
  posOf(key) {
    const m = this.cards.get(key);
    if (m) return m.getWorldPosition(new THREE.Vector3());
    return null;
  }
  slotPos(i) { const p = this.layout[i]; return new THREE.Vector3(p.x, Y, p.z); }
  troublePos(uid) { const m = this.cards.get('c:' + uid); return m ? m.target.pos.clone() : new THREE.Vector3(0, Y, Z.enemy); }

  // targets for the pointer
  targets() {
    const out = [];
    for (const m of this.cards.values()) if (m.userData.hit && m.visible) out.push(m);
    for (const b of this.bugs.values()) if (b.userData.hit && !b.userData.leaving) out.push(b);
    for (const p of Object.values(this.piles)) out.push(p);
    return out;
  }

  setHighlights(map) { this.highlight = map; }

  tick(dt) {
    this.t += dt;
    const camHand = !this.vr;
    for (const [key, m] of this.cards) {
      // the hand lives on the camera in PC mode
      const wantParent = m.userData.inHand && camHand && this.cards.get(key)?.userData.hit?.kind === 'hand' ? this.handGroup : this.group;
      if (m.parent !== wantParent) {
        // keep the world pose when switching parents
        const wp = m.getWorldPosition(new THREE.Vector3()), wq = m.getWorldQuaternion(new THREE.Quaternion());
        wantParent.add(m);
        wantParent.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(wantParent.matrixWorld).invert();
        m.position.copy(wp.applyMatrix4(inv));
        const pq = wantParent.getWorldQuaternion(new THREE.Quaternion()).invert();
        m.quaternion.copy(pq.multiply(wq));
      }
      if (m.userData.hit?.kind !== 'hand') m.userData.inHand = false;
      const o = this.over.get(key);
      if (o) {
        const a = 1 - Math.exp(-(o.k || 9) * dt);
        m.position.lerp(o.pos, a); if (o.quat) m.quaternion.slerp(o.quat, a);
        const s = m.scale.x + ((o.scale ?? m.scale.x) - m.scale.x) * a; m.scale.setScalar(s);
      } else m.tick(dt, m.userData.leaving ? 6 : 10);
      // glow
      const hl = this.highlight.get(key);
      const isHover = this.hoverKey === key;
      if (hl) m.setGlow(hl);
      else if (isHover) m.setGlow('#ffffff', 0.6);
      else m.setGlow(null);
      // see-through plans
      if (key.startsWith('plan:')) {
        const op = hl ? 0.9 : isHover ? 0.8 : 0.3;
        for (const part of [m.front, m.edge]) { part.material.transparent = true; part.material.opacity = op; part.material.depthWrite = false; }
        m.back.visible = false;
      }
      if (m.userData.leaving && this.t - m.userData.leaving > 0.9) { m.parent?.remove(m); this.cards.delete(key); disposeTree(m); }
    }
    for (const [bid, b] of this.bugs) {
      if (b.userData.leaving) {
        const k = this.t - b.userData.leaving;
        b.scale.setScalar(Math.max(0.001, (b.userData.size || 1) * (1 - k * 2.5)));
        b.position.y += dt * 0.08;
        if (k > 0.4) { this.group.remove(b); this.bugs.delete(bid); disposeTree(b); }
        continue;
      }
      if (b.userData.target) b.position.lerp(b.userData.target, 1 - Math.exp(-8 * dt));
      const st = b.userData.scaleTarget || 1;
      b.userData.size += (st - b.userData.size) * (1 - Math.exp(-6 * dt));
      b.scale.setScalar(b.userData.size * (this.highlight.get('bug:' + bid) ? 1.25 + 0.15 * Math.sin(this.t * 8) : 1));
      const beetle = b.userData.parts.beetle;
      beetle.rotation.y = Math.sin(this.t * 3 + bid) * 0.4;
      b.userData.parts.egg.position.y = 0.004 + Math.abs(Math.sin(this.t * 2 + bid)) * 0.002;
    }
    for (const s of this.stamps.values()) {
      if (s.userData.born != null) {
        const k = Math.min(1, (this.t - s.userData.born) / 0.35);
        s.scale.setScalar(1 + (1 - k) * 1.5);
      }
    }
  }

  // clear everything (new duel)
  reset() {
    for (const m of this.cards.values()) { m.parent?.remove(m); disposeTree(m); }
    this.cards.clear();
    for (const b of this.bugs.values()) { this.group.remove(b); disposeTree(b); }
    this.bugs.clear();
    this.stamps.clear();
    this.over.clear();
    this.layout = null;
    this.highlight = new Map();
    clearFaceCache(); // card faces are drawn again on demand (keeps memory flat over many duels)
  }
}

// free what a removed object owns (not the shared card geometry / back / textures in the face cache)
const SHARED = new Set();
function disposeTree(o) {
  o.traverse((x) => {
    if (x.isSprite) { x.material.map?.dispose(); x.material.dispose(); return; }
    if (x.userData?.ownGeo) x.geometry?.dispose();
    if (x.userData?.ownMat) x.material?.dispose();
  });
}
void SHARED;
