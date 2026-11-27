// js/track/terrain.js — Continuous 3D sculpted heightfield terrain fitted seamlessly to each Cambodia circuit
// Single draw call with vertex-color biome blending + procedural ground texture (Quest 3S 72fps friendly).
import * as THREE from 'three';
import { getGroundTexture } from '../engine/textures.js';

function fbm(x, z) {
  return (
    Math.sin(x * 0.0055) * Math.cos(z * 0.0055) * 0.55 +
    Math.sin(x * 0.013 + z * 0.009) * 0.28 +
    Math.cos(x * 0.029 - z * 0.023) * 0.12 +
    Math.sin(x * 0.058 + z * 0.047) * 0.05
  );
}

export function buildTerrain(spline, course) {
  const segs = 104;
  const size = 2200;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  // Center terrain around track midpoint
  const cx = (spline.bounds.minX + spline.bounds.maxX) * 0.5;
  const cz = (spline.bounds.minZ + spline.bounds.maxZ) * 0.5;
  geo.translate(cx, 0, cz);

  // Downsampled track spine points for fast distance queries
  const trackPts = [];
  for (let i = 0; i < spline.N; i += 3) {
    const s = spline.samples[i];
    trackPts.push({ x: s.pos.x, y: s.pos.y, z: s.pos.z, w: s.width * 0.5 + 4.5 });
  }

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color();
  const cMid = new THREE.Color();
  const cHigh = new THREE.Color();
  const tmpCol = new THREE.Color();

  if (course.theme === 'bokor') {
    cLow.set('#1f3829'); cMid.set('#38523a'); cHigh.set('#5a605b');
  } else if (course.theme === 'cyber') {
    cLow.set('#050b18'); cMid.set('#0a162e'); cHigh.set('#12264a');
  } else if (course.theme === 'angkor') {
    cLow.set('#2c3f24'); cMid.set('#4a5e32'); cHigh.set('#6b5e43');
  } else if (course.theme === 'kampot') {
    cLow.set('#3a5f32'); cMid.set('#687846'); cHigh.set('#46615a');
  } else {
    // Phnom Penh riverside grass & earth
    cLow.set('#273428'); cMid.set('#3f4a37'); cHigh.set('#56554c');
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    // Find nearest point on track spine
    let bestD2 = Infinity;
    let nearY = 0;
    let roadHalf = 14;
    for (let k = 0; k < trackPts.length; k++) {
      const p = trackPts[k];
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        nearY = p.y;
        roadHalf = p.w;
      }
    }
    const dist = Math.sqrt(bestD2);

    // Natural biome height far from road
    const n = fbm(x, z);
    let naturalY = -1.2;

    if (course.theme === 'bokor') {
      // Dramatic mountain ridge & deep coastal valley dropping toward sea of clouds
      const ridge = Math.max(0, 1 - dist / 460);
      naturalY = -18 + ridge * 36 + n * 48 + Math.max(0, (dist - 220) * 0.14) * (n > -0.1 ? 1 : -0.7);
    } else if (course.theme === 'kampot') {
      // Flat coastal plain & river basin surrounded by towering Elephant Mountains in the distance
      const mtnRing = Math.max(0, (dist - 210) / 380);
      naturalY = -1.1 + n * 3.5 + Math.pow(mtnRing, 1.8) * (75 + n * 55);
      // Carve Kampot River bed to the west
      if (x < -55 && x > -230) naturalY = Math.min(naturalY, -4.5);
    } else if (course.theme === 'phnompenh') {
      // Flat urban riverfront with Mekong basin to the west and gentle distant hills across the river
      naturalY = -0.9 + n * 2.2;
      if (x < -45) {
        const riverDepth = Math.sin(Math.min(1, (-45 - x) / 480) * Math.PI) * -6.5;
        naturalY = Math.min(naturalY, riverDepth);
      }
    } else if (course.theme === 'angkor') {
      // Sacred Angkor moat depression around (175, -175) & gentle jungle hills around outer rim
      const mdx = x - 175, mdz = z + 175;
      if (Math.abs(mdx) < 135 && Math.abs(mdz) < 110) {
        naturalY = -3.8; // carved moat basin
      } else {
        const outerHills = Math.max(0, (dist - 190) / 320);
        naturalY = -0.9 + n * 4.5 + Math.pow(outerHills, 1.5) * (32 + n * 26);
      }
    } else if (course.theme === 'cyber') {
      // Deep glowing cyber canyon under elevated neon highway
      naturalY = -6.5 + n * 8.0;
    }

    // Smooth blend from track roadbed to natural terrain so the road NEVER clips into terrain
    let y;
    if (course.theme === 'cyber') {
      // Elevated cyber viaduct floats dramatically above neon canyon
      y = Math.min(naturalY, nearY - 2.2);
    } else {
      const clearDist = roadHalf + 4;
      const blendDist = course.theme === 'bokor' ? 62 : 48;
      if (dist <= clearDist) {
        y = nearY - 0.36;
      } else if (dist < clearDist + blendDist) {
        const t = (dist - clearDist) / blendDist;
        const s = t * t * (3 - 2 * t);
        y = (nearY - 0.36) * (1 - s) + naturalY * s;
      } else {
        y = naturalY;
      }
    }

    pos.setY(i, y);

    // Biome vertex coloring based on elevation & noise
    const hNorm = Math.max(0, Math.min(1, (y + 5) / 45));
    if (hNorm < 0.45) tmpCol.lerpColors(cLow, cMid, hNorm / 0.45);
    else tmpCol.lerpColors(cMid, cHigh, (hNorm - 0.45) / 0.55);
    const shade = 0.88 + (n * 0.5 + 0.5) * 0.24;
    colors[i * 3] = tmpCol.r * shade;
    colors[i * 3 + 1] = tmpCol.g * shade;
    colors[i * 3 + 2] = tmpCol.b * shade;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    map: getGroundTexture(course.theme),
    vertexColors: true,
    roughness: course.isCyber ? 0.38 : 0.92,
    metalness: course.isCyber ? 0.45 : 0.02,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'SculptedTerrain';
  return mesh;
}
