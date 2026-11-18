// js/hud.js — what is written in the stadium: the big scoreboard behind the CPU, a courtside board by the
// net, the line calls above the net, and a small panel on your free wrist (move mode, speed, cadence, the
// last shot, tips). Canvas textures, redrawn only when something changed.
import * as THREE from 'three';
import { COURT } from './physics.js';

const FONT = '"Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic",system-ui,sans-serif';

export class CanvasPanel {
  constructor(w, h, mw, mh, opt = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: this.tex, transparent: !!opt.transparent, depthWrite: !opt.transparent, toneMapped: false, side: opt.double ? THREE.DoubleSide : THREE.FrontSide }));
    this.key = '';
  }
  /** redraw only if key changed */
  draw(key, fn) {
    if (key === this.key) return;
    this.key = key;
    fn(this.g, this.canvas.width, this.canvas.height);
    this.tex.needsUpdate = true;
  }
}

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }

export class Hud {
  constructor(scene) {
    this.scene = scene;
    // big scoreboard above the far windscreen
    this.board = new CanvasPanel(1024, 512, 9.6, 4.8);
    this.board.mesh.position.set(0, 6.2, -COURT.fenceZ - 3.2);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(10.2, 5.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x15191f, roughness: 0.6 }));
    frame.position.set(0, 6.2, -COURT.fenceZ - 3.45);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), frame.material);
    leg.position.set(0, 2, -COURT.fenceZ - 3.5);
    scene.add(frame, leg, this.board.mesh);
    // courtside board by the net post on your right
    this.side = new CanvasPanel(1024, 512, 2.6, 1.3);
    this.side.mesh.position.set(COURT.netEndX + 1.4, 1.5, 1.2);
    this.side.mesh.rotation.y = -0.75;
    const sframe = new THREE.Mesh(new THREE.BoxGeometry(2.75, 1.45, 0.12), frame.material);
    sframe.position.copy(this.side.mesh.position); sframe.rotation.y = -0.75; sframe.translateZ(-0.07);
    const sleg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), frame.material);
    sleg.position.set(this.side.mesh.position.x, 0.4, this.side.mesh.position.z);
    scene.add(sframe, sleg, this.side.mesh);
    // calls above the net
    this.call = new CanvasPanel(1024, 256, 6.4, 1.6, { transparent: true });
    this.call.mesh.position.set(0, 3.1, -1);
    this.call.mesh.renderOrder = 10;
    this.call.mesh.material.depthTest = false;
    scene.add(this.call.mesh);
    this.callT = 0;
    // wrist panel (attached by the game to your free hand)
    this.wrist = new CanvasPanel(512, 320, 0.17, 0.106, { transparent: true });
    this.wrist.mesh.renderOrder = 11;
    this.tip = '';
  }

  showCall(ja, sub = '', color = '#ffffff', t = 2.2) {
    this.callT = t;
    this.call.draw(ja + '|' + sub + '|' + color + Math.random(), (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 120px ${FONT}`;
      g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.strokeText(ja, w / 2, sub ? 100 : 128);
      g.fillStyle = color; g.fillText(ja, w / 2, sub ? 100 : 128);
      if (sub) { g.font = `700 54px ${FONT}`; g.lineWidth = 8; g.strokeText(sub, w / 2, 200); g.fillStyle = '#e8f1ff'; g.fillText(sub, w / 2, 200); }
    });
    this.call.mesh.material.opacity = 1;
    this.call.mesh.visible = true;
  }
  tick(dt) {
    if (this.callT > 0) {
      this.callT -= dt;
      this.call.mesh.material.opacity = Math.min(1, this.callT / 0.4);
      if (this.callT <= 0) this.call.mesh.visible = false;
    }
  }

  /** scoreboards. mode, snap (match score) or stats (practice), info (one line) */
  scoreboard(mode, snap, stats, info) {
    const key = JSON.stringify([mode, snap, stats && [stats.rally, stats.bestRally, Math.round(stats.lastKmh), stats.serves, stats.servesIn, Math.round(stats.topServe), stats.returnsIn, Math.round(stats.topKmh)], info]);
    const drawBoard = (g, w, h, small) => {
      g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2a3b55'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
      g.textBaseline = 'middle';
      if (mode === 'match' && snap) {
        const cols = snap.sets.length;
        const rowY = [150, 270];
        g.font = `700 40px ${FONT}`; g.fillStyle = '#7f93b5'; g.textAlign = 'center';
        for (let i = 0; i < cols; i++) g.fillText(`SET ${i + 1}`, 420 + i * 120, 66);
        g.fillText('GAMES', 420 + cols * 120 + 30, 66);
        g.fillText('POINTS', 840, 66);
        ['p', 'c'].forEach((who, r) => {
          const y = rowY[r];
          g.textAlign = 'left';
          g.font = `900 78px ${FONT}`;
          g.fillStyle = '#ffffff';
          g.fillText(who === 'p' ? 'YOU' : 'CPU', 70, y);
          if (snap.server === who && !snap.over) { g.fillStyle = '#d7ec3a'; g.beginPath(); g.arc(300, y, 18, 0, Math.PI * 2); g.fill(); }
          g.textAlign = 'center';
          snap.sets.forEach((st, i) => {
            g.font = `700 70px ${FONT}`; g.fillStyle = st[who] > st[who === 'p' ? 'c' : 'p'] ? '#ffffff' : '#8a97ab';
            g.fillText(String(st[who]), 420 + i * 120, y);
            if (st.tb) { g.font = `600 30px ${FONT}`; g.fillText(String(st.tb[who]), 455 + i * 120, y - 30); }
          });
          g.font = `900 84px ${FONT}`; g.fillStyle = '#ffd23f';
          g.fillText(String(snap.games[who]), 420 + cols * 120 + 30, y);
          g.fillStyle = '#ffffff';
          rr(g, 760, y - 50, 160, 100, 14); g.fillStyle = '#1b2a45'; g.fill();
          g.fillStyle = '#ffffff'; g.font = `900 72px ${FONT}`;
          const pts = snap.tb ? String(snap.points[who]) : pointLabel(snap, who);
          g.fillText(pts, 840, y + 2);
        });
        g.textAlign = 'center';
        g.font = `700 46px ${FONT}`; g.fillStyle = '#9fb3d1';
        const line = snap.over ? (snap.winner === 'p' ? 'あなたの勝ち！' : 'CPU の勝ち') : (snap.tb ? 'タイブレーク　' : '') + snap.text;
        g.fillText(line, w / 2, 372);
      } else if (stats) {
        g.textAlign = 'center';
        g.font = `900 70px ${FONT}`; g.fillStyle = '#ffffff';
        g.fillText({ rally: 'ラリー練習', machine: '球出し', serve: 'サーブ練習' }[mode] || '', w / 2, 90);
        g.font = `700 54px ${FONT}`; g.fillStyle = '#ffd23f';
        if (mode === 'serve') {
          const pct = stats.serves ? Math.round((stats.servesIn / stats.serves) * 100) : 0;
          g.fillText(`入った ${stats.servesIn} / ${stats.serves}（${pct}%）`, w / 2, 200);
          g.fillStyle = '#ffffff'; g.fillText(`最速 ${Math.round(stats.topServe)} km/h`, w / 2, 290);
        } else if (mode === 'rally') {
          g.fillText(`ラリー ${stats.rally}　最長 ${Math.max(stats.bestRally, stats.rally)}`, w / 2, 200);
          g.fillStyle = '#ffffff'; g.fillText(`最速 ${Math.round(stats.topKmh)} km/h`, w / 2, 290);
        } else {
          g.fillText(`入った ${stats.returnsIn} / ${stats.shots}`, w / 2, 200);
          g.fillStyle = '#ffffff'; g.fillText(`最速 ${Math.round(stats.topKmh)} km/h`, w / 2, 290);
        }
      }
      // last shot speed
      g.textAlign = 'center';
      g.font = `600 42px ${FONT}`; g.fillStyle = '#62e0a8';
      g.fillText(info || '', w / 2, small ? 450 : 450);
    };
    this.board.draw(key, (g, w, h) => drawBoard(g, w, h, false));
    this.side.draw(key, (g, w, h) => drawBoard(g, w, h, true));
  }

  /** wrist panel lines */
  wristInfo(lines) {
    const key = lines.join('|');
    this.wrist.draw(key, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      rr(g, 4, 4, w - 8, h - 8, 28); g.fillStyle = 'rgba(10,18,32,0.82)'; g.fill();
      g.strokeStyle = 'rgba(127,255,212,0.5)'; g.lineWidth = 3; g.stroke();
      g.textAlign = 'left'; g.textBaseline = 'middle';
      lines.forEach((l, i) => {
        g.font = `${i === 0 ? 800 : 600} ${i === 0 ? 40 : 34}px ${FONT}`;
        g.fillStyle = i === 0 ? '#7fffd4' : i === lines.length - 1 ? '#ffd23f' : '#e8f1ff';
        g.fillText(l, 26, 46 + i * 56, w - 40);
      });
    });
  }
}

function pointLabel(snap, who) {
  const a = snap.points[who], b = snap.points[who === 'p' ? 'c' : 'p'];
  if (a >= 3 && b >= 3) return a > b ? 'AD' : a === b ? '40' : '';
  return ['0', '15', '30', '40'][Math.min(a, 3)];
}
