// player/interact.js — what you look at and what your hands do (DESIGN.md §9, §10, §22).
// Each frame: find the target (resource node, water, fire, carcass, drop, building site, companion) → game.prompt.
// E / pinch / grab starts the target's action; left click / gesture strokes use the held tool (chop, cut, thrust,
// shoot, cast, throw the net, strike sparks); right click aims / draws / charges a throw.
// Activities (player/activity.js) run the minigames; when one finishes, yields are applied and game time passes.
import * as THREE from 'three';
import { createActivity } from './activity.js';
import { RESOURCE_OPTIONS, optionsFor, val, assignSpecies } from '../sim/resources.js';
import { itemDef, attrsOf } from '../data/items.js';
import { WATERS, TREATMENTS } from '../data/water.js';
import { SPECIES, BUTCHER } from '../data/fauna.js';
import { FISH } from '../data/fauna.js';
import { biteModel, pickSpecies, hookOutcome, tensionCap, spotAt, netCatch, isBait } from '../sim/fishing.js';
import { METHODS as FIRE_METHODS, ignitionChance, bestTinder, dampness } from '../sim/fires.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Interact {
  constructor(game) {
    this.game = game;
    this.target = null;       // { type, node?, fire?, site?, water?, label, options }
    this.optIndex = 0;
    this.activity = null;
    this.holdE = false;
    this.click = false; this.release = false;
    this.mouseDX = 0;
    this.altKey = 0;
    this.chargeT = 0;
    this.lastStrokeAlt = null;
  }

  init(game) {
    this.game = game;
    const inp = game.input;
    inp.on('interact', () => this.onInteract());
    addEventListener('keyup', (e) => { if (e.code === 'KeyE') this.holdE = false; });
    addEventListener('keydown', (e) => { if (e.code === 'KeyE') this.holdE = true; if ((e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') && this.activity?.spec.kind === 'friction') { if (this.lastStrokeAlt !== e.code[3]) { this.altKey++; this.lastStrokeAlt = e.code[3]; } } if ((e.code === 'ShiftLeft') && game.sys.combat?.aiming) game.sys.combat.holdBreath(); });
    inp.on('primary', () => { this.click = true; this.onPrimary(); });
    inp.on('primaryUp', () => { this.release = true; this.onPrimaryUp(); });
    inp.on('secondary', () => this.onSecondary(true));
    inp.on('secondaryUp', () => this.onSecondary(false));
    inp.on('wheel', (e) => { if (game.placement?.active) { game.placement.rotate(Math.sign(e.deltaY) * 0.2); return; } if (this.target?.options?.length > 1) { this.optIndex = (this.optIndex + (e.deltaY > 0 ? 1 : -1) + this.target.options.length) % this.target.options.length; } });
    inp.on('reload', () => { if (game.placement?.active) game.placement.rotate(0.3); });
    addEventListener('mousemove', (e) => { if (inp.locked) this.mouseDX += e.movementX; });
    // assign look-alike species / stock to resource nodes once
    const t = game.world.terrain;
    for (const n of game.world.nodes.all.values()) if (RESOURCE_OPTIONS[n.kind] && !n.data.left) assignSpecies(n, game.rng, t.zoneAt(n.x, n.z));
  }

  // ---------------------------------------------------------------- context for resource options
  ctx(node) {
    const g = this.game, held = g.sys.player.heldStack();
    const def = held ? itemDef(held.id, held) : null;
    return {
      game: g, node, heldStack: held, heldDef: def, tool: def?.tool?.kind || null, knowledge: g.sys.knowledge, rng: g.rng,
      hour: g.clock.hour, tide: g.clock.tide(), zone: g.sys.player.zone, rain: g.sys.weather.rain,
      rainWet: g.sys.weather.rain > 0.2 && (g.sys.player.shelter?.rain ?? 0) < 0.5 ? 70 : 0, score: 0.7,
    };
  }

  // ---------------------------------------------------------------- targeting
  findTarget() {
    const g = this.game, P = g.player, nodes = g.world.nodes;
    const eye = g.renderer.camera.position, fwd = P.forward;
    const comp = g.sys.companion?.body;
    if (comp && Math.hypot(comp.pos.x - P.pos.x, comp.pos.z - P.pos.z) < 2.4) {
      const dx = comp.pos.x - P.pos.x, dz = comp.pos.z - P.pos.z, d = Math.hypot(dx, dz);
      if ((dx * fwd.x + dz * fwd.z) / d > 0.6) return { type: 'companion', label: g.sys.companion.name, options: [{ id: 'menu', label: `${g.sys.companion.name}と 話す・頼む` }] };
    }
    // fires
    const fr = g.sys.fires?.nearest(P.pos, 2.6);
    if (fr) {
      const fp = fr.fire.group.position, d = Math.hypot(fp.x - P.pos.x, fp.z - P.pos.z);
      if ((((fp.x - P.pos.x) * fwd.x + (fp.z - P.pos.z) * fwd.z) / Math.max(d, 0.1) > 0.5) || d < 1.2) return { type: 'fire', fire: fr, label: '火', options: this.fireOptions(fr) };
    }
    const node = nodes.pick(eye, fwd, 2.6, (n) => (RESOURCE_OPTIONS[n.kind]?.length || n.kind === 'carcass' || n.kind === 'drop' || n.structure));
    if (node) {
      if (node.kind === 'drop') return { type: 'drop', node, label: node.data.name, options: [{ id: 'pick', label: `${g.sys.knowledge?.nameOf?.(node.data.stack.id) || node.data.name}を 拾う` }] };
      if (node.kind === 'carcass') return { type: 'carcass', node, label: SPECIES[node.data.species]?.name, options: this.carcassOptions(node) };
      if (node.structure) { const opts = g.sys.building?.optionsFor?.(node.site || node.data?.site, this) || []; if (opts.length) return { type: 'site', node, label: node.data?.name || '建物', options: opts }; }
      if (RESOURCE_OPTIONS[node.kind]?.length) {
        const c = this.ctx(node);
        const ops = optionsFor(c).map((o) => ({ id: o.opt.id, label: val(o.opt.label, c), ok: o.ok, reason: o.reason, opt: o.opt }));
        g.sys.knowledge?.seen?.(node.data.species || node.kind);
        return { type: 'node', node, label: node.kind, options: ops };
      }
    }
    // small living animals in reach (crabs) → catch by hand
    const crab = g.sys.fauna?.nearestLiving(P.pos, fwd, 1.6, (a) => !!a.sp.catchable);
    if (crab) return { type: 'animal', animal: crab, label: crab.sp.name, options: [{ id: 'catch', label: `${crab.sp.name}を 手で つかまえる` }] };
    // water in front
    const wx = P.pos.x + fwd.x * 1.6, wz = P.pos.z + fwd.z * 1.6;
    const w = g.world.terrain.waterAt(wx, wz, P.seaLevel);
    const here = g.world.terrain.waterAt(P.pos.x, P.pos.z, P.seaLevel);
    const water = w.type ? w : here.type ? here : null;
    if (water && eye.y - water.level < 2.4) return { type: 'water', water, label: water.type, options: this.waterOptions(water) };
    return null;
  }

  waterOptions(w) {
    const g = this.game, held = g.sys.player.heldStack(), d = held && itemDef(held.id, held);
    const src = this.waterSource(w);
    const ops = [];
    if (d?.container || d?.attrs?.container >= 4 || held?.stats?.liters) ops.push({ id: 'fill', label: `${d.name}に 水を くむ（${WATERS[src]?.name || '水'}）` });
    ops.push({ id: 'drink_hand', label: w.type === 'sea' ? '海水を 飲む（のどが 渇く）' : `手で すくって 飲む（${WATERS[src]?.name || '水'}）` });
    ops.push({ id: 'wash', label: '体と 手を 洗う' });
    return ops;
  }

  waterSource(w) {
    if (w.type === 'sea') return 'sea';
    if (w.type === 'pond') return 'pond';
    if (w.type === 'stream') {
      const s = this.game.world.terrain.streamInfo(this.game.player.pos.x, this.game.player.pos.z);
      const muddy = (this.game.clock.total / 60 - (this.game.sys.weather.lastRainEndH ?? -99)) < 24 && (this.game.sys.weather.history || []).includes('rain');
      return s.t < 0.35 ? 'river_up' : muddy ? 'river_low' : 'river_low';
    }
    return 'river_low';
  }

  fireOptions(rec) {
    const g = this.game, fires = g.sys.fires, inv = g.sys.player.inv;
    const held = g.sys.player.heldStack(), hd = held && itemDef(held.id, held);
    const ops = [];
    if (!rec.fire.lit) {
      const ms = this.fireMethods(rec);
      for (const m of ms.slice(0, 3)) ops.push({ id: `light:${m.id}`, label: `火を おこす（${FIRE_METHODS[m.id].name}・成功率 ${Math.round(m.p * 100)}%）`, method: m });
      if (!ms.length) ops.push({ id: 'nomethod', label: '火を おこす 道具が ない', ok: false, reason: '弓ぎりセット・きりもみ・火打ち石を 作ろう' });
    } else {
      if (held && hd?.food && hd.food.cookable !== false) ops.push({ id: 'cook', label: `${g.sys.knowledge?.nameOf?.(held.id) || hd.name}を 焼く` });
      const fuel = inv.stacks.find((s) => (itemDef(s.id, s)?.fuel ?? 0) > 0 && !itemDef(s.id, s)?.food && s.id !== 'log');
      if (fuel) ops.push({ id: 'fuel', label: `${itemDef(fuel.id).name}を くべる（残り ${(rec.fire.fuel / 60).toFixed(1)} 時間）`, stack: fuel });
      if (held && (hd?.container?.heatproof || held.stats?.heatproof) && held.water?.cups) ops.push({ id: 'boil', label: `${hd.name}を 火に かける（煮沸・煮込み）` });
      if (held?.id === 'torch' || held?.id === 'torch_made') ops.push({ id: 'torch', label: 'たいまつに 火を つける' });
      ops.push({ id: 'sit', label: '火の そばに 座って 休む' });
    }
    rec.cooking.forEach((c, i) => { const st = cookStageName(c.stack.done); ops.unshift({ id: `take:${i}`, label: `${itemDef(c.stack.id)?.name}を 取り出す（${st}）` }); });
    rec.pots.forEach((p, i) => ops.push({ id: `pot:${i}`, label: `${itemDef(p.stack.id)?.name}を 火から おろす${p.stack.water?.treat === 'boil' ? '（沸いた）' : `（${Math.round(p.boilMin)}/10 分）`}` }));
    return ops;
  }

  /** ignition methods available now, with their chance (§10.1) */
  fireMethods(rec) {
    const g = this.game, inv = g.sys.player.inv, W = g.sys.weather;
    const tinder = bestTinder(inv);
    const hereShelter = g.sys.building?.shelterAt?.(rec.fire.group.position.x, rec.fire.group.position.z) || { rain: 0, wind: 0 };
    const damp = dampness({ rain: W.rain, humidity: W.humidity, roof: hereShelter.rain >= 0.7, hour: g.clock.hour, tinderWet: tinder.stack?.wet > 60 });
    const base = { tinderMul: tinder.mul, damp, windSpeed: W.windSpeed, windBlock: Math.max(hereShelter.wind || 0, g.player.crouch ? 0.3 : 0), diffFire: g.diff?.fire ?? 0, skill: 0 };
    const out = [];
    const has = (id) => inv.stacks.find((s) => s.id === id);
    const steelish = inv.stacks.find((s) => /knife|axe|metal_scrap|nail|can/.test(s.id) || itemDef(s.id)?.tags?.includes('steel'));
    if (g.fires.find((f) => f === rec.fire) && g.sys.fires.isEmber(rec)) out.push({ id: 'ember', p: 1 });
    if (has('firesteel')) out.push({ id: 'firesteel', p: ignitionChance({ ...base, method: 'firesteel' }) + (g.sys.player.inv.find('guide') ? 0.1 : 0) });
    if (has('lighter')) out.push({ id: 'lighter', p: ignitionChance({ ...base, method: 'lighter' }) });
    if (has('ammo') || (g.setup?.ammo === 'inf' && has('rifle'))) out.push({ id: 'gunpowder', p: ignitionChance({ ...base, method: 'gunpowder' }) });
    if (has('flint') && steelish) out.push({ id: 'flint_steel', p: ignitionChance({ ...base, method: 'flint_steel', base: inv.find('char_cloth') ? 0.75 : steelish.id === 'can' || steelish.id === 'nail' ? 0.25 : 0.55 }) });
    const bowKit = inv.stacks.find((s) => s.id === 'bow_drill_kit');
    if (bowKit) out.push({ id: 'bow_drill', p: ignitionChance({ ...base, method: 'bow_drill', base: 0.20 + 0.30 * bowKit.q / 100, board: bowKit.stats?.board ?? 1, notch: !bowKit.stats?.noNotch, wetKit: bowKit.wet > 60 ? 0.3 : 1 }), stack: bowKit });
    const handKit = inv.stacks.find((s) => s.id === 'hand_drill_kit');
    if (handKit) out.push({ id: 'hand_drill', p: ignitionChance({ ...base, method: 'hand_drill', board: handKit.stats?.board ?? 1, notch: !handKit.stats?.noNotch, wetKit: handKit.wet > 60 ? 0.3 : 1 }), stack: handKit });
    if (inv.withTag?.('stone')?.length >= 0 && inv.count('flint') >= 2) out.push({ id: 'flint_flint', p: tinder.mul >= 1 ? ignitionChance({ ...base, method: 'flint_flint' }) : 0 });
    return out.filter((m) => m.p > 0).sort((a, b) => b.p - a.p);
  }

  carcassOptions(node) {
    const sp = SPECIES[node.data.species];
    const tool = this.butcherTool();
    if (sp.small) return [{ id: 'take_small', label: `${sp.name}を ${sp.flies || node.data.species === 'junglefowl' ? '羽を むしって さばく' : '拾う'}` }];
    if (tool === 'hands') return [{ id: 'butcher', label: `${sp.name}を さばく`, ok: false, reason: '刃物が 要る（石刃でも できる）' }];
    const ops = [{ id: 'butcher', label: `${sp.name}を 解体する（${BUTCHER[tool].label}）` }];
    if (!node.data.bled) ops.push({ id: 'bleed', label: '血抜きを する' });
    return ops;
  }

  butcherTool() {
    const inv = this.game.sys.player.inv;
    if (inv.find('knife')) return 'pro_knife';
    if (inv.stacks.find((s) => /knife_made/.test(s.id) && s.q >= 50) || inv.find('obsidian_blade')) return 'knife';
    if (inv.find('axe')) return 'axe';
    if (inv.stacks.find((s) => /knife_made|flake/.test(s.id))) return 'flake';
    if (inv.find('shell') || inv.find('glass_shard')) return 'shell';
    return 'hands';
  }

  // ---------------------------------------------------------------- input → actions
  onInteract() {
    const g = this.game;
    if (g.paused || this.activity) return;
    if (g.placement?.active) { g.placement.confirm(); return; }
    const t = this.target;
    if (!t) return;
    const opt = t.options[this.optIndex] || t.options[0];
    if (!opt) return;
    if (opt.ok === false) { g.bus.emit('toast', { text: opt.reason || 'できない', kind: 'warn' }); return; }
    this.run(t, opt);
  }

  run(t, opt) {
    const g = this.game, P = g.sys.player, inv = P.inv;
    switch (t.type) {
      case 'companion': g.screens?.show('companion'); return;
      case 'drop': { const s = g.sys.combat.pickDrop(t.node); this.gain(s.id, s.n); g.sys.sfx?.play('pickup'); return; }
      case 'animal': this.startActivity({ kind: 'hold', title: opt.label, params: { seconds: 0.6 } }, () => {
        const r = g.sys.fauna.tryCatch(t.animal, 0.55 + g.rng.next() * 0.35);
        if (r.ok) this.takeSmallCarcass(t.animal.node); else { g.bus.emit('toast', { text: '逃げられた', kind: 'warn' }); if (r.pinch) P.body.injure('cut', 1, 3, 'はさまれた'); }
      }); return;
      case 'water': return this.waterAction(t, opt);
      case 'fire': return this.fireAction(t, opt);
      case 'carcass': return this.carcassAction(t, opt);
      case 'site': return g.sys.building?.act?.(t.node, opt, this);
      case 'node': return this.nodeAction(t, opt);
      default: break;
    }
  }

  nodeAction(t, o) {
    const g = this.game, opt = o.opt, node = t.node;
    const c = this.ctx(node);
    const act = val(opt.activity, c);
    const spec = { kind: act.kind, title: o.label, params: { ...act.params }, target: node };
    this.startActivity(spec, (res, a) => {
      c.score = a?.scoreAvg ?? 0.7;
      const minutes = val(opt.gameMinutes, c) || 1;
      if (opt.heavy) P(g).heavyT = 4;
      const ys = val(opt.yields, c) || [];
      if (!ys.length && opt.failText) g.bus.emit('toast', { text: opt.failText, kind: 'warn' });
      for (const [id, n, extra] of ys) this.gain(id, n, { ...extra, rng: g.rng });
      if (opt.stock) node.data.left = Math.max(0, (node.data.left ?? 1) - 1);
      if (opt.noise) g.bus.emit('noise', { x: node.x, z: node.z, radius: opt.noise });
      if (opt.peck) { P(g).body.s.hp = Math.max(0, P(g).body.s.hp - 2); g.bus.emit('toast', { text: '親鳥に つつかれた！', kind: 'warn' }); }
      this.afterNode(node, opt);
      P(g).body.s.stamina = Math.max(0, P(g).body.s.stamina - (opt.stamina || 0));
      g.passTime(minutes, { heavy: !!opt.heavy });
      if (opt.learn === 'seen' && node.data.species) g.sys.knowledge?.seen?.(node.data.species);
      // repeated gathering teaches the plant (K2 after 3 times, §20.2)
      if (node.data.species) { const k = `g:${node.data.species}`; P(g).stats[k] = (P(g).stats[k] || 0) + 1; if (P(g).stats[k] >= 3) g.sys.knowledge?.learn?.(node.data.species, 2, 'gathered'); }
      // tools wear
      if (opt.id === 'fell' || opt.id === 'cut' || opt.id === 'bark') this.wearHeld(opt.id === 'fell' ? (act.params.hits || 3) : 1);
    });
    if (opt.sound) this.activity && (this.activity.sound = opt.sound);
  }

  afterNode(node, opt) {
    const g = this.game, nodes = g.world.nodes;
    const regrow = (opt.regrowDays ?? 0) * (g.diff?.resources ? 1 / g.diff.resources : 1);
    if (opt.after === 'hide' || opt.after === 'stump') { nodes.hide(node); node.data.regrowAt = regrow ? g.clock.total + regrow * 1440 : null; if (opt.after === 'stump') { node.solid = false; if (opt.fall) g.sys.sfx?.play('tree_fall'); } }
    else if (opt.after === 'shrink' && (node.data.left ?? 0) <= 0) { nodes.setScale(node, 0.45); node.data.regrowAt = g.clock.total + Math.max(0.5, regrow) * 1440; }
    else if (opt.after === 'remove') nodes.remove(node);
    else if (opt.stock && (node.data.left ?? 0) <= 0) node.data.regrowAt = g.clock.total + Math.max(0.5, regrow) * 1440;
  }

  /** regrowth: nodes whose time has come come back (checked every game hour) */
  regrow() {
    const g = this.game, now = g.clock.total;
    for (const n of g.world.nodes.all.values()) {
      if (n.data?.regrowAt && now >= n.data.regrowAt) {
        n.data.regrowAt = null;
        n.data.left = { palm: 4, bush_berry: 6, banana: 1, herb: 3, mushroom: 3, shell: 2, seaweed: 3, nest: 3, vine: 3, bamboo: 1, tree: 3 }[n.kind] ?? 2;
        if (n.kind !== 'tree' || n.solid !== false) g.world.nodes.show(n);
        g.world.nodes.setScale(n, 1);
      }
    }
  }

  gain(id, n, extra = {}) {
    const g = this.game;
    if (!n || !itemDef(id)) return;
    g.sys.player.inv.add(id, n, extra);
    g.sys.player.stats.gathered += n;
    g.bus.emit('item:gained', { id, n, name: g.sys.knowledge?.nameOf?.(id) || itemDef(id).name });
  }

  wearHeld(uses = 1) {
    const g = this.game, s = g.sys.player.heldStack();
    if (!s || s.dur === null || s.dur === undefined) return;
    s.dur -= uses / (g.diff?.durability ?? 1);
    if (s.dur <= 0) {
      const name = itemDef(s.id, s)?.name;
      g.sys.player.inv.removeStack(s.uid);
      g.sys.player.validate();
      g.bus.emit('toast', { text: `${name}が 壊れた`, kind: 'bad' });
      g.bus.emit('tool:broken', { name });
    }
  }

  // ---------------------------------------------------------------- water
  waterAction(t, opt) {
    const g = this.game, P = g.sys.player, src = this.waterSource(t.water), W = WATERS[src];
    if (opt.id === 'drink_hand') {
      this.startActivity({ kind: 'hold', title: '水を すくって 飲む', params: { seconds: 0.8 } }, () => {
        P.body.drink({ name: W?.name, water: (W?.water ?? 20), W: W?.W ?? 0.18, salty: !!W?.salty, parasite: W?.parasite }, { hands: true, day: g.clock.day });
        P.stats.waterCups++;
        g.sys.sfx?.play('drink');
        g.passTime(1);
      });
    } else if (opt.id === 'fill') {
      const held = P.heldStack(), d = itemDef(held.id, held);
      const liters = held.stats?.liters ?? d.container?.liters ?? ((d.attrs?.container ?? 4) >= 8 ? 3 : 0.25);
      held.water = { src, cups: Math.max(1, Math.round(liters / 0.25)), treat: 'none' };
      if (src !== 'sea' && held.stats?.filterQ) held.water.treat = 'filter';
      g.bus.emit('toast', { text: `${d.name}に ${W?.name || '水'}を くんだ（${held.water.cups} 杯）`, kind: 'info' });
      g.sys.sfx?.play('splash', { volume: 0.4 });
      g.passTime(1);
    } else if (opt.id === 'wash') {
      this.startActivity({ kind: 'hold', title: '体を 洗う', params: { seconds: 1.5 } }, () => {
        const b = P.body;
        b.s.hygiene = Math.min(100, b.s.hygiene + (src === 'sea' ? 25 : 40));
        b.s.wet = Math.max(b.s.wet, 60);
        b.moraleOnce('bath', 3, g.clock.day);
        b.treat('wash');
        P.bloodyHands = false;
        if (b.s.bodyTemp > 38) b.s.bodyTemp -= 0.5;
        g.passTime(10);
      });
    }
  }

  // ---------------------------------------------------------------- fire
  fireAction(t, opt) {
    const g = this.game, P = g.sys.player, rec = t.fire, fires = g.sys.fires;
    if (opt.id.startsWith('light:')) return this.lightFire(rec, opt.method);
    if (opt.id === 'fuel') { const s = opt.stack; const part = P.inv.take(s.uid, 1)[0]; const h = fires.addFuel(rec, part); if (h < 0) { P.inv.addStack(part); g.bus.emit('toast', { text: '丸太は 大きな 火でないと 燃えない。先に 枝を くべよう', kind: 'warn' }); } else g.sys.sfx?.play('drop'); return; }
    if (opt.id === 'cook') { const held = P.heldStack(); const one = P.inv.take(held.uid, 1)[0]; fires.cook(rec, one); P.validate(); g.bus.emit('toast', { text: '焼いている… 色と 音で 取り出す 時機を 決めよう', kind: 'info' }); return; }
    if (opt.id.startsWith('take:')) { const s = fires.takeOff(rec, +opt.id.split(':')[1]); if (s) { if (s.ash) { s.q = Math.max(1, s.q - 10); g.bus.emit('toast', { text: '串なしで 焼いたので 灰まみれ…', kind: 'warn' }); } g.bus.emit('toast', { text: `${itemDef(s.id).name}：${cookStageName(s.done)}`, kind: 'info' }); } return; }
    if (opt.id === 'boil') { const held = P.heldStack(); const r = fires.boil(rec, held); if (r === 'ok') { P.inv.removeStack(held.uid); P.validate(); g.bus.emit('toast', { text: '火に かけた。10 分 沸かすと 安全に なる', kind: 'info' }); } return; }
    if (opt.id.startsWith('pot:')) { const p = rec.pots.splice(+opt.id.split(':')[1], 1)[0]; if (p) P.inv.addStack(p.stack); return; }
    if (opt.id === 'torch') { const held = P.heldStack(); held.lit = 15; P.torchLit = true; g.bus.emit('toast', { text: 'たいまつに 火が ついた（15 分）', kind: 'good' }); return; }
    if (opt.id === 'sit') { P.resting = !P.resting; g.bus.emit('toast', { text: P.resting ? '火の そばで 休んでいる（動くと やめる）' : '立ち上がった', kind: 'info' }); return; }
  }

  lightFire(rec, m) {
    const g = this.game, P = g.sys.player, M = FIRE_METHODS[m.id];
    const tinder = bestTinder(P.inv);
    if (M.kind !== 'blow' && !tinder.stack) { g.bus.emit('toast', { text: '火口（枯れ草・ヤシの 繊維・木くず）が 要る', kind: 'warn' }); return; }
    const done = (ok, s) => {
      P.body.s.stamina = Math.max(0, P.body.s.stamina - M.stamina);
      g.passTime(M.minutes, { heavy: M.kind === 'friction' });
      if (m.stack) { m.stack.dur = (m.stack.dur ?? 15) - 1; if (m.stack.dur <= 0) { P.inv.removeStack(m.stack.uid); g.bus.emit('toast', { text: 'セットが すり減って 使えなく なった', kind: 'bad' }); } }
      if (m.id === 'gunpowder' && g.setup?.ammo !== 'inf') P.inv.take('ammo', 1);
      if (m.id === 'firesteel') { const fs = P.inv.find('firesteel'); if (fs) fs.dur = (fs.dur ?? 3000) - 1; }
      if (m.id === 'lighter') { const lt = P.inv.find('lighter'); if (lt) { lt.dur = (lt.dur ?? 50) - 1; if (lt.dur <= 0) { P.inv.removeStack(lt.uid); g.bus.emit('toast', { text: 'ライターの ガスが 切れた', kind: 'bad' }); } } }
      if (!ok) { g.bus.emit('toast', { text: M.kind === 'friction' ? '煙は 出たが 火種に ならなかった…' : '火花は 散ったが 火口に つかなかった', kind: 'warn' }); return; }
      if (tinder.stack && M.kind !== 'blow') P.inv.take(tinder.stack.uid, 1);
      g.sys.fires.light(rec, m.id);
      P.stats.firesLit++;
      if (M.kind === 'friction') P.stats.frictionFires = (P.stats.frictionFires || 0) + 1;
      if (g.sys.weather.rain > 0.2) P.stats.rainFires = (P.stats.rainFires || 0) + 1;
      if (!P.firstFire) { P.firstFire = true; P.body.addMorale(20, 'first_fire'); g.bus.emit('toast', { text: '火が ついた！ 炎を 見ると 心が 落ちつく', kind: 'good' }); }
      else g.bus.emit('toast', { text: '火が ついた', kind: 'good' });
      g.rec?.('fire');
    };
    if (M.kind === 'spark') {
      // §10.2: 3–5 strikes, each with p1 = 1 − (1 − P)^(1/5)
      const p1 = 1 - Math.pow(1 - m.p, 1 / 5);
      this.startActivity({ kind: 'spark', title: `${M.name}で 火を おこす`, params: { catchChance: p1, maxStrikes: 5 } }, (r) => done(!!r.ok));
    } else if (M.kind === 'friction') {
      this.startActivity({ kind: 'friction', title: `${M.name}で 火を おこす`, params: { heatPerStroke: m.id === 'bow_drill' ? 0.06 : 0.04, cool: 0.1, wetPenalty: g.sys.weather.humidity > 0.9 ? 0.3 : 0, catchChance: 1 } }, (r, a) => {
        // the friction minigame decides whether you got an ember; the ignition formula with s decides the flame
        if (!r.ok) { done(false); return; }
        const s = clamp(1.25 - (a.t / 14), 0.3, 1);
        const p = ignitionChance({ method: m.id, base: m.p / Math.max(0.01, (0.5 + 0.9 * 0.55)) * 1, tinderMul: 1, damp: 1, windSpeed: 0, s });
        done(g.rng.next() < Math.min(0.98, p * 1.6));
      });
    } else this.startActivity({ kind: 'hold', title: '息を 吹きかける', params: { seconds: 1.2 } }, () => done(true));
  }

  // ---------------------------------------------------------------- carcass
  carcassAction(t, opt) {
    const g = this.game, P = g.sys.player, node = t.node, sp = SPECIES[node.data.species];
    if (opt.id === 'take_small') {
      this.startActivity({ kind: 'hold', title: opt.label, params: { seconds: 1.2 } }, () => { this.takeSmallCarcass(node); g.passTime(sp.flies || node.data.species === 'junglefowl' ? 10 : 1); });
      return;
    }
    if (opt.id === 'bleed') { node.data.bled = true; g.passTime(5); g.bus.emit('toast', { text: '血抜きを した（肉の 傷みが 遅く なる）', kind: 'info' }); P.bloodyHands = true; return; }
    const tool = this.butcherTool(), B = BUTCHER[tool];
    const minutes = B.minutes[node.data.species === 'boar' ? 1 : 0];
    this.startActivity({ kind: 'hold', title: `${sp.name}を 解体する`, params: { seconds: 3.0 } }, () => {
      const y = sp.yield;
      const ageH = (g.clock.total - node.data.diedAt) / 60;
      const fresh = clamp(100 - ageH * 4 * (node.data.gutted ? 1 : 1.5), 0, 100);
      const extra = { fresh, bled: !!node.data.bled, gutted: true, source: sp.name, rng: g.rng };
      const meatId = Object.keys(y).find((k) => /meat|small_game/.test(k));
      let meat = Math.round(y[meatId] * B.meat) - (node.data.meatLoss || 0);
      if (node.data.dirty) extra.q = 30;
      this.gain(meatId, Math.max(1, meat), extra);
      if (y.hide && B.hide) this.gain('hide', Math.max(1, Math.round(y.hide * B.hide)), { q: B.hideQ });
      if (y.sinew && B.sinew) this.gain('sinew', Math.round(y.sinew * B.sinew));
      if (y.bone) this.gain('bone', y.bone);
      if (y.fat && B.fat) this.gain('fat', Math.max(1, Math.round(y.fat * B.fat)), { fresh });
      if (y.horn) this.gain('horn', y.horn);
      if (B.organs) this.gain('organ_meat', 1, { fresh });
      if (B.marrow) this.gain('marrow', 1, { fresh });
      if (node.data.arrows) this.gain(node.data.arrowItem || 'arrow_pro', Math.round(node.data.arrows * 0.8));
      P.body.s.hygiene = Math.max(0, P.body.s.hygiene - 8);
      P.bloodyHands = true;
      P.body.s.stamina = Math.max(0, P.body.s.stamina - 6);
      if (!P.firstKillDone) { P.firstKillDone = true; P.body.addMorale(-3, 'first_kill'); g.bus.emit('toast', { text: 'ごめん、いただきます', kind: 'info' }); }
      g.sys.fauna.removeCarcass(node.data.animal);
      g.sys.knowledge?.learn?.(sp.guide, 3, 'butchered');
      g.passTime(minutes, { heavy: true });
      if (g.clock.total - node.data.diedAt > 60 && !node.data.gutted) g.bus.emit('toast', { text: '内臓を 出すのが 遅れた。肉の 傷みが 早い', kind: 'warn' });
    });
  }

  takeSmallCarcass(node) {
    const g = this.game, sp = SPECIES[node.data.species];
    const ageH = (g.clock.total - node.data.diedAt) / 60;
    for (const [id, n] of Object.entries(sp.yield)) this.gain(id, n, { fresh: clamp(100 - ageH * 4, 0, 100), rng: g.rng });
    if (node.data.arrows) this.gain(node.data.arrowItem || 'arrow_pro', node.data.arrows);
    g.sys.knowledge?.learn?.(sp.guide, 3, 'caught');
    g.sys.fauna.removeCarcass(node.data.animal);
  }

  // ---------------------------------------------------------------- held tool
  heldInfo() {
    const P = this.game.sys.player, s = P.heldStack();
    if (!s) return { kind: 'none' };
    const d = itemDef(s.id, s);
    const kind = d?.tool?.kind || (d?.cat === 'weapon' ? 'weapon' : d?.food ? 'food' : 'item');
    return { kind, s, d, id: s.id };
  }

  onPrimary() {
    const g = this.game;
    if (g.paused || g.screens?.current) return;
    if (g.placement?.active) { g.placement.confirm(); return; }
    if (this.activity) return; // the activity reads clicks itself
    const h = this.heldInfo(), cb = g.sys.combat;
    const tgt = this.target;
    // tools that work on the target first (axe on a tree, knife on a vine …)
    if (tgt?.type === 'node' && (h.kind === 'axe' || h.kind === 'blade' || h.kind === 'knife')) {
      const want = tgt.options.find((o) => o.ok !== false && ['fell', 'cut', 'bark', 'pull'].includes(o.id));
      if (want) { this.run(tgt, want); return; }
    }
    if (tgt?.type === 'fire' && !tgt.fire.fire.lit && (h.kind === 'fire' || h.id === 'flint')) { const o = tgt.options.find((x) => x.id.startsWith('light:')); if (o) { this.run(tgt, o); return; } }
    switch (h.kind) {
      case 'gun': return this.fireRifle();
      case 'bow': return this.releaseArrow();
      case 'rod': return this.cast();
      case 'net': return this.throwNet();
      case 'spear': case 'harpoon': return this.thrust(h);
      case 'axe': case 'blade': case 'knife': case 'club': case 'weapon': {
        const power = h.s.stats?.melee ?? h.d?.tool?.melee ?? 8;
        g.viewmodel?.play('swing');
        g.sys.sfx?.play('chop_weak', { volume: 0.4 });
        cb.melee(1.7, power, 'melee');
        return;
      }
      default:
        if (h.d?.attrs?.heavy >= 4 && h.d?.attrs?.hard >= 6) { this.chargeT = performance.now(); return; } // a stone: throw on release
        if (tgt?.type === 'node' || tgt?.type === 'water') this.onInteract();
    }
  }

  onPrimaryUp() {
    const g = this.game;
    if (this.activity || g.paused) return;
    const h = this.heldInfo();
    if (this.chargeT && h.d?.attrs?.heavy >= 4) {
      const held = (performance.now() - this.chargeT) / 1000;
      this.chargeT = 0;
      this.throwItem(h, clamp(held / 0.8, 0.3, 1));
    }
  }

  onSecondary(down) {
    const g = this.game, cb = g.sys.combat, h = this.heldInfo();
    if (g.paused || g.screens?.current) return;
    if (g.placement?.active && down) { g.placement.cancel(); return; }
    cb.aiming = down && (h.kind === 'gun' || h.kind === 'bow' || h.kind === 'spear');
    if (h.kind === 'bow') { cb.drawing = down; if (!down && cb.draw > 0.25 && this.game.setup?.control !== 'gesture') { /* release on right-up = cancel */ cb.draw = 0; } if (down) g.sys.sfx?.play('bow_draw'); }
    if (h.kind === 'spear' && !down && cb.spearCharge) { this.throwItem(h, 1); }
    if (h.kind === 'spear') cb.spearCharge = down;
    g.renderer.camera.fov = down && h.kind === 'gun' ? 40 : 72;
    g.renderer.camera.updateProjectionMatrix();
  }

  fireRifle() {
    const g = this.game, P = g.sys.player, cb = g.sys.combat;
    if (cb.boltT > 0) return;
    const inf = g.setup?.ammo === 'inf';
    if (!inf && !P.inv.has('ammo')) { g.sys.sfx?.play('gun_empty'); g.bus.emit('toast', { text: '弾が ない', kind: 'warn' }); return; }
    if (!inf) P.inv.take('ammo', 1);
    const misfire = (P.inv.find('ammo')?.wet ?? 0) > 90 && g.rng.next() < 0.2;
    if (misfire) { g.sys.sfx?.play('gun_empty'); g.bus.emit('toast', { text: '不発！（弾が 濡れていた）', kind: 'warn' }); cb.boltT = 1.2; return; }
    const spread = cb.aiming ? cb.swayRadius() : cb.swayRadius() * 2.5;
    cb.launch('bullet', { v0: 800, power: 80, spread });
    g.viewmodel?.play('recoil');
    g.sys.sfx?.play('gunshot');
    g.bus.emit('noise', { x: g.player.pos.x, z: g.player.pos.z, radius: 400, kind: 'gunshot' });
    g.sys.fauna?.noise(g.player.pos.x, g.player.pos.z, 400, 'gunshot');
    g.sys.events?.signal?.('gunshots', { n: 1 });
    g.player.pitch += 0.03;
    cb.boltT = 1.2;
    setTimeout(() => g.sys.sfx?.play('gun_reload', { volume: 0.5 }), 500);
  }

  releaseArrow(drawPower = null) {
    const g = this.game, P = g.sys.player, cb = g.sys.combat, h = this.heldInfo();
    const draw = drawPower ?? cb.draw;
    if (draw < 0.2) { g.bus.emit('toast', { text: '右クリック（長押し）で 弓を 引いてから 放つ', kind: 'info' }); return; }
    const arrow = P.inv.find('arrow_pro') || P.inv.find('arrow');
    if (!arrow) { g.bus.emit('toast', { text: '矢が ない（矢を 作ろう）', kind: 'warn' }); cb.draw = 0; return; }
    const part = P.inv.take(arrow.uid, 1)[0];
    const pro = h.id === 'bow';
    const vmax = pro ? 55 : 34 + 10 * ((h.s.q ?? 50) - 40) / 40;
    const v0 = vmax * (0.36 + 0.64 * draw);
    const power = (h.s.stats?.power ?? h.d?.tool?.power ?? 30) * (0.4 + 0.6 * draw) * (part.id === 'arrow' && !(part.stats?.tip) ? 0.6 : 1);
    const spread = (part.id === 'arrow' && part.stats?.noFletch ? 1.2 : 0.4) + (cb.drawT > 3 ? 1.5 : 0);
    cb.launch('arrow', { v0, power, item: part, spread });
    g.viewmodel?.play('release');
    g.sys.sfx?.play('bow_release');
    g.bus.emit('noise', { x: g.player.pos.x, z: g.player.pos.z, radius: 15 });
    cb.draw = 0; cb.drawT = 0; cb.drawing = false;
    P.body.s.stamina = Math.max(0, P.body.s.stamina - 3);
    this.wearHeld(1);
  }

  thrust(h) {
    const g = this.game, cb = g.sys.combat;
    if (cb.spearCharge) { this.throwItem(h, 1); cb.spearCharge = false; return; }
    const power = h.s.stats?.power ?? h.d?.tool?.power ?? 12;
    g.viewmodel?.play('thrust');
    g.sys.sfx?.play('spear_thrust');
    const r = cb.melee(2.2, power, 'spear');
    // spear fishing in shallow water (§9.3, §22.5: aim below the fish — refraction)
    if (!r) this.spearFish(h);
    g.sys.player.body.s.stamina = Math.max(0, g.sys.player.body.s.stamina - 5);
  }

  spearFish(h) {
    const g = this.game, P = g.player, t = g.world.terrain;
    const x = P.pos.x + P.forward.x * 1.6, z = P.pos.z + P.forward.z * 1.6;
    const w = t.waterAt(x, z, P.seaLevel);
    if (!w.type || w.depth < 0.2) return;
    const pitchDown = -P.pitch;  // looking down into the water
    const aimLow = pitchDown > 0.45 ? 1 : 0.5;      // aiming below the fish image
    const deep = w.depth > 1 ? 0.6 : 1;
    const harpoon = /harpoon/.test(h.id) ? 1.3 : 1;
    const torchNight = g.sys.player.torchLit && g.world.env?.night > 0.5 ? 1.5 : 1;
    const p = 0.28 * aimLow * deep * harpoon * torchNight * (g.sys.events?.mod?.('fishBite') ?? 1);
    if (g.rng.next() < p) {
      const id = w.type === 'stream' || w.type === 'pond' ? 'goby' : g.rng.next() < 0.7 ? 'sardine' : 'jack';
      if (!/harpoon/.test(h.id) && g.rng.next() < 0.4) { g.bus.emit('toast', { text: '刺さったが 外れて 逃げた（かえしが ない）', kind: 'warn' }); return; }
      this.gain(id, 1, { fresh: 100, rng: g.rng });
      g.sys.player.stats.fishCaught++;
      g.sys.sfx?.play('fish_catch');
    } else if (pitchDown < 0.45) g.bus.emit('toast', { text: '水の 中の 魚は 見かけより 深い。魚の 下を ねらう', kind: 'info' });
  }

  throwItem(h, power) {
    const g = this.game, P = g.sys.player, cb = g.sys.combat;
    const one = P.inv.take(h.s.uid, 1)[0];
    P.validate();
    const spear = h.kind === 'spear';
    cb.launch(spear ? 'spear' : 'stone', { v0: (spear ? 16 : 20) * (0.5 + 0.5 * power), power: spear ? (h.s.stats?.power ?? 14) : 6, item: one, spread: 1 });
    g.viewmodel?.play('throw');
    g.sys.sfx?.play('spear_thrust');
  }

  // ---------------------------------------------------------------- fishing
  cast() {
    const g = this.game, P = g.sys.player, h = this.heldInfo();
    const fwd = g.player.forward;
    // find water within 4–20 m in front
    let spot = null, dist = 0;
    for (let d = 4; d <= 20; d += 2) {
      const x = g.player.pos.x + fwd.x * d, z = g.player.pos.z + fwd.z * d;
      const s = spotAt(g, x, z, d);
      if (s) { spot = s; dist = d; break; }
    }
    if (!spot) { g.bus.emit('toast', { text: '前に 水が ない（水辺で 竿を 振る）', kind: 'info' }); return; }
    const bait = P.inv.stacks.find((s) => isBait(s.id) && s.uid !== h.s.uid);
    const baitId = h.s.lure ? 'lure' : bait?.id === 'lure' ? 'lure' : bait?.id || null;
    const hook = h.id === 'rod' ? 'm' : h.s.stats?.hook || 's';
    const model = biteModel(g, { spot, bait: baitId, hook, fineLine: h.id === 'rod' || (h.s.stats?.fine ?? false), crouch: g.player.crouch, sunBehind: false, guideMul: (id) => ((g.sys.knowledge?.level?.(id) ?? 0) >= 3 ? 1.15 : 1) });
    if (!isFinite(model.meanSec)) { g.bus.emit('toast', { text: model.factors.reason || 'ここでは 釣れそうに ない', kind: 'warn' }); return; }
    const wait = -Math.log(1 - g.rng.next()) * model.meanSec;   // exponential waiting time
    const sp = pickSpecies(g.rng, model.weights);
    const F = FISH[sp] || FISH.sardine;
    const lineStrength = h.id === 'rod' ? 10 : (h.s.stats?.line ?? 4);
    const window = ({ s: 0.9, m: 0.7, l: 0.5 }[F.size] ?? 0.8) + (g.sys.knowledge?.level?.(sp) >= 2 ? 0.05 : 0);
    const spec = { kind: 'rod', title: '釣り', params: { biteMin: Math.max(2, wait * 0.85), biteMax: Math.max(3, wait * 1.15), window, fish: { pull: F.power / 60, stamina: F.stamina / 50 }, lineStrength: lineStrength * tensionCap(sp, lineStrength) } };
    this.fishing = { spot, sp, bait };
    this.startActivity(spec, (r) => {
      const ho = hookOutcome(sp, hook);
      P.body.s.stamina = Math.max(0, P.body.s.stamina - 3);
      if (r.ok && g.rng.next() < ho.escape) r = { ok: false, why: 'escaped' };
      if (bait && (r.ok || r.why === 'missed' || g.rng.next() < ho.nibbleOnly)) P.inv.take(bait.uid, 1);
      if (!r.ok) { g.bus.emit('toast', { text: { nofish: '何も かからなかった', missed: '合わせ そこねた…', snap: '糸が 切れた！', escaped: '逃げられた…' }[r.why] || '逃げられた', kind: 'warn' }); if (r.why === 'snap' && h.id === 'rod') P.inv.take('hook_pro', 1); return; }
      const item = F.item || 'fish_s';
      if (F.size === 'l' && !P.inv.find('hand_net') && g.rng.next() < 0.25) { g.bus.emit('toast', { text: '取り込みで 落とした！（タモが あれば…）', kind: 'bad' }); return; }
      this.gain(item, 1, { fresh: 100, rng: g.rng });
      P.stats.fishCaught++;
      if (F.size === 'l') { P.stats.bigFishCaught = (P.stats.bigFishCaught || 0) + 1; P.body.addMorale(6, 'big_catch'); }
      g.sys.fishing?.caught?.(spot);
      g.sys.knowledge?.learn?.(sp, 2, 'caught');
      g.sys.sfx?.play('fish_catch');
      g.bus.emit('toast', { text: `${F.name}が 釣れた！`, kind: 'good' });
      this.wearHeld(1);
    });
  }

  throwNet() {
    const g = this.game, P = g.sys.player, h = this.heldInfo(), t = g.world.terrain;
    const x = g.player.pos.x + g.player.forward.x * 5, z = g.player.pos.z + g.player.forward.z * 5;
    const w = t.waterAt(x, z, g.player.seaLevel);
    if (!w.type) { g.bus.emit('toast', { text: '前の 水に 向かって 投げる', kind: 'info' }); return; }
    const rocky = ['rocks', 'cliff'].includes(t.zoneAt(x, z)) || ['rocks', 'cliff'].includes(t.zoneAt(g.player.pos.x, g.player.pos.z));
    this.startActivity({ kind: 'net', title: '投網', params: { sink: 2.5, pulls: 6 } }, (r, a) => {
      const s = clamp(0.5 + (a.throwScore ?? 0.3), 0, 1);
      const res = netCatch(g, { s, radiusBase: h.id === 'net' ? 2 : (h.s.stats?.radius ?? 1.4), mesh: h.s.stats?.mesh ?? 1.5, depth: w.depth, rocky, round: true });
      if (r.slow) res.items = res.items.map(([id, n]) => [id, Math.round(n * 0.7)]);
      for (const [id, n] of res.items) if (n > 0) this.gain(id, n, { fresh: 100, rng: g.rng });
      const fish = res.items.filter(([id]) => FISH[id]).reduce((a2, [, n]) => a2 + n, 0);
      P.stats.fishCaught += fish;
      if (res.message) g.bus.emit('toast', { text: res.message, kind: res.snag ? 'bad' : 'info' });
      else g.bus.emit('toast', { text: `網に ${fish} 匹 かかった！`, kind: 'good' });
      if (res.stung) P.body.addCondition('sting', 1, 'クラゲ', { incubation: 0 });
      if (res.torn) this.wearHeld(10);
      P.body.s.wet = Math.max(P.body.s.wet, 40);
      P.body.s.stamina = Math.max(0, P.body.s.stamina - 8);
      g.passTime(10);
      this.wearHeld(1);
    });
  }

  // ---------------------------------------------------------------- activities
  startActivity(spec, onDone) {
    const g = this.game;
    const gesture = !!g.hands?.ready;
    const ctx = {
      gesture,
      onHit: () => { g.viewmodel?.play('swing'); g.sys.sfx?.play(this.activity?.sound || 'chop'); g.sys.player.heavyT = 3; },
      onTick: () => {},
      onCast: () => { g.viewmodel?.play('cast'); g.sys.sfx?.play('cast'); },
      onBite: () => { g.sys.sfx?.play('bite'); navigator.vibrate?.(80); },
      onHook: () => g.sys.sfx?.play('reel'),
      onReel: () => { g.viewmodel?.play('reel'); g.sys.sfx?.play('reel', { volume: 0.5 }); },
      onEarly: () => g.bus.emit('toast', { text: '早すぎた', kind: 'warn' }),
      onThrow: (a) => { a.throwScore = 0.3 + Math.random() * 0.2; g.viewmodel?.play('throw'); g.sys.sfx?.play('net_throw'); },
      onPull: () => { g.viewmodel?.play('pick'); g.sys.sfx?.play('net_pull', { volume: 0.5 }); },
      onRub: () => { g.viewmodel?.play('rub'); g.sys.sfx?.play('rub', { volume: 0.5 }); },
      onEmber: () => g.bus.emit('toast', { text: '黒い 粉が 赤く なった！ 火口に 移して 吹く', kind: 'good' }),
      onSpark: () => { g.viewmodel?.play('strike'); g.sys.sfx?.play('flint'); },
    };
    const a = createActivity({ ...spec, onDone: (r, act) => { this.activity = null; g.activity = null; if (r?.ok !== false || spec.kind === 'rod' || spec.kind === 'friction' || spec.kind === 'spark') onDone?.(r || {}, act); }, onCancel: () => { this.activity = null; g.activity = null; } }, ctx);
    this.activity = a;
    this.click = false; this.release = false;
    return a;
  }

  cancelActivity() { if (this.activity) { this.activity.cancel(); this.activity = null; this.game.activity = null; } }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game;
    if (g.paused) return;
    // gesture events of this frame
    const ev = g.hands?.ready ? (g.hands.events || []) : [];
    if (this.activity) {
      const a = this.activity;
      const keys = { Space: g.input.keys.has('Space') };
      a.update(dt, { click: this.click, hold: g.input.mouse.left, release: this.release, holdE: this.holdE, axisX: this.mouseDX, gestures: ev, keyAlt: this.altKey > 0, keys });
      this.altKey = 0;
      g.activity = this.activity ? { label: a.label, progress: a.progress, bar2: a.bar2, hint: a.hint, phase: a.phase } : null;
      // walking away cancels (except fishing / net where you stand still anyway)
      if (this.activity && g.player.moveInfo.moving && g.player.moveInfo.dist > 0.05 && !['rod', 'net'].includes(a.spec.kind)) this.cancelActivity();
      if (g.input.keys.has('Escape')) this.cancelActivity();
    } else {
      g.activity = null;
      this.gestureActions(ev);
    }
    this.click = false; this.release = false; this.mouseDX = 0;
    // bow draw with the right button (1.2 s to full), or the hands
    const cb = g.sys.combat, h = this.heldInfo();
    if (h.kind === 'bow') {
      if (g.hands?.ready && g.hands.motion.state.draw > 0) cb.draw = g.hands.motion.state.draw;
      else if (cb.drawing) cb.draw = Math.min(1, cb.draw + dt / 1.2);
      cb.drawT = cb.draw >= 1 ? cb.drawT + dt : 0;
      if (cb.drawT > 3) g.sys.player.body.s.stamina = Math.max(0, g.sys.player.body.s.stamina - 3 * dt);
      g.viewmodel && (g.viewmodel.draw = cb.draw);
    }
    // the target and the prompt
    this.target = g.placement?.active ? null : this.findTarget();
    if (this.target && this.optIndex >= this.target.options.length) this.optIndex = 0;
    if (!this.target) this.optIndex = 0;
    const o = this.target?.options[this.optIndex];
    g.prompt = g.placement?.active ? { key: 'E', text: '置く', sub: 'ホイールで 回す・右クリックで やめる' }
      : o ? { key: 'E', text: o.label, sub: o.ok === false ? o.reason : this.target.options.length > 1 ? `ホイールで 切りかえ（${this.optIndex + 1}/${this.target.options.length}）` : '' } : null;
  }

  /** gestures outside an activity start the matching action (§9.3) */
  gestureActions(ev) {
    if (!ev.length) return;
    const g = this.game, h = this.heldInfo(), t = this.target;
    for (const e of ev) {
      if (e.type === 'shoot' && h.kind === 'gun') { g.sys.combat.aiming = true; this.fireRifle(); }
      else if (e.type === 'loose' && h.kind === 'bow') this.releaseArrow(e.power);
      else if (e.type === 'swing' && e.dir === 'down' && h.kind === 'rod') this.cast();
      else if ((e.type === 'throw' || e.type === 'push') && h.kind === 'net') this.throwNet();
      else if (e.type === 'push' && (h.kind === 'spear' || h.kind === 'harpoon')) this.thrust(h);
      else if (e.type === 'wave') g.sys.companion?.call?.();
      else if (t && (e.type === 'pinch' || e.type === 'grab' || (e.type === 'swing' && e.pose === 'fist') || (e.type === 'strike' && t.type === 'fire') || (e.type === 'rub' && t.type === 'fire'))) {
        const opt = t.options[this.optIndex] || t.options[0];
        if (opt && opt.ok !== false) { this.run(t, opt); this.activity?.update(0, { gestures: [e], click: false, hold: false, release: false, axisX: 0, keys: {} }); }
      }
      if (this.activity) break;
    }
  }
}

function P(g) { return g.sys.player; }
export function cookStageName(done = 0) { return done < 30 ? '生' : done < 65 ? '半生' : done <= 100 ? 'よく 焼けた' : done <= 130 ? '焦げ' : '炭'; }
