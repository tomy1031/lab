// js/world/spawns.js — FABLE
// layout.js の配置を実際の地形に合わせて確定する（急斜面・水・木を避けて少しずらす）→ world.landmarks / vistas / spawnPoints と、しかけの定義。
import { LANDMARKS, LM, VISTAS, TOWERS, SHRINES, TORCH_TARGET, WAYLIGHTS, CHESTS, BLOCKERS, SEEDS, ENEMIES, GATHER, LAKE_LEVEL } from './layout.js';

export function buildSpawnPoints(env) {
  const { hf, col } = env;
  const landmarks = {}, landmarkList = [];
  for (const l of LANDMARKS) {
    // 向きをわずかにずらす：真北を向いて中心に立つと頂点の奥行きがちょうど 0 になり、描画が乱れるソフトウェア GPU がある
    const o = { id: l.id, name: l.name, kind: l.kind, x: l.x, y: hf.heightAt(l.x, l.z), z: l.z, r: l.r, yaw: (l.yaw + 0.37) % 360 };
    landmarks[l.id] = o; landmarkList.push(o);
  }
  const vistas = VISTAS.map((v) => ({ id: v.id, name: v.name, x: v.x, z: v.z, yaw: v.yaw, time: v.time, lift: v.lift, pitch: v.pitch || 0 }));

  // 近くの置ける場所を探す
  const ok = (x, z, maxSlopeCos, clear, offPath) => {
    const h = hf.heightAt(x, z);
    if (h < 0.8 || hf.waterDepthAt(x, z) > 0.02) return false;
    if (hf.normalY(x, z) < maxSlopeCos) return false;
    if (clear > 0 && col.isBlocked(x, z, clear)) return false;
    if (offPath && hf.pathDistAt(x, z) < 2.6) return false;
    return true;
  };
  function snap(x, z, { slope = 16, clear = 0.8, offPath = true, maxR = 18 } = {}) {
    const c = Math.cos(slope * Math.PI / 180);
    if (ok(x, z, c, clear, offPath)) return { x, z };
    for (let r = 1.5; r <= maxR; r += 1.5) {
      const n = Math.max(8, Math.round(r * 4));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + r;
        const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
        if (ok(px, pz, c, clear, offPath)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }
  const props = [];      // { id, kind, x, y, z, r, yaw, data }
  const addProp = (id, kind, x, z, yaw = 0, data = {}, r = 1, y) => {
    const p = { id, kind, x, y: y ?? hf.heightAt(x, z), z, r, yaw, data };
    props.push(p);
    return p;
  };
  const yawTo = (x, z, tx, tz) => ((Math.atan2(tx - x, -(tz - z)) * 180 / Math.PI) + 360) % 360;

  const spawnPoints = { player: { x: LM.start.x, z: LM.start.z, yaw: 0 }, waylights: [], towers: [], shrines: [], chests: [], seeds: [], enemies: [], gather: [] };

  // 風見の灯
  for (const id of WAYLIGHTS) {
    const l = landmarks[id];
    spawnPoints.waylights.push({ id, x: l.x, z: l.z });
    addProp(id, 'waylight', l.x, l.z, l.yaw, {}, 5);
  }
  // 鐘塔
  for (const t of TOWERS) {
    const l = landmarks[t.id];
    spawnPoints.towers.push({ id: t.id, x: l.x, z: l.z, liftHeight: t.liftHeight, region: t.region });
    addProp(t.id, 'tower', l.x, l.z, l.yaw, { tower: t }, 7.5);
  }
  // 祠
  for (const s of SHRINES) {
    const l = landmarks[s.id];
    const extra = {};
    if (s.type === 'sprint') {
      extra.braziers = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6, bx = l.x + Math.sin(a) * 8.6, bz = l.z + Math.cos(a) * 8.6;
        const id = `${s.id}_b${i}`;
        addProp(id, 'brazier', bx, bz, 0, {}, 0.5);
        extra.braziers.push(id);
      }
    } else if (s.type === 'torch') {
      const tp = snap(TORCH_TARGET.x, TORCH_TARGET.z, { clear: 0.6 });
      addProp('brazier_torch_target', 'brazier', tp.x, tp.z, 0, {}, 0.5);
      extra.brazier = 'brazier_torch_target'; extra.target = { x: tp.x, z: tp.z }; extra.x = tp.x; extra.z = tp.z;
    } else if (s.type === 'dodge') {
      extra.yaw = l.yaw;
    } else if (s.type === 'archery') {
      extra.targets = (env.archery || []).map((t) => ({ x: t.x, y: t.y, z: t.z, moving: t.moving, range: t.range }));
    }
    spawnPoints.shrines.push({ id: s.id, type: s.type, x: l.x, z: l.z, region: s.region, extra });
    addProp(s.id, 'shrine', l.x, l.z, l.yaw, { type: s.type }, 7);
  }
  // 宝箱としかけ
  const blockerOf = {};
  for (const b of BLOCKERS) blockerOf[b.id] = b;
  const usedBlockers = new Set();
  for (const c of CHESTS) {
    if (c.pedestal) {
      const l = landmarks.camp_meadow;
      const y = hf.heightAt(c.x, c.z);
      spawnPoints.chests.push({ id: c.id, x: c.x, z: c.z, yaw: c.yaw, loot: c.loot, hiddenBy: null, pedestal: true });
      addProp(c.id, 'pedestal', c.x, c.z, yawTo(c.x, c.z, l.x, l.z), { loot: c.loot }, 0.7, y);
      continue;
    }
    const p = snap(c.x, c.z, { slope: 12, clear: 1.6 });
    let yaw = c.yaw;
    if (c.hiddenBy && blockerOf[c.hiddenBy]) {
      // しかけは宝箱のすぐ手前（道・ひらけた側）に置く
      const b = blockerOf[c.hiddenBy];
      let dx = b.x - c.x, dz = b.z - c.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const bx = p.x + dx * 2.6, bz = p.z + dz * 2.6;
      yaw = yawTo(p.x, p.z, bx, bz);
      addProp(b.id, b.kind, bx, bz, yaw, { hides: c.id }, b.r);
      usedBlockers.add(b.id);
    }
    spawnPoints.chests.push({ id: c.id, x: p.x, z: p.z, yaw, loot: c.loot, hiddenBy: c.hiddenBy || null });
    addProp(c.id, 'chest', p.x, p.z, yaw, { loot: c.loot }, 0.8);
  }
  for (const b of BLOCKERS) {
    if (usedBlockers.has(b.id)) continue;
    const p = snap(b.x, b.z, { slope: 14, clear: 2 });
    addProp(b.id, b.kind, p.x, p.z, (b.x * 7 + b.z * 13) % 360, {}, b.r);
  }
  // 風の種
  for (const s of SEEDS) {
    if (s.type === 'race') {
      const p = snap(s.x, s.z, { clear: 1.2, offPath: false });
      const rings = s.rings.map((r) => snap(r[0], r[1], { clear: 1.2, offPath: false, slope: 22 }));
      const y = hf.heightAt(p.x, p.z) + 1.5;
      spawnPoints.seeds.push({ id: s.id, type: 'race', x: p.x, y, z: p.z, region: s.region, rings: rings.map((r) => ({ x: r.x, z: r.z })), timeLimit: s.timeLimit });
      const pts = [p, ...rings];
      for (let i = 0; i < pts.length; i++) {
        const nx = pts[Math.min(pts.length - 1, i + 1)], pv = pts[Math.max(0, i - 1)];
        addProp(i === 0 ? s.id : `${s.id}_r${i - 1}`, 'racering', pts[i].x, pts[i].z, yawTo(pv.x, pv.z, nx.x, nx.z), { start: i === 0, seed: s.id, index: i - 1 }, 1.6);
      }
    } else if (s.type === 'bell') {
      const fixed = s.id === 'seed_bell_arch' || s.id === 'seed_bell_coast' || s.id === 'seed_bell_start';
      const p = fixed ? { x: s.x, z: s.z } : snap(s.x, s.z, { clear: 0.8 });
      const g = hf.heightAt(p.x, p.z);
      spawnPoints.seeds.push({ id: s.id, type: 'bell', x: p.x, y: g + s.dy, z: p.z, region: s.region, rings: null, timeLimit: 0 });
      addProp(s.id, 'sleepbell', p.x, p.z, (s.x * 3 + s.z) % 360, { dy: s.dy, hang: fixed }, 0.4, g);
    } else {
      const p = snap(s.x, s.z, { clear: 1 });
      const g = hf.heightAt(p.x, p.z);
      spawnPoints.seeds.push({ id: s.id, type: 'pinwheel', x: p.x, y: g + 1.1, z: p.z, region: s.region, rings: null, timeLimit: 0 });
      addProp(s.id, 'pinwheel', p.x, p.z, (s.x + s.z * 5) % 360, {}, 0.6, g);
    }
  }
  // 敵
  ENEMIES.forEach((e, i) => {
    const p = e.boss && e.type === 'stillheart' ? { x: e.x, z: e.z } : snap(e.x, e.z, { slope: 13, clear: 1.5, offPath: false, maxR: 24 });
    spawnPoints.enemies.push({ id: `en_${e.region}_${e.type}_${i}`, type: e.type, x: p.x, z: p.z, radius: e.radius, count: e.count, night: e.night, region: e.region, boss: !!e.boss });
  });
  // 採集
  const cnt = {};
  for (const g of GATHER) {
    cnt[g.itemId] = (cnt[g.itemId] || 0) + 1;
    const id = `gather_${g.itemId}_${cnt[g.itemId]}`;
    const p = snap(g.x, g.z, { clear: g.kind === 'tree' ? 2 : 0.7, slope: 15 });
    const y = hf.heightAt(p.x, p.z);
    spawnPoints.gather.push({ id, itemId: g.itemId, x: p.x, y: y + (g.kind === 'tree' ? 2.4 : g.kind === 'bush' ? 0.7 : 0.15), z: p.z, count: g.count, kind: g.kind });
    if (g.kind === 'tree') addProp(id, 'appletree', p.x, p.z, (g.x * 11 + g.z) % 360, { fruit: g.count }, 0.5, y);
    else if (g.kind === 'bush') addProp(id, 'bush', p.x, p.z, (g.x * 11 + g.z) % 360, { fruit: g.count, itemId: g.itemId }, 0.6, y);
  }
  // そのほか：木人、台座の剣は上で追加ずみ、光の橋、飾りの燭台
  const st = landmarks.start;
  addProp('dummy_start', 'dummy', st.x + 4.4, st.z - 3.2, 250, {}, 0.45, st.y + 0.3);
  addProp('lightbridge', 'lightbridge', landmarks.pier.x, landmarks.pier.z, 0, {}, 2, LAKE_LEVEL + 1.15);
  const deco = [['brazier_bridge', 141, 240], ['brazier_hollow', -552, -112], ['brazier_arch', 396, 100], ['brazier_nest', 548, -138], ['brazier_ice', 126, -318], ['brazier_isle_w', -7, 2], ['brazier_isle_e', 7, 2], ['brazier_start', -4.6, 533.5]];
  for (const [id, x, z] of deco) {
    if (id === 'brazier_start') { addProp(id, 'brazier', x, z, 0, {}, 0.5, st.y + 0.3); continue; }
    const p = snap(x, z, { clear: 0.7 });
    addProp(id, 'brazier', p.x, p.z, 0, {}, 0.5);
  }
  return { landmarks, landmarkList, vistas, spawnPoints, props };
}
