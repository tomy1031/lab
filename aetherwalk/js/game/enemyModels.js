// js/game/enemyModels.js — low-poly, flat-shaded Nagi creatures made in code (OPUS-B).
// Each model: ≤ 3 meshes (shell body, moving shell part, glowing core/eyes) and < 1500 triangles.
// Model forward is local −Z (yaw 0 = north). Blob shadows are drawn by enemies.js as one InstancedMesh.
import * as THREE from 'three';
import { mergeGeos, paint, paintY, xform } from './util.js';

export const COLORS = {
  ash: 0x6b6770, ashLight: 0x8f8a97, ashDark: 0x45414c, core: 0xc23bff, danger: 0xff3b5c,
  ice: 0x9fe3f5, iceDeep: 0x5d6a82, sand: 0xb59a7e,
};

export function createModelKit(ctx) {
  const art = ctx.art || (ctx.world && ctx.world.art) || null;
  const mat = (opts) => {
    try { if (art && typeof art.material === 'function') return art.material(opts); } catch (e) { /* fall through */ }
    return new THREE.MeshLambertMaterial({ color: opts.color ?? 0xffffff, vertexColors: !!opts.vertexColors, flatShading: opts.flat !== false });
  };
  const basic = (opts) => {
    try { if (art && typeof art.basic === 'function') return art.basic(opts); } catch (e) { /* fall through */ }
    return new THREE.MeshBasicMaterial({ color: opts.color ?? 0xffffff, transparent: !!opts.transparent,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opts.depthWrite ?? !opts.transparent });
  };
  const mats = {
    shell: mat({ vertexColors: true, flat: true, rim: 0.35 }),
    melt: mat({ vertexColors: true, flat: true, rim: 0.2, color: 0x9a8f99 }),
    core: basic({ color: COLORS.core }),
    danger: basic({ color: COLORS.danger }),       // ONLY for telegraphs (§5.2)
    hurt: basic({ color: 0xfffbe8 }),              // brief white flash when hit
  };
  const geos = {};

  // ── geometry builders (run once per type) ──
  function thornling() {
    const parts = [];
    const ball = paintY(new THREE.IcosahedronGeometry(0.13, 0), COLORS.ashDark, COLORS.ashLight, -0.13, 0.13);
    parts.push(ball);
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const p = ico.attributes.position, seen = [];
    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = 0; i < p.count; i++) {
      d.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      if (seen.some((s) => s.distanceTo(d) < 0.01)) continue;
      seen.push(d.clone());
      const cone = new THREE.ConeGeometry(0.035, 0.12, 4);
      cone.translate(0, 0.16, 0);
      q.setFromUnitVectors(up, d);
      cone.applyQuaternion(q);
      parts.push(paintY(cone, COLORS.ash, 0x2f2c35, -0.2, 0.2));
    }
    const body = mergeGeos(parts);
    body.scale(1.25, 1.25, 1.25);
    const eye = new THREE.OctahedronGeometry(0.06, 0);
    eye.scale(1.3, 0.55, 0.5);
    eye.translate(0, 0.27, -0.19);
    return { body, core: eye };
  }

  function husk() {
    // a hollow hooded shell: lathe body, shoulder yoke, hood; arms as one swinging mesh
    const prof = [[0.04, 0], [0.30, 0.04], [0.36, 0.45], [0.33, 0.9], [0.27, 1.25], [0.34, 1.42], [0.2, 1.52], [0.05, 1.56]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const lathe = paintY(new THREE.LatheGeometry(prof, 7), 0x3b3842, COLORS.ashLight, 0, 1.6);
    const yoke = paintY(xform(new THREE.BoxGeometry(0.86, 0.16, 0.34), { y: 1.42 }), COLORS.ash, COLORS.ashLight, 1.34, 1.5);
    const hood = paintY(xform(new THREE.ConeGeometry(0.21, 0.5, 6), { y: 1.78, z: 0.03, rx: -0.15 }), COLORS.ash, COLORS.ashLight, 1.55, 2.0);
    const face = paint(xform(new THREE.CircleGeometry(0.12, 6), { y: 1.72, z: -0.165, rx: -0.15 }), 0x1d1b22);
    // ribs around the chest hollow
    const ribL = paint(xform(new THREE.BoxGeometry(0.05, 0.36, 0.06), { x: -0.17, y: 1.12, z: -0.3, rz: 0.25 }), COLORS.ashDark);
    const ribR = paint(xform(new THREE.BoxGeometry(0.05, 0.36, 0.06), { x: 0.17, y: 1.12, z: -0.3, rz: -0.25 }), COLORS.ashDark);
    const hollow = paint(xform(new THREE.CircleGeometry(0.15, 6), { y: 1.12, z: -0.315 }), 0x1d1b22);
    const body = mergeGeos([lathe, yoke, hood, face, ribL, ribR, hollow]);

    const arm = (sx) => {
      const up = paintY(xform(new THREE.CylinderGeometry(0.07, 0.055, 0.5, 5), { x: sx * 0.42, y: -0.25 }), COLORS.ashLight, COLORS.ash, -0.5, 0);
      const lo = paintY(xform(new THREE.CylinderGeometry(0.055, 0.075, 0.48, 5), { x: sx * 0.44, y: -0.72 }), COLORS.ash, COLORS.ashDark, -0.96, -0.5);
      const claw = paint(xform(new THREE.ConeGeometry(0.08, 0.2, 4), { x: sx * 0.44, y: -1.04, rx: Math.PI }), 0x3a3640);
      return [up, lo, claw];
    };
    const arms = mergeGeos([...arm(-1), ...arm(1)]);
    const coreG = new THREE.OctahedronGeometry(0.1, 0);
    coreG.translate(0, 1.12, -0.3);
    const eyeL = xform(new THREE.BoxGeometry(0.07, 0.022, 0.02), { x: -0.055, y: 1.75, z: -0.17, rz: 0.2 });
    const eyeR = xform(new THREE.BoxGeometry(0.07, 0.022, 0.02), { x: 0.055, y: 1.75, z: -0.17, rz: -0.2 });
    const core = mergeGeos([coreG, eyeL, eyeR]);
    return { body, arms, armsPivot: [0, 1.42, 0], core };
  }

  function wisp() {
    const core = new THREE.IcosahedronGeometry(0.2, 1);
    const shards = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const t = new THREE.TetrahedronGeometry(0.075, 0);
      xform(t, { x: Math.cos(a) * 0.34, y: Math.sin(a * 2) * 0.08, z: Math.sin(a) * 0.34, rx: a, ry: a * 1.7 });
      shards.push(paintY(t, COLORS.ashDark, COLORS.ashLight, -0.1, 0.1));
    }
    // a little cowl above the flame
    shards.push(paintY(xform(new THREE.ConeGeometry(0.16, 0.18, 5, 1, true), { y: 0.25 }), COLORS.ash, COLORS.ashLight, 0.15, 0.34));
    return { core, arms: mergeGeos(shards) };
  }

  function lurker() {
    const shell = paintY(xform(new THREE.DodecahedronGeometry(0.62, 0), { y: 0.48, sx: 1.05, sy: 0.55, sz: 1.35 }), 0x4d4853, 0x9c8f86, 0.2, 0.8);
    const fin = paintY(xform(new THREE.ConeGeometry(0.28, 0.7, 3), { y: 0.95, z: 0.1, sx: 0.25, rx: -0.35 }), COLORS.ash, 0xc9b8a8, 0.7, 1.3);
    const head = paintY(xform(new THREE.ConeGeometry(0.3, 0.5, 5), { y: 0.38, z: -0.92, rx: -Math.PI / 2, sx: 1.2, sz: 0.7 }), COLORS.ashDark, COLORS.ash, 0.2, 0.6);
    const legs = [];
    for (const [x, z] of [[-0.55, -0.4], [0.55, -0.4], [-0.55, 0.45], [0.55, 0.45]]) {
      legs.push(paint(xform(new THREE.ConeGeometry(0.1, 0.36, 4), { x, y: 0.16, z, rx: Math.PI }), 0x3a3640));
    }
    const tail = paintY(xform(new THREE.ConeGeometry(0.16, 0.6, 4), { y: 0.4, z: 0.95, rx: Math.PI / 2 }), COLORS.ashDark, COLORS.ash, 0.3, 0.5);
    const body = mergeGeos([shell, fin, head, tail, ...legs]);
    const belly = xform(new THREE.OctahedronGeometry(0.28, 0), { y: 0.2, sy: 0.35 });
    const eyeL = xform(new THREE.BoxGeometry(0.08, 0.04, 0.04), { x: -0.13, y: 0.45, z: -1.08 });
    const eyeR = xform(new THREE.BoxGeometry(0.08, 0.04, 0.04), { x: 0.13, y: 0.45, z: -1.08 });
    return { body, core: mergeGeos([belly, eyeL, eyeR]) };
  }

  function rimeguard() {
    const P = [];
    const ice = (g, lo = COLORS.iceDeep, hi = COLORS.ice, y0 = 0, y1 = 3) => P.push(paintY(g, lo, hi, y0, y1));
    ice(xform(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 5), { x: -0.38, y: 0.55 }), 0x3e4a60, COLORS.iceDeep, 0, 1.1);
    ice(xform(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 5), { x: 0.38, y: 0.55 }), 0x3e4a60, COLORS.iceDeep, 0, 1.1);
    ice(xform(new THREE.BoxGeometry(0.62, 0.22, 0.75), { x: -0.38, y: 0.11, z: -0.1 }), 0x3e4a60, COLORS.iceDeep, 0, 0.3);
    ice(xform(new THREE.BoxGeometry(0.62, 0.22, 0.75), { x: 0.38, y: 0.11, z: -0.1 }), 0x3e4a60, COLORS.iceDeep, 0, 0.3);
    ice(xform(new THREE.BoxGeometry(1.25, 0.5, 0.75), { y: 1.25 }), COLORS.iceDeep, 0x7fb6cc, 1.0, 1.5);
    ice(xform(new THREE.DodecahedronGeometry(0.75, 0), { y: 2.0, sx: 1.25, sy: 0.95, sz: 0.85 }), COLORS.iceDeep, COLORS.ice, 1.4, 2.6);
    ice(xform(new THREE.BoxGeometry(0.42, 0.38, 0.42), { y: 2.78, z: -0.05 }), COLORS.iceDeep, 0xd6f6ff, 2.6, 3.0);
    // ice crown and shoulder spikes
    for (const [x, y, z, rz] of [[-0.75, 2.55, 0, 0.5], [0.75, 2.55, 0, -0.5], [-0.12, 3.05, 0, 0.2], [0.12, 3.05, 0, -0.2], [0, 2.3, 0.6, 0]]) {
      ice(xform(new THREE.ConeGeometry(0.12, 0.5, 4), { x, y, z, rz, rx: z > 0 ? 0.6 : 0 }), COLORS.ice, 0xeafcff, y - 0.3, y + 0.3);
    }
    const visor = paint(xform(new THREE.BoxGeometry(0.36, 0.08, 0.03), { y: 2.8, z: -0.27 }), 0x1d2333);
    const backPlate = paint(xform(new THREE.CircleGeometry(0.24, 6), { y: 2.05, z: 0.72, ry: Math.PI }), 0x1d1b22);
    const body = mergeGeos([...P, visor, backPlate]);
    const arm = (sx) => [
      paintY(xform(new THREE.CylinderGeometry(0.2, 0.17, 0.9, 5), { x: sx * 0.95, y: -0.45 }), COLORS.iceDeep, COLORS.ice, -0.9, 0),
      paintY(xform(new THREE.BoxGeometry(0.46, 0.5, 0.46), { x: sx * 0.97, y: -1.12 }), 0x7fb6cc, COLORS.ice, -1.4, -0.85),
    ];
    const arms = mergeGeos([...arm(-1), ...arm(1)]);
    const coreG = xform(new THREE.OctahedronGeometry(0.22, 0), { y: 2.05, z: 0.74 });
    const eyeL = xform(new THREE.BoxGeometry(0.08, 0.05, 0.03), { x: -0.09, y: 2.8, z: -0.285 });
    const eyeR = xform(new THREE.BoxGeometry(0.08, 0.05, 0.03), { x: 0.09, y: 2.8, z: -0.285 });
    return { body, arms, armsPivot: [0, 2.3, 0], core: mergeGeos([coreG, eyeL, eyeR]) };
  }

  function stillheart() {
    const core = new THREE.IcosahedronGeometry(1.15, 1);
    // one shell plate (a thick pentagon) drawn 12× as instances around the core
    const shape = new THREE.Shape();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * 0.95, y = Math.sin(a) * 0.95;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const plate = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
    plate.translate(0, 0, -0.11);
    const plateC = paintY(plate, COLORS.ashDark, COLORS.ashLight, -0.9, 0.9);
    const stone = paintY(new THREE.OctahedronGeometry(0.55, 0), COLORS.ashDark, COLORS.ashLight, -0.5, 0.5);
    const vein = paint(xform(new THREE.OctahedronGeometry(0.2, 0), { sx: 0.4, sy: 1.6, sz: 0.4 }), COLORS.core);
    const stones = mergeGeos([stone, vein]);
    return { core, plate: mergeGeos([plateC]), stones };
  }

  const BUILD = { thornling, husk, wisp, lurker, rimeguard, stillheart };
  function geo(type) {
    if (!geos[type]) geos[type] = (BUILD[type] || husk)();
    return geos[type];
  }

  /** a fresh model of `type`: { root, spin (rolling/rotating group), body, arms, armsPivot, core, glow, setDanger(b), setHurt(b), setMelt(b) } */
  function build(type) {
    const g = geo(type);
    const root = new THREE.Group();
    root.name = 'enemy:' + type;
    const spin = new THREE.Group();
    root.add(spin);
    const m = { type, root, spin, body: null, arms: null, armsPivot: null, core: null, glow: null, plates: null, stones: null,
      _danger: false, _hurt: false };
    if (g.body) { m.body = new THREE.Mesh(g.body, mats.shell); spin.add(m.body); }
    if (g.arms) {
      // arm geometry is already built relative to its shoulder pivot
      m.armsPivot = new THREE.Group();
      if (g.armsPivot) m.armsPivot.position.fromArray(g.armsPivot);
      m.arms = new THREE.Mesh(g.arms, mats.shell);
      m.armsPivot.add(m.arms);
      spin.add(m.armsPivot);
    }
    if (g.core) { m.core = new THREE.Mesh(g.core, mats.core); (type === 'thornling' ? root : spin).add(m.core); }
    if (type === 'wisp' || type === 'thornling') {
      try {
        if (art && typeof art.glow === 'function') {
          m.glow = type === 'wisp' ? art.glow({ color: COLORS.core, size: 1.2, opacity: 0.85 }) : art.glow({ color: COLORS.core, size: 0.55, opacity: 0.55 });
          (type === 'thornling' ? root : spin).add(m.glow);
          if (type === 'thornling') m.glow.position.set(0, 0.24, 0);
        }
      } catch (e) { m.glow = null; }
    }
    if (type === 'stillheart') {
      m.plates = new THREE.InstancedMesh(g.plate, mats.shell, 12);
      m.plates.frustumCulled = false;
      m.stones = new THREE.InstancedMesh(g.stones, mats.shell, 3);
      m.stones.frustumCulled = false;
      spin.add(m.plates);
      root.add(m.stones);
      try {
        if (art && typeof art.glow === 'function') { m.glow = art.glow({ color: COLORS.core, size: 5, opacity: 0.7 }); spin.add(m.glow); }
      } catch (e) { m.glow = null; }
    }
    m.setDanger = (b) => {
      if (m._danger === b) return;
      m._danger = b;
      if (m.core && !m._hurt) m.core.material = b ? mats.danger : mats.core;
    };
    m.setHurt = (b) => {
      if (m._hurt === b) return;
      m._hurt = b;
      if (m.core) m.core.material = b ? mats.hurt : (m._danger ? mats.danger : mats.core);
    };
    m.setMelt = (b) => {
      const mm = b ? mats.melt : mats.shell;
      if (m.body) m.body.material = mm;
      if (m.arms) m.arms.material = mm;
    };
    root.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    return m;
  }

  return { build, mats, geo };
}
