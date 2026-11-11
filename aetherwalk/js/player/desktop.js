// js/player/desktop.js — PC preview controls (§3.3), OPUS-A. Keyboard and mouse only ever drive
// ctx.input.virtual (look, cadence, duck, lean, hand targets, swings, buttons), so the PC preview runs the
// same step / grab / holster / item code as VR. Multi-step actions (draw from a holster, stow, eat, draw the
// bow) are short scripted hand motions.
import * as THREE from 'three';
import { SLOT_IDS } from '../core/config.js';
const HANDS = ['left', 'right'];

const _m = new THREE.Vector3(), _t = new THREE.Vector3();

export function createDesktop(ctx, P, holsters) {
  const input = ctx.input;
  const V = input.virtual;
  const canvas = ctx.renderer.domElement;
  let enabled = false;
  const keys = new Set();
  let swingIdx = 0;
  const SW = ['slashH', 'slashV', 'thrust'];
  const mouse = { left: false, right: false, moved: 0, ox: 0, oy: 0 };
  const targetFn = { left: null, right: null };
  const waits = [];
  let busy = { left: false, right: false };
  let bowSeq = null;
  const S = (hand) => (hand === 'left' ? 'L' : 'R');
  const other = (h) => (h === 'left' ? 'right' : 'left');

  // ── frame hook: hand targets that follow moving points, waits ──
  let lastLock = false;
  ctx.loop?.addHook?.('desktop', () => {
    // pointerlockchange isn't always delivered (embedded / headless): keep the hint classes in step
    const lk = enabled && document.pointerLockElement === canvas;
    if (lk !== lastLock) { lastLock = lk; onLock(); }
    for (const hand of HANDS) if (targetFn[hand]) V.setHandTarget(hand, targetFn[hand]());
    const now = ctx.clock.time;
    for (let i = waits.length - 1; i >= 0; i--) if (now >= waits[i].t && ctx.clock.frame >= waits[i].f) { waits[i].r(); waits.splice(i, 1); }
  }, 'pre');
  const wait = (sec) => new Promise((r) => waits.push({ t: ctx.clock.time + sec, f: ctx.clock.frame + 2, r }));
  const reach = (hand, fn) => { targetFn[hand] = fn; if (!fn) V.setHandTarget(hand, null); };

  function mouth(out) {
    return out.set(0, -0.07, -0.07).applyQuaternion(input.head.quat).add(input.head.pos);
  }

  // ── actions ──
  function preferredSlot(inst) {
    const d = inst.def || {};
    if (inst.id === 'arrow') return 'quiver';
    if (d.cat === 'food') return 'chest';
    if (d.cat === 'throwable') return 'belt';
    const inv = ctx.game && !ctx.game.isStub ? ctx.game.inventory : null;
    if (inv) for (const s of SLOT_IDS) if (inv.slots?.[s] === inst.id) return s;
    const list = d.slots && d.slots.length ? d.slots : ['hipR'];
    if (inv) for (const s of list) if (!inv.slots?.[s]) return s;
    return list[0];
  }

  async function stowHeld(hand) {
    const inst = ctx.items?.held?.[hand];
    if (!inst) return;
    busy[hand] = true;
    let slot = preferredSlot(inst);
    if (slot === 'quiver') slot = hand === 'left' ? 'backL' : 'backR';
    reach(hand, () => holsters.slotPos(slot, _t));
    await wait(0.35);
    V.hold('grip' + S(hand), true);
    await wait(0.05);
    V.hold('grip' + S(hand), false);
    await wait(0.08);
    reach(hand, null);
    busy[hand] = false;
  }

  async function drawSlot(slot, hand = 'right') {
    if (busy[hand]) return;
    if (ctx.items?.held?.[hand]) await stowHeld(hand);
    busy[hand] = true;
    reach(hand, () => holsters.slotPos(slot, _t));
    await wait(0.35);
    V.hold('grip' + S(hand), true);
    await wait(0.12);
    if (!ctx.items?.held?.[hand]) V.hold('grip' + S(hand), false);
    reach(hand, null);
    busy[hand] = false;
  }

  async function grabNearest(hand = 'right') {
    if (busy[hand]) return;
    const items = ctx.items;
    if (!items || items.isStub) return;
    if (items.held[hand]) return stowHeld(hand);
    busy[hand] = true;
    // something on the ground near the feet / in front within reach → reach for it; else pull what we look at
    const near = items.nearestGrabbable(input.head.pos, 1.5, true);
    if (near) {
      // things on the ground: crouch a little and stretch (desktop only)
      const low = near.pos.y < input.head.pos.y - 1.0;
      if (low) { V.setDuck(true); V.setReach(1.35); }
      reach(hand, () => near.pos);
      await wait(low ? 0.55 : 0.4);
    }
    V.hold('grip' + S(hand), true);
    await wait(0.15);
    reach(hand, null);
    V.setReach(0.78);
    if (!keys.has('KeyC')) V.setDuck(false);
    // a pull takes a moment
    for (let i = 0; i < 6 && items.pulling?.[hand]; i++) await wait(0.1);
    if (!items.held[hand]) V.hold('grip' + S(hand), false);
    busy[hand] = false;
  }

  async function throwHeld(hand = 'right') {
    const inst = ctx.items?.held?.[hand];
    if (!inst || busy[hand]) return;
    V.hold('grip' + S(hand), true);       // a sticky (equipped) item needs a press to have a release
    V.swing(hand, 'throw');
  }

  async function toMouth(hand = 'right', sec = 1.3, pose = 'eat') {
    if (busy[hand]) return;
    busy[hand] = true;
    V.setHandPose(hand, pose);
    reach(hand, () => {
      mouth(_m);
      if (pose === 'drink') {
        // the flask's neck (-Z of the grip, ~0.12 m) should reach the lips
        const h = input.hands[hand];
        _t.set(0, 0, -0.13).applyQuaternion(h.quat);
        return _m.sub(_t);
      }
      return _m.addScaledVector(_t.set(0, 0, -1).applyQuaternion(input.head.quat), 0.03);
    });
    await wait(sec);
    reach(hand, null);
    V.setHandPose(hand, 'rest');
    busy[hand] = false;
  }

  function useHeld() {
    const items = ctx.items;
    const hand = items?.held?.right ? 'right' : items?.held?.left ? 'left' : null;
    if (!hand) { V.press('x', 120); return; }      // waybell button
    const inst = items.held[hand];
    const d = inst.def || {};
    if (d.cat === 'food') return toMouth(hand, 1.4, 'eat');
    switch (d.use) {
      case 'flask': return toMouth(hand, 1.0, 'drink');
      case 'fuse': V.press('trigger' + S(hand), 150); return;
      case 'fan': V.swing(hand, 'fan'); return;
      case 'bell': V.swing(hand, 'shake'); return;
      case 'bow': startBow(); return;
      default: V.swing(hand, 'slashH');
    }
  }

  // ── bow: hold the bow out, take an arrow over the shoulder, nock, draw while the button is held ──
  async function startBow() {
    const items = ctx.items;
    const bowHand = items?.held?.left?.id === 'bow' ? 'left' : items?.held?.right?.id === 'bow' ? 'right' : null;
    if (!bowHand || bowSeq) return false;
    const drawHand = other(bowHand);
    const seq = bowSeq = { held: true };
    V.setHandPose(bowHand, 'bow');
    const h = items.held[drawHand];
    if (h && h.id !== 'arrow') await stowHeld(drawHand);
    if (!items.held[drawHand]) {
      const slot = drawHand === 'left' ? 'backL' : 'backR';
      reach(drawHand, () => holsters.slotPos(slot, _t));
      await wait(0.3);
      V.hold('grip' + S(drawHand), true);
      await wait(0.12);
    }
    if (!items.held[drawHand] || items.held[drawHand].id !== 'arrow') {
      V.hold('grip' + S(drawHand), false); reach(drawHand, null); bowSeq = null; V.setHandPose(bowHand, 'rest'); return false;
    }
    V.setHandPose(drawHand, 'draw');
    const info = () => items.bowInfo?.(bowHand);
    reach(drawHand, () => { const b = info(); return b ? b.nock : input.hands[bowHand].pos; });
    await wait(0.3);
    const t0 = ctx.clock.time;
    reach(drawHand, () => {
      const b = info();
      if (!b) return input.hands[drawHand].pos;
      const k = Math.min(1, (ctx.clock.time - t0) / 0.6);
      return _t.copy(b.nock).addScaledVector(b.dir, -0.62 * k);
    });
    while (seq.held) await wait(0.05);
    await wait(Math.max(0, 0.65 - (ctx.clock.time - t0)));
    V.hold('grip' + S(drawHand), false);
    await wait(0.1);
    reach(drawHand, null);
    V.setHandPose(drawHand, 'rest');
    V.setHandPose(bowHand, 'rest');
    bowSeq = null;
    return true;
  }
  function endBow() { if (bowSeq) bowSeq.held = false; }

  // ── input events ──
  function cadence() {
    const walk = keys.has('KeyW') || keys.has('KeyS');
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const ctrl = keys.has('ControlLeft') || keys.has('ControlRight');
    V.setCadence(!walk ? 0 : keys.has('KeyS') ? 100 : shift && ctrl ? 185 : shift ? 150 : 100);
    V.setStick('left', 0, keys.has('KeyS') && !keys.has('KeyW') ? -1 : 0);
  }
  const slotKeys = { Digit1: 'backR', Digit2: 'backL', Digit3: 'hipR', Digit4: 'hipL', Digit5: 'chest', Digit6: 'belt' };
  let leanTimer = 0;
  function onKeyDown(e) {
    if (!enabled || e.repeat && !/^Key[WS]$|Shift|Control/.test(e.code)) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    keys.add(e.code);
    switch (e.code) {
      case 'KeyW': case 'KeyS': case 'ShiftLeft': case 'ShiftRight': case 'ControlLeft': case 'ControlRight': cadence(); break;
      case 'KeyA': P.turn(-ctx.settings.get('snapAngle')); break;
      case 'KeyD': P.turn(ctx.settings.get('snapAngle')); break;
      case 'KeyC': V.setDuck(true); break;
      case 'KeyZ': case 'KeyX':
        V.setLean(e.code === 'KeyZ' ? -1 : 1);
        clearTimeout(leanTimer); leanTimer = setTimeout(() => V.setLean(0), 600); break;
      case 'KeyG': V.spreadArms(!V.state.spread); break;
      case 'KeyE': grabNearest('right'); break;
      case 'KeyQ': throwHeld('right'); break;
      case 'KeyF': useHeld(); break;
      case 'KeyH': { const on = !document.body.classList.contains('aw-nohud'); window.AW?.debug?.hud?.(!on); break; }
      case 'KeyP': ctx.setPaused(!ctx.paused, 'user'); break;
      case 'KeyR': P.recenter(); break;
      case 'BracketLeft': ctx.world?.setTimeOfDay?.((ctx.world.time + 23) % 24); break;
      case 'BracketRight': ctx.world?.setTimeOfDay?.((ctx.world.time + 1) % 24); break;
      case 'Tab': case 'KeyM': {
        e.preventDefault();
        const ui = ctx.ui;
        if (ui?.menuOpen) ui.closeMenu?.(); else ui?.openMenu?.(e.code === 'KeyM' ? 'map' : 'bag');
        break;
      }
      default:
        if (slotKeys[e.code]) drawSlot(slotKeys[e.code], 'right');
    }
    if (/^(Tab|Space|Digit\d|Key[WASD])$/.test(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    if (!enabled) return;
    if (/^(KeyW|KeyS|Shift|Control)/.test(e.code)) cadence();
    if (e.code === 'KeyC') V.setDuck(false);
  }
  function onMouseMove(e) {
    if (!enabled) return;
    const locked = document.pointerLockElement === canvas;
    if (mouse.left && locked) {
      // drag: the right hand follows the mouse in front of you
      mouse.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      mouse.ox = Math.max(-0.5, Math.min(0.5, mouse.ox + e.movementX * 0.0022));
      mouse.oy = Math.max(-0.4, Math.min(0.45, mouse.oy - e.movementY * 0.0022));
      if (mouse.moved > 6) V.setHandOffset('right', mouse.ox, mouse.oy);
      return;
    }
    if (locked) V.addLook(e.movementX * 0.12, -e.movementY * 0.12);
  }
  function onMouseDown(e) {
    if (!enabled) return;
    if (document.pointerLockElement !== canvas) {
      clickedOnce = true;
      onLock();
      try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* not allowed here */ }
      return;
    }
    if (e.button === 0) { mouse.left = true; mouse.moved = 0; mouse.ox = 0; mouse.oy = 0; }
    if (e.button === 2) {
      mouse.right = true;
      if (!startBowIfAny()) {
        V.setGuard('left', true);
        // a short push forward = parry window
        V.setHandOffset('left', 0, 0.05);
        setTimeout(() => V.setHandOffset('left', 0, 0), 120);
      }
    }
  }
  function startBowIfAny() {
    const it = ctx.items?.held;
    if (it?.left?.id === 'bow' || it?.right?.id === 'bow') { startBow(); return true; }
    return false;
  }
  function onMouseUp(e) {
    if (!enabled) return;
    if (e.button === 0 && mouse.left) {
      mouse.left = false;
      if (mouse.moved <= 6) { V.swing('right', SW[swingIdx]); swingIdx = (swingIdx + 1) % SW.length; }
      V.setHandOffset('right', 0, 0);
    }
    if (e.button === 2) { mouse.right = false; V.setGuard('left', false); endBow(); }
  }
  // the big "click to play" hint shows only until the first click; after Esc a small "click to resume"
  let clickedOnce = false;
  function onLock() {
    const locked = document.pointerLockElement === canvas;
    const cl = document.body.classList;
    cl.toggle('locked', enabled && locked);
    cl.toggle('unlocked', enabled && !locked && !clickedOnce);
    cl.toggle('relock', enabled && !locked && clickedOnce);
  }
  const onCtx = (e) => { if (enabled) e.preventDefault(); };
  const onBlur = () => { keys.clear(); if (enabled) cadence(); V.setDuck(false); };

  function enable(b) {
    if (b === enabled) return;
    enabled = b;
    const add = b ? 'addEventListener' : 'removeEventListener';
    window[add]('keydown', onKeyDown);
    window[add]('keyup', onKeyUp);
    window[add]('blur', onBlur);
    document[add]('mousemove', onMouseMove);
    canvas[add]('mousedown', onMouseDown);
    document[add]('mouseup', onMouseUp);
    document[add]('pointerlockchange', onLock);
    canvas[add]('contextmenu', onCtx);
    if (!b) { keys.clear(); V.setCadence(0); V.setStick('left', 0, 0); }
    onLock();
  }

  return {
    enable, get enabled() { return enabled; },
    stowHeld, drawSlot, grabNearest, throwHeld, toMouth, useHeld, startBow, endBow,
    reach,
  };
}
