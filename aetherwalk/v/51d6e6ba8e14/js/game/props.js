// js/game/props.js — logic for the world's simple mechanisms (§10.7 Prop): training dummy, crack rocks,
// thorn vines, ice blocks, the sword pedestal and the light bridge. Visuals are FABLE's (prop.setState). (OPUS-B)
import * as THREE from 'three';
import { fx, emit, propsOf, setPropState, anchorOf, playerPos } from './util.js';

export function createProps(ctx, G) {
  const dummies = [], cracks = [], vines = [], ices = [];
  let pedestal = null, bridge = null, tickT = 0;
  const _p = new THREE.Vector3(), _zones = [];

  const P = {
    dummies, cracks, vines, ices,
    get pedestal() { return pedestal; },
    get bridge() { return bridge; },
    load() {
      for (const arr of [dummies, cracks]) for (const o of arr) removeTarget(o);
      dummies.length = cracks.length = vines.length = ices.length = 0;
      for (const prop of propsOf(ctx, 'dummy')) {
        const o = { prop, c: anchorOf(prop, 'center', new THREE.Vector3()), target: null, hits: 0 };
        if (!prop.anchors || !prop.anchors.center) o.c.y += 1.1;
        o.target = addTarget('dummy:' + prop.id, 'dummy', o.c, 0.38, (h) => {
          o.hits++;
          setPropState(prop, 'hit', o.hits);
          fx(ctx, 'leaf', h.point || o.c, { count: 6, speed: 2 });
          emit(ctx, 'dummy:hit', { id: prop.id, hits: o.hits, speed: h.speed });
          return { applied: h.damage || 0, killed: false };
        }, o);
        dummies.push(o);
      }
      for (const prop of propsOf(ctx, 'crackrock')) {
        const o = { prop, c: anchorOf(prop, 'center', new THREE.Vector3()), target: null };
        if (!(prop.state && prop.state.broken)) {
          o.target = addTarget('crack:' + prop.id, 'prop', o.c, Math.max(0.6, prop.r || 1), (h) => {
            const strong = h.type === 'blast' || (h.speed != null && h.speed >= 4.5 && (h.type === 'blunt' || h.type === 'slash' || h.type === 'thrust'));
            fx(ctx, 'spark', h.point || o.c, { count: strong ? 4 : 6, color: 0xfffbe8 });
            if (strong) breakRock(o);
            return { applied: 0, killed: strong, blocked: !strong };
          }, o);
        }
        cracks.push(o);
      }
      for (const prop of propsOf(ctx, 'thornvine')) vines.push({ prop, c: anchorOf(prop, 'center', new THREE.Vector3()) });
      for (const prop of propsOf(ctx, 'iceblock')) ices.push({ prop, c: anchorOf(prop, 'center', new THREE.Vector3()), heat: 0 });
      pedestal = propsOf(ctx, 'pedestal')[0] || null;
      bridge = propsOf(ctx, 'lightbridge')[0] || null;
    },
    breakRock(id) { const o = cracks.find((c) => c.prop.id === id); if (o) breakRock(o); },
    setBridge(on) { if (bridge) setPropState(bridge, 'on', !!on); },
    restoreFrom(props) {
      for (const o of cracks) if (props[o.prop.id] && props[o.prop.id].broken) breakRock(o, true);
      for (const o of vines) if (props[o.prop.id] && props[o.prop.id].burnt) setPropState(o.prop, 'burnt', true);
      for (const o of ices) if (props[o.prop.id] && props[o.prop.id].melted) setPropState(o.prop, 'melted', true);
      if (pedestal && props[pedestal.id] && props[pedestal.id].taken) setPropState(pedestal, 'taken', true);
    },
    update,
  };

  function addTarget(id, kind, c, r, onHit, owner) {
    const T = ctx.targets;
    if (!T || typeof T.add !== 'function') return null;
    try { return T.add({ id, kind, spheres: [{ c, r, part: 'body' }], owner, onHit }); } catch (e) { return null; }
  }
  function removeTarget(o) {
    if (o.target && ctx.targets) { try { ctx.targets.remove(o.target); } catch (e) { /* ignore */ } }
    o.target = null;
  }
  function remember(prop, key) {
    if (!G.quest) return;
    G.quest.props[prop.id] = { ...(G.quest.props[prop.id] || {}), [key]: true };
  }
  function breakRock(o, silent) {
    if (o.prop.state && o.prop.state.broken && !silent) return;
    setPropState(o.prop, 'broken', true);
    removeTarget(o);
    remember(o.prop, 'broken');
    if (!silent) { fx(ctx, 'dust', o.c, { count: 30, speed: 3 }); emit(ctx, 'prop:break', { id: o.prop.id }); }
  }

  function fireNear(pos, r) {
    const Z = ctx.zones;
    if (!Z || typeof Z.query !== 'function') return false;
    _zones.length = 0;
    try { Z.query('fire', pos, r, _zones); } catch (e) { return false; }
    return _zones.length > 0;
  }

  function update(dt) {
    if (dt <= 0) return;
    tickT -= dt;
    if (tickT > 0) return;
    tickT = 0.2;
    playerPos(ctx, _p);
    for (const o of vines) {
      if (o.prop.state && o.prop.state.burnt) continue;
      if (Math.hypot(o.c.x - _p.x, o.c.z - _p.z) > 20) continue;
      if (fireNear(o.c, Math.max(0.8, o.prop.r || 1))) {
        setPropState(o.prop, 'burnt', true); remember(o.prop, 'burnt');
        fx(ctx, 'ember', o.c, { count: 30, speed: 2 }); fx(ctx, 'smoke', o.c, { count: 12 });
        emit(ctx, 'prop:burn', { id: o.prop.id });
      }
    }
    for (const o of ices) {
      if (o.prop.state && o.prop.state.melted) continue;
      if (Math.hypot(o.c.x - _p.x, o.c.z - _p.z) > 20) continue;
      if (fireNear(o.c, Math.max(0.8, o.prop.r || 1))) {
        o.heat += 0.2;
        if (o.heat > 1.0) {
          setPropState(o.prop, 'melted', true); remember(o.prop, 'melted');
          fx(ctx, 'splash', o.c, { count: 20, speed: 2 }); fx(ctx, 'smoke', o.c, { count: 10, color: 0xffffff });
          emit(ctx, 'prop:melt', { id: o.prop.id });
        }
      }
    }
  }

  // bombs break crack rocks they reach (§4.2)
  ctx.events?.on?.('explosion', (e) => {
    if (!e || !e.pos) return;
    for (const o of cracks) {
      if (o.prop.state && o.prop.state.broken) continue;
      if (o.c.distanceTo(e.pos) < (e.radius || 4) + (o.prop.r || 1)) breakRock(o);
    }
  });
  return P;
}
