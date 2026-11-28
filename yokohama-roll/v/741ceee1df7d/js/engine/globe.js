// globe.js — the final stage: a toy planet Earth (radius 1000) covered in world landmarks.
import * as THREE from 'three';
import { ObjectSet } from './objects.js';

export const EARTH_R = 1000;
const Y = new THREE.Vector3(0, 1, 0);

export function latLonToVec(lat, lon, out = new THREE.Vector3()) {
  const la = THREE.MathUtils.degToRad(lat), lo = THREE.MathUtils.degToRad(lon);
  return out.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
}
export function vecToLatLon(v) {
  const n = v.clone().normalize();
  return { lat: THREE.MathUtils.radToDeg(Math.asin(n.y)), lon: THREE.MathUtils.radToDeg(Math.atan2(-n.z, n.x)) };
}

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildGlobe(scene, reg, material, worldMod, opts = {}) {
  const rnd = mulberry(777);
  const group = new THREE.Group();
  scene.add(group);

  // planet texture
  const big = opts.texW || 4096;
  const canvas = document.createElement('canvas');
  canvas.width = big; canvas.height = big / 2;
  const ctx = canvas.getContext('2d');
  try {
    if (worldMod && worldMod.drawEarth) worldMod.drawEarth(ctx, canvas.width, canvas.height);
    else throw new Error('no drawEarth');
  } catch (e) {
    console.warn('drawEarth failed', e);
    ctx.fillStyle = '#2f7fc0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const earthMat = new THREE.MeshLambertMaterial({ map: tex });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 160, 120), earthMat);
  earth.receiveShadow = true;
  group.add(earth);

  // high-resolution patch over Japan: the ball rolls very close to the ground there
  if (worldMod && worldMod.drawRegion && opts.region !== false) {
    const R = { lonW: 122, latN: 46, lonE: 150, latS: 24 };
    const pc = document.createElement('canvas');
    pc.width = opts.patchW || 2048; pc.height = Math.round(pc.width * (R.latN - R.latS) / (R.lonE - R.lonW) / Math.cos(THREE.MathUtils.degToRad(35)) );
    try {
      worldMod.drawRegion(pc.getContext('2d'), pc.width, pc.height, R.lonW, R.latN, R.lonE, R.latS);
      const ptex = new THREE.CanvasTexture(pc);
      ptex.colorSpace = THREE.SRGBColorSpace;
      ptex.anisotropy = 8;
      const d2r = THREE.MathUtils.degToRad;
      const patch = new THREE.Mesh(
        new THREE.SphereGeometry(EARTH_R + 0.12, 140, 110, d2r(R.lonW + 180), d2r(R.lonE - R.lonW), d2r(90 - R.latN), d2r(R.latN - R.latS)),
        new THREE.MeshLambertMaterial({ map: ptex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
      );
      patch.receiveShadow = true;
      group.add(patch);
    } catch (e) { console.warn('drawRegion failed', e); }
  }

  // atmosphere rim
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_R * 1.06, 64, 48),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(0.45,0.75,1.0,1.0)*f*1.2; }',
    })
  );
  group.add(atmo);

  // stars
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(3000 * 3);
  for (let i = 0; i < 3000; i++) {
    const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(16000 + rnd() * 4000);
    sp.set([v.x, v.y, v.z], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false }));
  group.add(stars);

  // objects
  const objs = new ObjectSet(scene, material);
  const placements = (worldMod && worldMod.PLACEMENTS) || [];
  const n = new THREE.Vector3();
  const q = new THREE.Quaternion(), qy = new THREE.Quaternion();
  for (const pl of placements) {
    const list = reg.variants(pl.id);
    if (!list.length) continue;
    const count = pl.count || 1;
    for (let i = 0; i < count; i++) {
      const p = list[(rnd() * list.length) | 0];
      let lat = pl.lat, lon = pl.lon;
      if (pl.spread) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * pl.spread;
        lat += Math.sin(a) * d; lon += (Math.cos(a) * d) / Math.max(0.2, Math.cos(THREE.MathUtils.degToRad(lat)));
        lat = Math.max(-88, Math.min(88, lat));
      }
      latLonToVec(lat, lon, n);
      const scale = (pl.scale || 1) * (pl.spread ? 0.85 + rnd() * 0.3 : 1);
      const alt = pl.move === 'fly' ? (12 + rnd() * 25) * Math.max(1, scale) : 0;
      q.setFromUnitVectors(Y, n);
      qy.setFromAxisAngle(Y, rnd() * Math.PI * 2);
      q.multiply(qy);
      const pos = n.clone().multiplyScalar(EARTH_R + alt - (pl.move === 'sail' ? p.h * 0.08 * scale : 0));
      const o = objs.add(p, pos, q, scale, { up: n });
      if (pl.move === 'sail' || pl.move === 'fly') {
        // move along a great circle: rotate around an axis perpendicular to up
        let axis, w;
        if (pl.toward) {
          // trains: shuttle toward the next station and back
          axis = new THREE.Vector3().crossVectors(n, latLonToVec(pl.toward[0], pl.toward[1])).normalize();
          const span = n.angleTo(latLonToVec(pl.toward[0], pl.toward[1]));
          objs.addMover(o, { type: 'shuttle', axis, w: 0.0015, t: 0, span, base: pos.clone(), phase: rnd() * Math.PI * 2 });
          continue;
        }
        axis = new THREE.Vector3().crossVectors(n, new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5)).normalize();
        w = (pl.move === 'fly' ? 0.02 : 0.004) * (0.6 + rnd() * 0.8);
        objs.addMover(o, { type: pl.move, axis, w, t: rnd() * 10 });
      }
    }
  }
  objs.finalize({ castShadow: true, receiveShadow: false });

  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _f = new THREE.Vector3(), _n = new THREE.Vector3();
  function updateMovers(dt, ball) {
    for (const o of objs.movers) {
      if (o.picked) continue;
      const m = o.mover;
      m.t += dt;
      let pos;
      if (m.type === 'shuttle') {
        // ping-pong between the start and the next station along the line
        const ang = (0.5 - 0.5 * Math.cos(m.phase + m.t * m.w * 60 / Math.max(m.span, 1e-3) * 0.02)) * m.span;
        _q.setFromAxisAngle(m.axis, ang);
        pos = m.base.clone().applyQuaternion(_q);
      } else {
        _q.setFromAxisAngle(m.axis, m.w * dt);
        pos = o.pos.clone().applyQuaternion(_q);
      }
      _n.copy(pos).normalize();
      // face along the direction of travel
      _f.crossVectors(m.axis, _n).normalize();
      const mtx = new THREE.Matrix4().lookAt(new THREE.Vector3(), _f, _n);
      _q2.setFromRotationMatrix(mtx);
      // lookAt aims -Z at the target; models face +Z → flip
      _q2.multiply(new THREE.Quaternion().setFromAxisAngle(Y, Math.PI));
      objs.setTransform(o, pos, _q2);
      o.up.copy(_n);
    }
  }

  return { group, objs, earth, atmo, stars, updateMovers, canvas };
}
