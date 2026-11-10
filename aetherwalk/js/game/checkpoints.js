// js/game/checkpoints.js — 風見の灯 waylights (fire, cook, rest, respawn), braziers, and where you wake up (§5.6) (OPUS-B)
import * as THREE from 'three';
import { heightAt, fx, flash, emit, toast, spawnList, findProp, propsOf, setPropState, anchorOf, playerPos, landmark } from './util.js';

export function createCheckpoints(ctx, G) {
  const lights = [];        // waylights
  const braziers = [];      // generic braziers (shrines may reserve some)
  const _p = new THREE.Vector3(), _a = new THREE.Vector3();
  const _zones = [];
  let tickT = 0;

  const C = {
    lights, braziers,
    current: 'start',
    load() {
      lights.length = 0;
      for (const w of spawnList(ctx, 'waylights')) {
        const prop = findProp(ctx, 'waylight', w.id, w.x, w.z, 6);
        const lm = landmark(ctx, w.id);
        lights.push({ id: w.id, x: w.x, z: w.z, prop, lit: false, zone: null, cook: null, nearT: 0,
          name: (lm && lm.name) || '風見の灯', firePos: new THREE.Vector3(), cookPos: new THREE.Vector3() });
      }
      braziers.length = 0;
      for (const prop of propsOf(ctx, 'brazier')) {
        braziers.push({ id: prop.id, prop, lit: false, zone: null, reserved: false, firePos: new THREE.Vector3(), x: prop.x, z: prop.z });
      }
    },
    light(entry, silent = false) {
      if (!entry || entry.lit) return;
      entry.lit = true;
      setPropState(entry.prop, 'lit', true);
      anchorOf(entry.prop, 'fire', entry.firePos);
      if (!entry.prop) entry.firePos.set(entry.x, heightAt(ctx, entry.x, entry.z) + 0.5, entry.z);
      entry.cookPos.copy(entry.firePos).setY(entry.firePos.y + 0.5);
      const Z = ctx.zones;
      if (Z && typeof Z.add === 'function') {
        try {
          entry.zone = Z.add({ kind: 'fire', pos: entry.firePos, r: 0.55, owner: 'game', data: { id: entry.id } });
          entry.cook = Z.add({ kind: 'cook', pos: entry.cookPos, r: 0.45, owner: 'game', data: { id: entry.id } });
        } catch (e) { /* ignore */ }
      }
      G.quest && (G.quest.props[entry.id] = { ...(G.quest.props[entry.id] || {}), lit: true });
      if (!silent) {
        emit(ctx, 'fire:lit', { id: entry.id, pos: entry.firePos });
        fx(ctx, 'ember', entry.firePos, { count: 30, speed: 2 });
        flash(ctx, entry.firePos, { color: 0xffb347, size: 3, life: 0.5 });
        toast(ctx, `${entry.name}に火が灯った`, 'WAYLIGHT LIT · 復活地点', 'quest', 3500);
        C.setCheckpoint(entry.id);
      }
    },
    lightBrazier(b, silent = false) {
      if (!b || b.lit) return;
      b.lit = true;
      setPropState(b.prop, 'lit', true);
      anchorOf(b.prop, 'fire', b.firePos);
      const Z = ctx.zones;
      if (Z && typeof Z.add === 'function' && !b.zone) { try { b.zone = Z.add({ kind: 'fire', pos: b.firePos, r: 0.4, owner: 'game', data: { id: b.id } }); } catch (e) { /* ignore */ } }
      if (!silent) { emit(ctx, 'fire:lit', { id: b.id, pos: b.firePos }); fx(ctx, 'ember', b.firePos, { count: 16, speed: 1.5 }); }
    },
    douseBrazier(b) {
      if (!b || !b.lit) return;
      b.lit = false;
      setPropState(b.prop, 'lit', false);
      if (b.zone) { try { ctx.zones.remove(b.zone); } catch (e) { /* ignore */ } b.zone = null; }
      emit(ctx, 'fire:out', { id: b.id, pos: b.firePos });
      fx(ctx, 'smoke', b.firePos, { count: 8 });
    },
    byId(id) { return lights.find((l) => l.id === id) || null; },
    nearLit(maxD = 5) {
      playerPos(ctx, _p);
      let best = null, bd = maxD;
      for (const l of lights) {
        if (!l.lit) continue;
        const d = Math.hypot(_p.x - l.x, _p.z - l.z);
        if (d < bd) { bd = d; best = l; }
      }
      return best;
    },
    setCheckpoint(id) {
      if (!id || C.current === id) return;
      C.current = id;
      G.checkpoint = id;
      emit(ctx, 'checkpoint', { id });
      G.requestSave && G.requestSave(true);
    },
    /** where to wake up for checkpoint id → { x, z, yaw } */
    spawnFor(id) {
      const l = C.byId(id);
      if (l) {
        if (l.prop && l.prop.anchors && l.prop.anchors.seat) {
          const s = l.prop.anchors.seat;
          return { x: s.x, z: s.z, yaw: Math.atan2(l.x - s.x, -(l.z - s.z)) * 180 / Math.PI };
        }
        return { x: l.x + 2.2, z: l.z + 1.2, yaw: 300 };
      }
      const tw = G.towers && G.towers.byId(id);
      if (tw) {
        return { x: tw.x + Math.sin(tw.doorYaw) * 6, z: tw.z - Math.cos(tw.doorYaw) * 6, yaw: (tw.doorYaw * 180 / Math.PI + 180) % 360 };
      }
      const sp = ctx.world && ctx.world.spawnPoints && ctx.world.spawnPoints.player;
      if (sp) return { x: sp.x, z: sp.z, yaw: sp.yaw || 0 };
      const st = landmark(ctx, 'start');
      if (st) return { x: st.x, z: st.z, yaw: 0 };
      return { x: 0, z: 540, yaw: 0 };
    },
    restoreFrom(props) {
      for (const l of lights) if (props[l.id] && props[l.id].lit) C.light(l, true);
      for (const b of braziers) if (props[b.id] && props[b.id].lit && !b.reserved) C.lightBrazier(b, true);
    },
    update,
  };

  function foreignFire(pos, r) {
    const Z = ctx.zones;
    if (!Z || typeof Z.query !== 'function') return false;
    _zones.length = 0;
    try { Z.query('fire', pos, r, _zones); } catch (e) { return false; }
    // any fire that is not one of our own fixed fires (torch, fire arrow, a burning enemy, a shrine flame)
    for (const z of _zones) if (z.owner !== 'game') return true;
    return false;
  }

  function update(dt) {
    if (dt <= 0) return;
    tickT -= dt;
    if (tickT > 0) return;
    tickT = 0.2;
    playerPos(ctx, _p);
    const stage = G.quest ? G.quest.stage : 9;
    for (const l of lights) {
      const d = Math.hypot(_p.x - l.x, _p.z - l.z);
      if (d > 30) { l.nearT = 0; continue; }
      if (!l.lit) {
        // a torch (or any carried fire) touching the fire bowl lights it
        anchorOf(l.prop, 'fire', _a);
        if (!l.prop) _a.set(l.x, heightAt(ctx, l.x, l.z) + 0.5, l.z);
        if (foreignFire(_a, 0.6)) { C.light(l); continue; }
        // the other camps catch the wind when you stand by them (the first one is the torch lesson)
        const tutorial = l.id === 'camp_meadow' && stage <= 1;
        if (!tutorial && d < 3.2) { l.nearT += 0.2; if (l.nearT > 1.5) C.light(l); }
        else l.nearT = 0;
      } else if (d < 4.5) {
        C.setCheckpoint(l.id);
      }
    }
    for (const b of braziers) {
      if (b.lit || b.reserved) continue;
      if (Math.hypot(_p.x - b.x, _p.z - b.z) > 25) continue;
      anchorOf(b.prop, 'fire', _a);
      if (foreignFire(_a, 0.45)) { C.lightBrazier(b); G.quest && (G.quest.props[b.id] = { lit: true }); }
    }
  }
  return C;
}
