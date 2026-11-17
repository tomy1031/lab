// js/targets.js — what flies at you.
//   pad      teal = left hand, coral = right hand; the face shows the count it lands on ("1", "&", "e"...)
//            and an arrow for hooks (→ / ←) and uppercuts (↑)
//   rim      white = on the beat (表拍), gold = "&" (裏拍), pink = sixteenth offbeat
//   approach ring  shrinks onto the rim and closes exactly on the hit time
//   branch   a mossy branch at head height: duck under it (always on a downbeat)
import * as THREE from 'three';
import { canvasTexture, FONT, roundRect } from './util.js';

export const HAND_COLOR = { L: '#22c9b6', R: '#ff7552' };
export const SUB_COLOR = { on: '#ffffff', and: '#ffc94a', six: '#ff9fe0' };
const LABELS = ['1', '2', '3', '4', '&', 'e', 'a'];
const KINDS = ['straight', 'hookL', 'hookR', 'upper'];

function decalAtlas() {
  const C = 128;
  const { ctx, tex } = canvasTexture(1024, 512);
  ctx.clearRect(0, 0, 1024, 512);
  KINDS.forEach((k, row) => {
    LABELS.forEach((l, col) => {
      const x = col * C, y = row * C, cx = x + C / 2, cy = y + C / 2;
      const sub = /[1-4]/.test(l) ? 'on' : l === '&' ? 'and' : 'six';
      ctx.save();
      ctx.fillStyle = 'rgba(10,20,18,0.55)';
      ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = SUB_COLOR[sub];
      ctx.font = `900 ${l === '&' ? 66 : 74}px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(l, cx, cy + (k === 'straight' ? 4 : 10));
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      if (k === 'hookL' || k === 'hookR') {
        const s = k === 'hookL' ? 1 : -1;
        ctx.beginPath(); ctx.arc(cx, cy + 40, 46, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke();
        const ex = cx + s * 33, ey = cy + 8;
        ctx.beginPath(); ctx.moveTo(ex + s * 10, ey + 2); ctx.lineTo(ex - s * 12, ey - 12); ctx.lineTo(ex - s * 4, ey + 16); ctx.closePath(); ctx.fill();
      } else if (k === 'upper') {
        ctx.beginPath(); ctx.moveTo(cx, cy - 24); ctx.lineTo(cx, cy - 46); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 58); ctx.lineTo(cx - 15, cy - 38); ctx.lineTo(cx + 15, cy - 38); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    });
  });
  void roundRect;
  return tex;
}

export class Targets {
  constructor(parent) {
    this.parent = parent;
    this.atlas = decalAtlas();
    this.padGeo = new THREE.IcosahedronGeometry(0.115, 2).scale(1, 1, 0.72);
    this.rimGeo = new THREE.TorusGeometry(0.128, 0.011, 8, 48);
    this.ringGeo = new THREE.TorusGeometry(0.128, 0.006, 6, 48);
    this.decalGeo = new THREE.PlaneGeometry(0.19, 0.19);
    this.shadowGeo = new THREE.CircleGeometry(0.11, 24).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false });
    this.rimMat = {};
    for (const k of Object.keys(SUB_COLOR)) this.rimMat[k] = new THREE.MeshBasicMaterial({ color: SUB_COLOR[k] });
    this.ringMat = {};
    for (const k of Object.keys(SUB_COLOR)) this.ringMat[k] = new THREE.MeshBasicMaterial({ color: SUB_COLOR[k], transparent: true, opacity: 0.85, depthWrite: false });
    // branch to duck under
    const log = new THREE.CylinderGeometry(0.07, 0.085, 2.2, 10).rotateZ(Math.PI / 2);
    this.logMat = new THREE.MeshLambertMaterial({ color: '#7a5634', flatShading: true });
    this.logGeo = log;
    this.leafGeo = new THREE.IcosahedronGeometry(0.13, 0);
    this.leafMat = new THREE.MeshLambertMaterial({ color: '#5f9a3a', flatShading: true });
    this.warnMat = new THREE.MeshBasicMaterial({ color: '#ff5d3a', transparent: true, opacity: 0.4, depthWrite: false });
    this.pool = [];
    this.logPool = [];
  }

  _make() {
    const g = new THREE.Group();
    const pad = new THREE.Mesh(this.padGeo, new THREE.MeshLambertMaterial({ color: '#fff', emissive: '#000' }));
    const rim = new THREE.Mesh(this.rimGeo, this.rimMat.on);
    rim.position.z = 0.02;
    const tex = this.atlas.clone();
    tex.repeat.set(1 / 8, 1 / 4);
    const decal = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    decal.position.z = 0.088;
    decal.renderOrder = 3;
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat.on);
    ring.position.z = 0.03;
    ring.renderOrder = 3;
    g.add(pad, rim, decal, ring);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.renderOrder = 1;
    this.parent.add(g, shadow);
    return { g, pad, rim, decal, ring, shadow, tex, note: null };
  }

  spawn(note) {
    if (note.kind === 'duck') return this._spawnLog(note);
    const t = this.pool.find((p) => !p.note) || (this.pool.push(this._make()), this.pool[this.pool.length - 1]);
    t.note = note;
    note.obj = t;
    const col = new THREE.Color(HAND_COLOR[note.hand]);
    t.pad.material.color.copy(col);
    t.pad.material.emissive.copy(col).multiplyScalar(0.25);
    t.pad.material.opacity = 1;
    t.pad.material.transparent = false;
    t.rim.material = this.rimMat[note.sub];
    t.ring.material = this.ringMat[note.sub];
    const li = LABELS.indexOf(note.label);
    const row = note.kind === 'hook' ? (note.hand === 'L' ? 1 : 2) : note.kind === 'upper' ? 3 : 0;
    t.tex.offset.set(li / 8, 1 - (row + 1) / 4);
    t.g.visible = true;
    t.shadow.visible = true;
    t.g.scale.setScalar(0.01);
    t.g.rotation.set(0, 0, 0);
    t.ring.visible = true;
    return t;
  }

  _spawnLog(note) {
    let t = this.logPool.find((p) => !p.note);
    if (!t) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(this.logGeo, this.logMat));
      for (const [x, y, z, s] of [[-0.75, 0.06, 0.03, 1], [-0.2, 0.08, -0.02, 0.8], [0.4, 0.07, 0.04, 1.1], [0.9, 0.05, 0, 0.7], [0.05, -0.06, 0.05, 0.6]]) {
        const l = new THREE.Mesh(this.leafGeo, this.leafMat);
        l.position.set(x, y, z);
        l.scale.setScalar(s);
        g.add(l);
      }
      const warn = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.32).rotateX(-Math.PI / 2), this.warnMat);
      warn.renderOrder = 1;
      this.parent.add(g, warn);
      t = { g, shadow: warn, note: null, log: true };
      this.logPool.push(t);
    }
    t.note = note;
    note.obj = t;
    t.g.visible = true;
    t.shadow.visible = true;
    t.g.scale.setScalar(1);
    return t;
  }

  release(t) {
    t.note = null;
    t.g.visible = false;
    t.shadow.visible = false;
  }

  clear() {
    for (const t of [...this.pool, ...this.logPool]) if (t.note) { t.note.obj = null; this.release(t); }
  }
}
