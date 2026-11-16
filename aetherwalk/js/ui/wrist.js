// js/ui/wrist.js — the left-wrist menu (§10.11): 0.3 m panel above the left wrist, touched directly with the
// right hand (no laser). Pages: map / bag / stats / settings / rest. In the PC preview the same canvas is shown
// in the overlay and clicked with the mouse. Opening never pauses the game; it can't open with Nagi close by. (OPUS-B)
import * as THREE from 'three';
import { makePanel, card, text, gauge, C, roundRect, wrap } from './text.js';
import { drawIcon } from './icons.js';
import { createMapPainter } from './map.js';

const PAGES = [
  { id: 'map', name: '地図', en: 'MAP' }, { id: 'bag', name: '持ちもの', en: 'BAG' }, { id: 'stats', name: '記録', en: 'STATS' },
  { id: 'settings', name: '設定', en: 'SETTINGS' }, { id: 'rest', name: '休む', en: 'REST' },
];
const SLOTS = ['backR', 'backL', 'hipR', 'hipL', 'chest', 'belt'];
const SLOT_NAMES = { backR: '右肩', backL: '左肩', hipR: '右腰', hipL: '左腰', chest: '胸', belt: '腹' };
const SETTING_ORDER = ['turnMode', 'snapAngle', 'smoothTurnSpeed', 'vignette', 'moveDirection', 'stepSensitivity', 'strideScale', 'armAssist',
  'armOnlyWalk', 'stickMove', 'seated', 'duckDepth', 'edgeGuard', 'knockback', 'gripToggle', 'dominantHand', 'hudMode', 'quality',
  'weightKg', 'volMaster', 'volSfx', 'volMusic', 'runBeat', 'haptics'];
const STEP_OVERRIDE = { strideScale: 0.1, weightKg: 5, volMaster: 0.1, volSfx: 0.1, volMusic: 0.1, haptics: 0.25, smoothTurnSpeed: 30 };
const FALLBACK_DEFS = {
  turnMode: { options: ['snap', 'smooth'], label: '向きを変える', en: 'TURN' }, snapAngle: { options: [30, 45], label: 'スナップ角度', en: 'SNAP' },
  smoothTurnSpeed: { min: 30, max: 240, label: 'スムーズターン', en: 'SMOOTH' }, vignette: { options: [1, 0, 2], label: 'ビネット', en: 'VIGNETTE', names: { 0: 'なし', 1: '弱', 2: '強' } },
  moveDirection: { options: ['head', 'hands'], label: '進む向き', en: 'DIRECTION' }, stepSensitivity: { options: ['mid', 'low', 'high'], label: '足踏みの感度', en: 'STEP SENS.' },
  strideScale: { min: 0.7, max: 1.5, label: '速さの倍率', en: 'STRIDE' }, armAssist: { label: '腕ふりアシスト', en: 'ARM ASSIST' }, armOnlyWalk: { label: '腕ふりだけで歩く', en: 'ARM ONLY' },
  stickMove: { label: 'スティックで歩く', en: 'STICK' }, seated: { label: '座って遊ぶ', en: 'SEATED' }, duckDepth: { options: ['normal', 'shallow'], label: 'しゃがみの深さ', en: 'DUCK' },
  edgeGuard: { label: '崖の縁で止まる', en: 'EDGE GUARD' }, knockback: { label: 'ノックバック', en: 'KNOCKBACK' }, gripToggle: { label: 'グリップ切り替え式', en: 'GRIP TOGGLE' },
  dominantHand: { options: ['right', 'left'], label: '利き手', en: 'HAND' }, hudMode: { options: ['float', 'wrist'], label: 'HUD', en: 'HUD' },
  quality: { options: ['auto', 'low', 'mid', 'high'], label: '画質', en: 'QUALITY' }, weightKg: { min: 25, max: 200, label: '体重 kg', en: 'WEIGHT' },
  volMaster: { min: 0, max: 1, label: '音量', en: 'VOLUME' }, volSfx: { min: 0, max: 1, label: '効果音', en: 'SFX' }, volMusic: { min: 0, max: 1, label: '音楽', en: 'MUSIC' },
  runBeat: { label: '走りの拍', en: 'RUN BEAT' }, haptics: { min: 0, max: 1, label: '振動', en: 'HAPTICS' },
};
const VALUE_NAMES = { snap: 'スナップ', smooth: 'スムーズ', head: '頭', hands: '手', mid: '中', low: '低', high: '高', normal: 'ふつう', shallow: '浅い',
  right: '右', left: '左', float: 'うく板', wrist: '腕輪', auto: '自動' };

export function createWrist(ctx, S, ui) {
  const panel = makePanel(ctx, 640, 640, 0.3, { mipmaps: false, renderOrder: 40 });
  ctx.scene.add(panel.mesh);
  panel.mesh.visible = false;
  // hover dot for the touching finger
  const dot = new THREE.Mesh(new THREE.RingGeometry(0.004, 0.0075, 16), new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, depthWrite: false, fog: false }));
  dot.renderOrder = 41; dot.visible = false;
  panel.mesh.add(dot);
  const map = createMapPainter(ctx);
  let page = 'map', open = false, hits = [], dirty = true, redrawT = 0, sel = null, msg = '', msgT = 0;
  let gestureT = 0, gestureOff = 0, byGesture = false, lastDepth = 1, pressCool = 0, settingsCol = 0;
  const _tip = new THREE.Vector3(), _loc = new THREE.Vector3(), _h = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();
  const G = () => ctx.game;

  // ── drawing ──
  function btn(x, y, w, h, label, action, opts = {}) {
    card(panel.g, x, y, w, h, opts.r ?? 14, opts.fill || (opts.on ? 'rgba(255,215,106,0.22)' : 'rgba(14,20,48,0.7)'), opts.on ? C.gold : C.line);
    if (label) text(panel.g, label, x + w / 2, y + h / 2 + (opts.sub ? -2 : 9), { size: opts.size || 24, align: 'center', color: opts.color || C.ink, maxW: w - 12 });
    if (opts.sub) text(panel.g, opts.sub, x + w / 2, y + h / 2 + 22, { size: 14, align: 'center', color: C.dim, weight: 500, maxW: w - 12 });
    if (action) hits.push({ x, y, w, h, action });
  }
  function draw() {
    const g = panel.g, W = panel.w, H = panel.h;
    hits = [];
    g.clearRect(0, 0, W, H);
    card(g, 2, 2, W - 4, H - 4, 30, 'rgba(27,36,64,0.94)');
    // tabs
    const tw = (W - 24) / PAGES.length;
    PAGES.forEach((p, i) => {
      const on = p.id === page;
      btn(12 + i * tw + 3, 12, tw - 6, 62, p.name, () => setPage(p.id), { on, sub: p.en, size: 22 });
    });
    try {
      if (page === 'map') drawMap(g);
      else if (page === 'bag') drawBag(g);
      else if (page === 'stats') drawStats(g);
      else if (page === 'settings') drawSettings(g);
      else if (page === 'rest') drawRest(g);
    } catch (e) { text(g, '…', 30, 140, { size: 24 }); }
    if (msg && msgT > 0) {
      card(g, 60, H - 74, W - 120, 52, 16, 'rgba(14,20,48,0.92)', C.gold);
      text(g, msg, W / 2, H - 40, { size: 20, align: 'center', color: C.gold, maxW: W - 140 });
    }
    panel.flush();
    if (S.domMenu) S.domMenu.dirty = true;
    dirty = false;
  }
  function say(s) { msg = s; msgT = 2.5; dirty = true; }

  function drawMap(g) {
    map.draw(g, 60, 84, 520, S);
    const o = G() && G().quest && G().quest.objective;
    text(g, o && o.text ? `★ ${o.text}` : '★ 目的地なし', 70, 630, { size: 20, color: C.gold, maxW: 380 });
    text(g, '▲塔  ◆祠  ●灯', 580, 630, { size: 18, color: C.dim, align: 'right' });
  }

  function drawBag(g) {
    const game = G();
    const inv = game && game.inventory;
    if (!inv) return;
    // holster slots
    text(g, 'ホルスター HOLSTERS', 24, 102, { size: 18, color: C.dim });
    const sw = 96;
    SLOTS.forEach((s, i) => {
      const x = 22 + i * (sw + 6), y = 110;
      const id = inv.slots[s];
      const fits = sel && fitsSlot(sel, s);
      card(g, x, y, sw, 92, 12, fits ? 'rgba(127,233,255,0.18)' : 'rgba(14,20,48,0.7)', fits ? C.cyan : C.line);
      if (id) drawIcon(g, id, x + sw / 2, y + 40, 52);
      text(g, SLOT_NAMES[s], x + sw / 2, y + 86, { size: 15, align: 'center', color: C.dim });
      if (id && inv.out && inv.out.has(id)) text(g, '手', x + sw - 14, y + 22, { size: 16, align: 'center', color: C.gold });
      hits.push({ x, y, w: sw, h: 92, action: () => {
        if (sel && fitsSlot(sel, s)) { inv.setSlot(s, sel); say(`${name(sel)} → ${SLOT_NAMES[s]}`); sel = null; }
        else if (id) { sel = id; }
        dirty = true;
      } });
    });
    // the bag
    text(g, '持ちもの BAG', 24, 228, { size: 18, color: C.dim });
    const list = inv.list().filter((e) => e.id !== 'aetherseed' && e.id !== 'pearl');
    const cols = 5, cw = 118, ch = 92;
    list.slice(0, 15).forEach((e, i) => {
      const x = 22 + (i % cols) * (cw + 4), y = 236 + Math.floor(i / cols) * (ch + 4);
      const on = sel === e.id;
      card(g, x, y, cw, ch, 12, on ? 'rgba(255,215,106,0.22)' : 'rgba(14,20,48,0.55)', on ? C.gold : 'rgba(255,215,106,0.15)');
      drawIcon(g, e.id, x + 34, y + 44, 50);
      const d = inv.def(e.id);
      if (d && d.stack > 1) text(g, `×${e.count}`, x + cw - 10, y + 40, { size: 22, align: 'right', color: C.white });
      text(g, d ? d.name : e.id, x + cw / 2, y + ch - 10, { size: 14, align: 'center', color: C.ink, maxW: cw - 8 });
      hits.push({ x, y, w: cw, h: ch, action: () => {
        if (e.id === 'waybell') { ui.guide(); return; }
        sel = sel === e.id ? null : e.id; dirty = true;
      } });
    });
    // keys + selected item
    const seeds = inv.count('aetherseed'), pearls = inv.count('pearl');
    drawIcon(g, 'aetherseed', 44, 548, 34);
    text(g, `${seeds} / 24`, 66, 556, { size: 20, color: C.cyan });
    drawIcon(g, 'pearl', 170, 548, 30);
    text(g, `${pearls}`, 190, 556, { size: 20, color: C.white });
    drawIcon(g, 'shard', 250, 548, 30);
    text(g, `${inv.count('shard')}`, 270, 556, { size: 20, color: C.gold });
    if (sel) {
      const d = inv.def(sel);
      text(g, `${d ? d.name : sel}  ${d && d.en ? d.en : ''}`, 24, 596, { size: 20, color: C.gold, maxW: 590 });
      const lines = wrap(g, (d && d.desc) || 'スロットを選ぶと割り当てます TAP A SLOT', 590, 16, 500);
      text(g, lines[0] || '', 24, 622, { size: 16, color: C.dim, weight: 500 });
    } else {
      text(g, 'ものを選んで → スロットに割り当て', 24, 610, { size: 18, color: C.dim });
      btn(432, 528, 190, 52, '道しるべ', () => ui.guide(), { sub: 'WAYBELL', size: 20 });
    }
  }
  function fitsSlot(id, s) {
    const inv = G() && G().inventory;
    const d = inv && inv.def(id);
    if (!d) return false;
    if (Array.isArray(d.slots) && d.slots.length) return d.slots.includes(s);
    return false;
  }
  function name(id) { const d = G() && G().inventory.def(id); return d ? d.name : id; }

  function drawStats(g) {
    const game = G();
    const st = game && game.stats;
    if (!st) return;
    const d = st.today ? st.today() : { steps: 0, kcal: 0, activeSec: 0, distance: 0 };
    text(g, '今日 TODAY', 24, 110, { size: 20, color: C.dim });
    const big = (x, y, v, unit, label) => {
      text(g, v, x, y, { size: 46, weight: 800, color: C.white });
      text(g, unit, x + g.measureText(v).width + 8, y, { size: 20, color: C.gold });
      text(g, label, x, y + 26, { size: 16, color: C.dim, weight: 500 });
    };
    big(28, 168, d.steps.toLocaleString(), '歩', '歩数 STEPS');
    big(330, 168, (d.distance || 0).toFixed(2), 'km', `距離 · 実歩幅 ${(d.steps * 0.7 / 1000).toFixed(2)} km`);
    big(28, 252, Math.round(d.kcal).toString(), 'kcal', '消費（目安） ESTIMATE');
    big(330, 252, Math.floor(d.activeSec / 60).toString(), '分', 'アクティブ ACTIVE');
    text(g, `最高ケイデンス ${st.session.bestCadence || 0} spm`, 28, 318, { size: 20, color: C.cyan });
    text(g, `今の運動強度 ${st.met.toFixed(1)} MET`, 330, 318, { size: 20, color: C.cyan });
    // last 7 days
    text(g, '7 日間の歩数 LAST 7 DAYS', 24, 360, { size: 18, color: C.dim });
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const m = dt.getMonth() + 1, dd = dt.getDate();
      const key = `${dt.getFullYear()}-${m < 10 ? '0' : ''}${m}-${dd < 10 ? '0' : ''}${dd}`;
      days.push({ label: `${m}/${dd}`, v: (st.days[key] && st.days[key].steps) || 0 });
    }
    const max = Math.max(1000, ...days.map((x) => x.v));
    days.forEach((x, i) => {
      const bx = 40 + i * 82, bh = 120 * x.v / max;
      roundRect(g, bx, 500 - bh, 50, Math.max(4, bh), 8);
      g.fillStyle = i === 6 ? C.gold : 'rgba(127,233,255,0.6)'; g.fill();
      text(g, x.label, bx + 25, 524, { size: 15, align: 'center', color: C.dim, weight: 500 });
      if (x.v) text(g, x.v >= 1000 ? `${(x.v / 1000).toFixed(1)}k` : `${x.v}`, bx + 25, 494 - bh, { size: 14, align: 'center', color: C.ink });
    });
    text(g, `累計 ${st.steps.toLocaleString()} 歩・${st.distance.toFixed(1)} km・${Math.round(st.kcal)} kcal・${Object.keys(st.days).length} 日`, 24, 560, { size: 18, color: C.ink, maxW: 600 });
    if (game.quest && game.quest.stage === 0) btn(24, 574, 290, 54, 'チュートリアルを飛ばす', () => { game.quest.skipTutorial(); ui.closeMenu(); }, { sub: 'SKIP TUTORIAL', size: 20 });
    btn(330, 574, 290, 54, '今日はここまで', () => { ui.startCooldown(); }, { sub: 'COOL DOWN', size: 20 });
  }

  function settingDefs() { return (ctx.settings && ctx.settings.defs) || FALLBACK_DEFS; }
  function fmt(key, v, d) {
    if (typeof v === 'boolean') return v ? 'オン' : 'オフ';
    if (d && d.names && d.names[v] != null) return d.names[v];
    if (VALUE_NAMES[v] != null) return VALUE_NAMES[v];
    if (typeof v === 'number') {
      if (key.startsWith('vol') || key === 'haptics') return `${Math.round(v * 100)}%`;
      if (key === 'strideScale') return `×${v.toFixed(2)}`;
      return `${Math.round(v * 100) / 100}`;
    }
    return String(v);
  }
  function drawSettings(g) {
    const defs = settingDefs();
    const set = ctx.settings;
    if (!set) return;
    const keys = SETTING_ORDER.filter((k) => defs[k]);
    const per = 12, rows = keys.slice(settingsCol * per, settingsCol * per + per);
    rows.forEach((k, i) => {
      const d = defs[k] || {};
      const v = set.get(k);
      const y = 90 + i * 40;
      const numeric = typeof v === 'number' && !d.options;
      text(g, d.label || k, 28, y + 26, { size: 19, color: C.ink, maxW: 250 });
      text(g, d.en || '', 290, y + 26, { size: 12, color: C.dim, weight: 500, maxW: 110 });
      if (numeric) {
        btn(400, y + 3, 44, 32, '−', () => bump(k, d, -1), { size: 22, r: 10 });
        text(g, fmt(k, v, d), 506, y + 26, { size: 19, color: C.gold, align: 'center' });
        btn(568, y + 3, 44, 32, '+', () => bump(k, d, 1), { size: 22, r: 10 });
      } else {
        btn(400, y + 3, 212, 32, fmt(k, v, d), () => cycle(k, d), { size: 18, r: 10, color: C.gold });
      }
    });
    btn(24, 580, 290, 50, settingsCol ? '← 前のページ' : '次のページ →', () => { settingsCol = settingsCol ? 0 : 1; dirty = true; }, { size: 20 });
    text(g, `${settingsCol + 1} / 2`, 470, 612, { size: 20, color: C.dim, align: 'center' });
  }
  function cycle(k, d) {
    const set = ctx.settings, v = set.get(k);
    let nv;
    if (typeof v === 'boolean') nv = !v;
    else if (d.options) { const i = d.options.indexOf(v); nv = d.options[(i + 1) % d.options.length]; }
    else return;
    set.set(k, nv); dirty = true;
  }
  function bump(k, d, dir) {
    const set = ctx.settings, v = +set.get(k);
    const step = STEP_OVERRIDE[k] || d.step || 1;
    let nv = Math.round((v + dir * step) / step) * step;
    nv = Math.max(d.min ?? -Infinity, Math.min(d.max ?? Infinity, nv));
    set.set(k, +nv.toFixed(3)); dirty = true;
  }

  function drawRest(g) {
    const game = G();
    if (!game) return;
    const near = game.checkpoints && game.checkpoints.nearLit(6);
    const inv = game.inventory;
    if (!near) {
      text(g, '風見の灯のそばで休めます', 320, 160, { size: 26, align: 'center', color: C.ink });
      text(g, 'REST AT A LIT WAYLIGHT', 320, 194, { size: 16, align: 'center', color: C.dim });
      btn(170, 240, 300, 64, '今日はここまで', () => ui.startCooldown(), { sub: 'COOL DOWN', size: 22 });
      text(g, '焚き火で時刻を進めたり、かけらで道具を', 320, 360, { size: 18, align: 'center', color: C.dim });
      text(g, '整えたりできます。', 320, 388, { size: 18, align: 'center', color: C.dim });
      return;
    }
    text(g, near.name, 24, 112, { size: 24, color: C.fireA });
    text(g, 'ひと休み  REST', 616, 112, { size: 18, color: C.dim, align: 'right' });
    const W = ctx.world;
    const goTo = (h, label) => () => {
      if (W && typeof W.setTimeOfDay === 'function') W.setTimeOfDay(h);
      ctx.events.emit('ui:toast', { text: `${label}まで休んだ`, sub: 'RESTED', kind: 'info', ms: 2500 });
      game.vitals.heal(4);
      game.requestSave && game.requestSave(true);
      ui.closeMenu();
    };
    btn(24, 130, 190, 74, '朝まで', goTo(7, '朝'), { sub: 'MORNING 7:00', size: 24 });
    btn(225, 130, 190, 74, '夕方まで', goTo(17, '夕方'), { sub: 'EVENING 17:00', size: 24 });
    btn(426, 130, 190, 74, '夜まで', goTo(21, '夜'), { sub: 'NIGHT 21:00', size: 24 });
    btn(24, 216, 592, 60, '今日はここまで（60 秒のクールダウン）', () => ui.startCooldown(), { sub: 'COOL DOWN & SUMMARY', size: 21 });
    // shard shop (§8.5)
    text(g, `かけらで整える  —  手持ち ${inv.count('shard')}`, 24, 314, { size: 20, color: C.gold });
    const buy = (cost, fn, okMsg) => () => {
      if (inv.count('shard') < cost) { say('かけらが足りない NOT ENOUGH SHARDS'); return; }
      if (fn() === false) { say('これ以上持てない FULL'); return; }
      inv.remove('shard', cost); say(okMsg);
    };
    const row = (y, icon, label, sub, cost, fn, okMsg, disabled) => {
      card(g, 24, y, 592, 64, 14, 'rgba(14,20,48,0.6)');
      drawIcon(g, icon, 62, y + 32, 44);
      text(g, label, 100, y + 30, { size: 21, color: disabled ? C.dim : C.ink });
      text(g, sub, 100, y + 52, { size: 14, color: C.dim, weight: 500 });
      if (!disabled) btn(470, y + 8, 136, 48, `◆ ${cost}`, buy(cost, fn, okMsg), { size: 20, color: C.gold });
      else text(g, '—', 538, y + 40, { size: 20, align: 'center', color: C.dim });
    };
    row(326, 'arrow', '矢 ×5', 'ARROWS', 20, () => inv.add('arrow', 5) > 0 || false, '矢を 5 本そろえた');
    row(396, 'bomb', '爆ぜ実 ×2', 'BURSTFRUIT', 30, () => inv.add('bomb', 2) > 0 || false, '爆ぜ実を 2 つ手に入れた');
    const ts = inv.temper.sword | 0, tp = inv.temper.spear | 0;
    const cost = (n) => [60, 90, 120][n];
    row(466, 'sword', `剣を鍛え直す（+1）  ${ts}/3`, 'TEMPER BLADE', cost(ts), () => { inv.temper.sword++; ctx.events.emit('temper', { itemId: 'sword', level: inv.temper.sword }); }, '剣が鋭くなった', ts >= 3 || !inv.has('sword'));
    row(536, 'spear', `槍を鍛え直す（+1）  ${tp}/3`, 'TEMPER SPEAR', cost(tp), () => { inv.temper.spear++; ctx.events.emit('temper', { itemId: 'spear', level: inv.temper.spear }); }, '槍が鋭くなった', tp >= 3 || !inv.has('spear'));
  }

  function setPage(p) {
    if (!PAGES.some((x) => x.id === p)) p = 'map';
    page = p; sel = null; dirty = true;
    ctx.events.emit('ui:menu', { open, page });
  }

  // ── open / close ──
  function canOpen() {
    const game = G(), pl = ctx.player;
    if (game && game.enemies && pl && pl.pos && game.enemies.nearestThreat(pl.pos.x, pl.pos.z, 9)) {
      ctx.events.emit('ui:toast', { text: '凪が近い — いまは開けない', sub: 'NAGI NEARBY', kind: 'warn', ms: 1800 });
      return false;
    }
    return true;
  }
  const W = {
    get open() { return open; },
    get page() { return page; },
    panel,
    openMenu(p, opts = {}) {
      if (!opts.force && !canOpen()) return false;
      if (p) page = PAGES.some((x) => x.id === p) ? p : 'map';
      open = true; dirty = true; sel = null; byGesture = !!opts.gesture;
      map.invalidate();
      document.body.classList.add('awui-menu-open');
      ctx.events.emit('ui:menu', { open: true, page });
      return true;
    },
    closeMenu() {
      if (!open) return;
      open = false; byGesture = false;
      panel.mesh.visible = false; dot.visible = false;
      document.body.classList.remove('awui-menu-open');
      ctx.events.emit('ui:menu', { open: false, page });
    },
    redraw() { dirty = true; },
    /** a tap/click at canvas pixel (x, y) */
    click(x, y) {
      if (dirty || !hits.length) draw();
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i];
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
          try { h.action(); } catch (e) { /* ignore */ }
          ctx.events.emit('ui:click', {});
          dirty = true;
          return true;
        }
      }
      return false;
    },
    update(dt, vr) {
      if (msgT > 0) { msgT -= dt; if (msgT <= 0) { msg = ''; dirty = true; } }
      const input = ctx.input;
      if (vr && input) {
        // Y button toggles; looking at the inside of the left wrist opens it
        if (input.justPressed && input.justPressed('y')) { if (open) W.closeMenu(); else W.openMenu(page); }
        gestureTick(dt);
      }
      if (!open) return;
      redrawT -= dt;
      if (page === 'map' && redrawT <= 0) { redrawT = 0.25; dirty = true; }
      if (page === 'stats' && redrawT <= 0) { redrawT = 1; dirty = true; }
      if (dirty) draw();
      panel.mesh.visible = !!vr;
      if (vr) placeAndTouch(dt);
    },
  };

  // looking at the raised left wrist opens the menu (real XR only; the Y button always works)
  const _g = new THREE.Vector3(), _hf = new THREE.Vector3();
  function gestureTick(dt) {
    const input = ctx.input, L = input.hands && input.hands.left;
    const realXR = !!(ctx.renderer && ctx.renderer.xr && ctx.renderer.xr.isPresenting);
    if (!realXR || !L || !L.tracked) { gestureT = 0; return; }
    const heldLeft = ctx.items && ctx.items.held && ctx.items.held.left;
    _h.copy(input.head.pos);
    _d.subVectors(L.pos, _h);
    const dist = _d.length();
    _d.normalize();
    _g.set(0, 0, -1).applyQuaternion(input.head.quat);           // gaze
    _n.set(1, 0, 0).applyQuaternion(L.quat);                     // across the wrist (palm / back of the hand)
    _hf.set(0, 0, -1).applyQuaternion(L.quat);                    // where the controller points
    const looking = _g.dot(_d) > 0.93;                            // within ~21° of the gaze
    const raised = L.pos.y > _h.y - 0.5 && dist > 0.18 && dist < 0.55;
    const turned = Math.abs(_n.dot(_d)) > 0.7 && Math.abs(_hf.dot(_d)) < 0.6;
    const facing = !heldLeft && looking && raised && turned;
    if (!open) {
      gestureT = facing ? gestureT + dt : 0;
      if (gestureT > 0.6) { gestureT = 0; W.openMenu(page, { gesture: true }); }
    } else if (byGesture) {
      gestureOff = (looking && raised) ? 0 : gestureOff + dt;
      if (gestureOff > 1.0) { gestureOff = 0; W.closeMenu(); }
    }
  }

  function placeAndTouch(dt) {
    const input = ctx.input, L = input.hands.left, R = input.hands.right;
    _h.copy(input.head.pos);
    // above the left wrist, facing the eyes; follows the hand softly so it does not jitter
    if (L && L.tracked) _t.copy(L.pos).addScaledVector(_d.subVectors(_h, L.pos).normalize(), 0.04).add(_n.set(0, 0.19, 0));
    else _t.set(_h.x + Math.sin(input.head.yaw) * 0.45, _h.y - 0.25, _h.z - Math.cos(input.head.yaw) * 0.45);
    if (!panel.mesh.visible || panel.mesh.position.distanceToSquared(_t) > 1) panel.mesh.position.copy(_t);
    panel.mesh.position.lerp(_t, 1 - Math.exp(-dt / 0.1));
    panel.mesh.lookAt(_h);
    panel.mesh.updateMatrixWorld();
    // the right hand's tip touches the board
    if (!R || !R.tracked) { dot.visible = false; return; }
    _tip.set(0, 0, -0.06).applyQuaternion(R.quat).add(R.pos);
    _loc.copy(_tip);
    panel.mesh.worldToLocal(_loc);
    const u = _loc.x / panel.wM + 0.5, v = 0.5 - _loc.y / panel.hM, depth = _loc.z;
    const inside = u >= 0 && u <= 1 && v >= 0 && v <= 1;
    if (pressCool > 0) pressCool -= dt;
    if (inside && depth < 0.05 && depth > -0.04) {
      dot.visible = true;
      dot.position.set(_loc.x, _loc.y, 0.002);
      if (lastDepth > 0.012 && depth <= 0.006 && pressCool <= 0) {
        pressCool = 0.3;
        if (W.click(u * panel.w, v * panel.h)) { try { input.haptic('right', 0.35, 20); } catch (e) { /* ignore */ } }
      }
    } else dot.visible = false;
    lastDepth = inside ? depth : 1;
  }

  return W;
}
