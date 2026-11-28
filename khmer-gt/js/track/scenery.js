// js/track/scenery.js — Commercial-grade Cambodian 3D Landmarks, Instanced Tropical Vegetation, Animated Water & Cyberpunk Angkor 2099
// Engineered for Meta Quest 3S (72fps) using InstancedMesh batching and procedural PBR textures.
import * as THREE from 'three';
import {
  getAngkorStoneTextures,
  getBuildingFacadeTexture,
  getFoliageClusterTexture,
  getGlowTexture,
  getKhmerRoofTexture,
  getPalmFrondTexture,
  getSkyEquirectTexture,
  getWaterBumpTexture,
} from '../engine/textures.js';
import { buildTerrain } from './terrain.js';

function isClearOfTrack(spline, x, z, minClearance = 23) {
  const minD2 = minClearance * minClearance;
  for (let i = 0; i < spline.N; i += 4) {
    const p = spline.samples[i].pos;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < minD2) return false;
  }
  return true;
}

// Authentic Khmer Lotus-Bud Prasat Tower via smooth LatheGeometry (replaces blocky boxes!)
function createLotusPrasatGeometry(scale = 1) {
  const pts = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 = base, 1 = spire tip
    const y = t * 38 * scale;
    // Authentic Angkor tier-stepped lotus curve: broad plinth -> 6 scalloped tiers curving inward -> needle finial
    const envelope = Math.pow(1 - t, 0.72) * 8.2;
    const tierScallop = t < 0.86 ? (0.86 + 0.14 * Math.abs(Math.sin(t * Math.PI * 7.5))) : (1 - (t - 0.86) / 0.14) * 0.45;
    const r = Math.max(0.15, envelope * tierScallop) * scale;
    pts.push(new THREE.Vector2(r, y));
  }
  return new THREE.LatheGeometry(pts, 12);
}

// Full 5-Tower Angkor Wat Temple Complex (both Historic Sandstone AND Cyber Obsidian 2099!)
function buildAngkorComplex(scale = 1.0, cyber = false) {
  const g = new THREE.Group();
  const stoneTex = getAngkorStoneTextures(cyber);
  const stoneMat = new THREE.MeshStandardMaterial({
    map: stoneTex.map,
    bumpMap: stoneTex.bumpMap,
    bumpScale: 0.25,
    color: cyber ? '#1a2742' : '#c2b094',
    roughness: cyber ? 0.24 : 0.86,
    metalness: cyber ? 0.82 : 0.06,
  });
  const glowCyan = cyber ? new THREE.MeshBasicMaterial({ color: '#00f0ff' }) : null;
  const glowPink = cyber ? new THREE.MeshBasicMaterial({ color: '#ff1f7a' }) : null;

  // 3-Tiered Gallery Plinth with Colonade Pilasters
  const tiers = [
    [104, 7.5, 68, 3.75],
    [76, 8.0, 50, 11.2],
    [52, 7.0, 36, 18.2],
  ];
  tiers.forEach(([w, h, d, y], idx) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * scale, h * scale, d * scale), stoneMat);
    m.position.y = y * scale;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    if (cyber) {
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry((w + 1.2) * scale, 0.75 * scale, (d + 1.2) * scale),
        idx % 2 === 0 ? glowCyan : glowPink
      );
      trim.position.y = (y + h * 0.48) * scale;
      g.add(trim);
    }
  });

  // Grand Central Lotus Spire + 4 Corner Lotus Spires
  const centerGeo = createLotusPrasatGeometry(1.38 * scale);
  const centerTower = new THREE.Mesh(centerGeo, stoneMat);
  centerTower.position.y = 20 * scale;
  centerTower.castShadow = true;
  g.add(centerTower);

  if (cyber) {
    // Glowing rings wrapping the central Cyber-Angkor spire
    for (let k = 0; k < 5; k++) {
      const r = (9.8 - k * 1.65) * scale;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.35 * scale, 6, 20),
        k % 2 === 0 ? glowCyan : glowPink
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = (25 + k * 7.8) * scale;
      g.add(ring);
    }
  }

  const cornerGeo = createLotusPrasatGeometry(0.95 * scale);
  const corners = [[-22, -13], [22, -13], [-22, 13], [22, 13]];
  for (const [cx, cz] of corners) {
    const t = new THREE.Mesh(cornerGeo, stoneMat);
    t.position.set(cx * scale, 18 * scale, cz * scale);
    t.castShadow = true;
    g.add(t);
    if (cyber) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(5.8 * scale, 0.28 * scale, 6, 16), glowPink);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx * scale, 26 * scale, cz * scale);
      g.add(ring);
    }
  }

  return g;
}

// High-efficiency Instanced Palm Grove (2 draw calls total for dozens of rich alpha-frond palms!)
function addInstancedPalms(group, placements) {
  if (!placements.length) return;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.42, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5c4734', roughness: 0.92 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);

  // Curved palm frond card (6 fronds per palm)
  const frondGeo = new THREE.PlaneGeometry(3.4, 5.2, 1, 3);
  const fPos = frondGeo.attributes.position;
  for (let i = 0; i < fPos.count; i++) {
    const y = fPos.getY(i);
    // Arch frond gracefully outward & drooping at tip
    const t = (y + 2.6) / 5.2; // 0 at base, 1 at tip
    fPos.setZ(i, -Math.sin(t * Math.PI * 0.82) * 1.15);
  }
  frondGeo.translate(0, 2.4, 0);
  frondGeo.computeVertexNormals();

  const frondMat = new THREE.MeshStandardMaterial({
    map: getPalmFrondTexture(),
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.72,
  });
  const frondsPerPalm = 6;
  const fronds = new THREE.InstancedMesh(frondGeo, frondMat, placements.length * frondsPerPalm);

  const dummy = new THREE.Object3D();
  let fi = 0;
  placements.forEach((p, i) => {
    const leanX = ((i * 37) % 10 - 5) * 0.025;
    const leanZ = ((i * 53) % 10 - 5) * 0.025;
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(leanX, p.rot || 0, leanZ);
    dummy.scale.set(1, p.h, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    const topX = p.x + Math.sin(leanZ) * -p.h;
    const topZ = p.z + Math.sin(leanX) * p.h;
    const topY = p.y + p.h * 0.96;
    for (let k = 0; k < frondsPerPalm; k++) {
      const yaw = (k / frondsPerPalm) * Math.PI * 2 + (p.rot || 0);
      dummy.position.set(topX, topY, topZ);
      dummy.rotation.set(0.82 + (k % 2) * 0.18, yaw, 0, 'YXZ');
      dummy.scale.setScalar(0.85 + (p.h / 12) * 0.3);
      dummy.updateMatrix();
      fronds.setMatrixAt(fi++, dummy.matrix);
    }
  });

  trunks.instanceMatrix.needsUpdate = true;
  fronds.instanceMatrix.needsUpdate = true;
  group.add(trunks, fronds);
}

// High-efficiency Instanced Tropical Broadleaf Forest (cross-card organic foliage, 2 draw calls total!)
function addInstancedForest(group, placements) {
  if (!placements.length) return;
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.95, 1, 7);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4f3f2f', roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);

  // 3 tilted intersecting foliage planes per canopy crown + per-tree green variation (no flat horizontal edge!)
  const cardGeo = new THREE.PlaneGeometry(1, 1);
  const cardMat = new THREE.MeshStandardMaterial({
    map: getFoliageClusterTexture(),
    alphaTest: 0.36,
    side: THREE.DoubleSide,
    roughness: 0.84,
  });
  const cardsPerTree = 3;
  const crowns = new THREE.InstancedMesh(cardGeo, cardMat, placements.length * cardsPerTree);
  const tint = new THREE.Color();

  const dummy = new THREE.Object3D();
  let ci = 0;
  placements.forEach((p, i) => {
    dummy.position.set(p.x, p.y - 0.8, p.z);
    dummy.rotation.set(0, (i * 1.7) % 6.28, 0);
    dummy.scale.set(p.scale * 0.72, p.h, p.scale * 0.72);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);

    const cy = p.y + p.h * 0.82;
    const crownSize = p.scale * 11.2;
    const shade = 0.82 + ((i * 29) % 10) * 0.036;
    tint.setRGB(shade * 0.94, shade * 1.04, shade * 0.88);
    for (let k = 0; k < cardsPerTree; k++) {
      dummy.position.set(
        p.x + Math.cos(k * 2.094) * crownSize * 0.12,
        cy + (k - 1) * 0.5,
        p.z + Math.sin(k * 2.094) * crownSize * 0.12
      );
      dummy.rotation.set(0.18, (k / 3) * Math.PI + i * 0.5, 0);
      dummy.scale.set(crownSize, crownSize * 0.88, 1);
      dummy.updateMatrix();
      crowns.setMatrixAt(ci, dummy.matrix);
      crowns.setColorAt(ci, tint);
      ci++;
    }
  });

  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  group.add(trunks, crowns);
}

function makeNeonSign(text, subtext, colorA = '#00f0ff', colorB = '#ff1f7a') {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(4, 10, 22, 0.88)';
  ctx.fillRect(8, 8, 496, 240);
  ctx.strokeStyle = colorA;
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, 488, 232);
  ctx.strokeStyle = colorB;
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 464, 208);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = colorA;
  ctx.shadowBlur = 20;
  ctx.fillStyle = colorA;
  ctx.font = '900 58px "Orbitron", "Noto Sans JP", sans-serif';
  ctx.fillText(text, 256, 106);

  ctx.shadowColor = colorB;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 30px "Noto Sans JP", sans-serif';
  ctx.fillText(subtext, 256, 178);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
}

export function buildScenery(scene, spline, course) {
  const group = new THREE.Group();
  group.name = `Scenery_${course.id}`;
  const animators = [];
  const s = course.sky;

  // 1. Atmospheric Distance Fog + High-Resolution Procedural Sky/Cloud Dome
  scene.fog = new THREE.FogExp2(s.fogColor, course.theme === 'bokor' ? 0.0024 : course.isCyber ? 0.00145 : 0.00095);
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(1450, 36, 20),
    new THREE.MeshBasicMaterial({
      map: getSkyEquirectTexture(course),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    })
  );
  group.add(skyDome);

  // 2. Physically-Balanced Lighting (Hemisphere + Shadow-Casting Sun + Rim Fill)
  const hemi = new THREE.HemisphereLight(s.ambientColor, s.ground, s.ambientInt);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(s.sunColor, s.sunInt);
  sun.position.set(s.sunPos[0], s.sunPos[1], s.sunPos[2]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0006;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 950;
  const d = 240;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
  sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
  group.add(sun);

  // Twinkling Stars for Twilight & Cyber
  if (s.stars > 0) {
    const count = Math.round(650 * s.stars);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.44;
      const r = 1250;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      pos[i * 3 + 1] = Math.cos(ph) * r;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    group.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: course.isCyber ? '#8ef6ff' : '#fff7e0', size: 3.4, fog: false })));
  }

  // 3. Sculpted Continuous 3D Terrain Mesh (replaces flat ground plane!)
  const terrain = buildTerrain(spline, course);
  group.add(terrain);

  // Shared animated water bump texture
  const waterBump = getWaterBumpTexture();

  // =========================================================================
  // COURSE-SPECIFIC COMMERCIAL-GRADE CAMBODIAN LANDMARKS
  // =========================================================================
  if (course.theme === 'phnompenh') {
    // 1. Shimmering Animated Mekong & Tonle Sap River
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#183d5e',
      bumpMap: waterBump,
      bumpScale: 0.45,
      roughness: 0.14,
      metalness: 0.78,
      emissive: '#1e1622',
      emissiveIntensity: 0.22,
    });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(580, 1900), waterMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(-325, -0.7, -40);
    group.add(river);
    animators.push((t) => {
      waterBump.offset.set(t * 0.015, t * 0.04);
    });

    // 2. Royal Palace of Cambodia (Tiered Khmer Golden Tile Roofs + White Colonnades + Golden Prasat Spire)
    const palace = new THREE.Group();
    palace.position.set(148, -0.5, -155);
    const wallMat = new THREE.MeshStandardMaterial({ color: '#f5ecd4', roughness: 0.65 });
    const roofTex = getKhmerRoofTexture();
    const goldRoof = new THREE.MeshStandardMaterial({
      map: roofTex,
      roughness: 0.26,
      metalness: 0.62,
      emissive: '#4d3206',
      emissiveIntensity: 0.3,
    });
    const goldSpireMat = new THREE.MeshStandardMaterial({ color: '#f5c74c', roughness: 0.2, metalness: 0.85, emissive: '#664308', emissiveIntensity: 0.35 });

    // Throne Hall Base + Colonnade Pillars
    const hall = new THREE.Mesh(new THREE.BoxGeometry(52, 11, 24), wallMat);
    hall.position.y = 5.5;
    hall.castShadow = true;
    palace.add(hall);
    for (let x = -22; x <= 22; x += 5.5) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 11, 8), wallMat);
      col.position.set(x, 5.5, 13);
      palace.add(col);
    }
    // Triple-tiered sweeping Khmer roofs + Lotus Throne Spire
    const r1 = new THREE.Mesh(new THREE.ConeGeometry(34, 11, 4), goldRoof);
    r1.rotation.y = Math.PI / 4; r1.scale.set(1.25, 1, 0.68); r1.position.y = 16;
    const r2 = new THREE.Mesh(new THREE.ConeGeometry(24, 9, 4), goldRoof);
    r2.rotation.y = Math.PI / 4; r2.scale.set(1.2, 1, 0.65); r2.position.y = 22.5;
    const spire = new THREE.Mesh(createLotusPrasatGeometry(0.55), goldSpireMat);
    spire.position.y = 24;
    palace.add(r1, r2, spire);

    // Flanking Moonlight Pavilion & Palace Wall Gates
    for (const sx of [-38, 38]) {
      const pav = new THREE.Mesh(new THREE.BoxGeometry(18, 9, 18), wallMat);
      pav.position.set(sx, 4.5, 6);
      const pr = new THREE.Mesh(new THREE.ConeGeometry(14, 9.5, 4), goldRoof);
      pr.rotation.y = Math.PI / 4; pr.position.set(sx, 13.5, 6);
      palace.add(pav, pr);
    }
    group.add(palace);

    // 3. Independence Monument (Vimean Ekareach — Crimson Sculpted Lotus Stupa)
    const indep = new THREE.Group();
    indep.position.set(140, -0.5, 130);
    const lotusMat = new THREE.MeshStandardMaterial({
      map: getAngkorStoneTextures(false).map,
      color: '#a82c32',
      roughness: 0.55,
      metalness: 0.18,
    });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(18, 21, 3.2, 20), wallMat);
    plinth.position.y = 1.6;
    const stupa = new THREE.Mesh(createLotusPrasatGeometry(0.95), lotusMat);
    stupa.position.y = 3.0;
    indep.add(plinth, stupa);
    group.add(indep);

    // 4. Phnom Penh / Koh Pich Glass Curtain-Wall Skyline
    const glassFacade = getBuildingFacadeTexture('twilight');
    const bldMat = new THREE.MeshStandardMaterial({
      map: glassFacade,
      roughness: 0.25,
      metalness: 0.72,
      emissiveMap: glassFacade,
      emissive: '#ffcf86',
      emissiveIntensity: 0.45,
    });
    const skyline = [
      [440, -290, 28, 105, 28], [468, -175, 24, 148, 24], [435, -45, 30, 88, 26],
      [422, 125, 26, 124, 26], [365, 285, 28, 82, 24], [195, -525, 32, 134, 28],
      [88, -515, 26, 94, 24], [322, -495, 28, 114, 26], [-560, -180, 32, 92, 30],
    ];
    for (const [bx, bz, bw, bh, bd] of skyline) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bldMat);
      tower.position.set(bx, bh * 0.5 - 1, bz);
      group.add(tower);
    }

    // 5. Instanced Riverfront Palms + Warm Twilight Streetlamps with Additive Glow Halos
    const palms = [];
    const poleMat = new THREE.MeshStandardMaterial({ color: '#242934', metalness: 0.75, roughness: 0.3 });
    const glowTex = getGlowTexture('#ffbe66');
    const poles = [];

    for (let i = 0; i < spline.N; i += 14) {
      const smp = spline.samples[i];
      const side = (i % 28 === 0) ? -1 : 1;
      const pos = smp.pos.clone().addScaledVector(smp.right, side * (smp.width * 0.5 + 5.2));
      poles.push({ x: pos.x, y: pos.y, z: pos.z });

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.78, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.scale.set(4.5, 4.5, 1);
      halo.position.set(pos.x, pos.y + 8.6, pos.z);
      group.add(halo);

      const palmPos = smp.pos.clone().addScaledVector(smp.right, -side * (smp.width * 0.5 + 11.5));
      if (isClearOfTrack(spline, palmPos.x, palmPos.z, 19)) {
        palms.push({ x: palmPos.x, y: palmPos.y - 0.5, z: palmPos.z, h: 10 + (i % 5), rot: i * 0.7 });
      }
    }
    if (poles.length) {
      const pGeo = new THREE.CylinderGeometry(0.14, 0.22, 8.6, 6);
      pGeo.translate(0, 4.3, 0);
      const pInst = new THREE.InstancedMesh(pGeo, poleMat, poles.length);
      const m = new THREE.Matrix4();
      poles.forEach((p, idx) => { m.makeTranslation(p.x, p.y, p.z); pInst.setMatrixAt(idx, m); });
      pInst.instanceMatrix.needsUpdate = true;
      group.add(pInst);
    }
    addInstancedPalms(group, palms);

  } else if (course.theme === 'angkor') {
    // 1. Grand Sculpted 5-Tower Angkor Wat Temple Complex
    const angkor = buildAngkorComplex(1.9, false);
    angkor.position.set(175, -0.5, -175);
    angkor.rotation.y = -0.35;
    group.add(angkor);

    // 2. Reflective Animated Angkor Moat surrounding the Temple
    const moatMat = new THREE.MeshStandardMaterial({
      color: '#254a54',
      bumpMap: waterBump,
      bumpScale: 0.35,
      roughness: 0.12,
      metalness: 0.72,
    });
    const moat = new THREE.Mesh(new THREE.PlaneGeometry(290, 235), moatMat);
    moat.rotation.x = -Math.PI / 2;
    moat.position.set(175, -0.6, -175);
    group.add(moat);
    animators.push((t) => { waterBump.offset.set(t * 0.01, t * 0.02); });

    // 3. Authentic Sandstone Bayon Stone Arches spanning the circuit
    const stoneTex = getAngkorStoneTextures(false);
    const stoneMat = new THREE.MeshStandardMaterial({
      map: stoneTex.map,
      bumpMap: stoneTex.bumpMap,
      bumpScale: 0.2,
      color: '#baa88c',
      roughness: 0.88,
    });
    for (const idx of [75, 290, 470]) {
      const smp = spline.samples[idx % spline.N];
      const gate = new THREE.Group();
      gate.position.copy(smp.pos);
      gate.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(smp.right, smp.normal, smp.tangent.clone().negate())
      );
      const hw = smp.width * 0.5 + 4.2;
      const pL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 12.5, 4.4), stoneMat); pL.position.set(-hw, 6.2, 0);
      const pR = new THREE.Mesh(new THREE.BoxGeometry(3.6, 12.5, 4.4), stoneMat); pR.position.set(hw, 6.2, 0);
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4.8, 3.6, 4.8), stoneMat); lintel.position.set(0, 12.4, 0);
      const crown = new THREE.Mesh(createLotusPrasatGeometry(0.32), stoneMat); crown.position.set(0, 13.8, 0);
      gate.add(pL, pR, lintel, crown);
      group.add(gate);
    }

    // 4. Lush Instanced Ta Prohm Tropical Jungle Forest + Palms (NO blocky spheres!)
    const trees = [];
    const palms = [];
    for (let i = 0; i < 120; i++) {
      const ang = (i / 120) * Math.PI * 2;
      const rad = 225 + (i % 7) * 52;
      const tx = 180 + Math.cos(ang) * rad;
      const tz = -50 + Math.sin(ang) * rad;
      if (!isClearOfTrack(spline, tx, tz, 25)) continue;
      if (i % 4 === 0) palms.push({ x: tx, y: -0.5, z: tz, h: 12 + (i % 4) * 2, rot: i });
      else trees.push({ x: tx, y: -0.5, z: tz, h: 13 + (i % 5) * 3, scale: 1.0 + (i % 4) * 0.3 });
    }
    // Add roadside jungle canopy framing the track
    for (let i = 0; i < spline.N; i += 14) {
      const smp = spline.samples[i];
      for (const side of [-1, 1]) {
        const p = smp.pos.clone().addScaledVector(smp.right, side * (smp.width * 0.5 + 15 + (i % 3) * 5));
        if (!isClearOfTrack(spline, p.x, p.z, 21)) continue;
        // Don't block view of Angkor Wat temple inside moat
        if (Math.abs(p.x - 175) < 145 && Math.abs(p.z + 175) < 120) continue;
        trees.push({ x: p.x, y: p.y - 0.6, z: p.z, h: 11 + (i % 4) * 2.5, scale: 0.9 + (i % 3) * 0.25 });
      }
    }
    addInstancedForest(group, trees);
    addInstancedPalms(group, palms);

  } else if (course.theme === 'cyber') {
    // =========================================================================
    // URA-ANGKOR WAT 2099 — COMMERCIAL CYBERPUNK MASTERPIECE
    // =========================================================================
    // 1. Colossal Sculpted Cyber-Angkor 5-Spire Megastructure
    const cyberAngkor = buildAngkorComplex(2.35, true);
    cyberAngkor.position.set(195, -2.5, -155);
    cyberAngkor.rotation.y = -0.35;
    group.add(cyberAngkor);

    // Sky-piercing Quantum Plasma Beam + Triple Rotating Holographic Mandala Rings
    const laserMat = new THREE.MeshBasicMaterial({
      color: '#00f0ff',
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const laser = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 5.2, 540, 14, 1, true), laserMat);
    laser.position.set(195, 310, -155);
    group.add(laser);

    const halo1 = new THREE.Mesh(
      new THREE.TorusGeometry(102, 1.4, 8, 64),
      new THREE.MeshBasicMaterial({ color: '#00f0ff', transparent: true, opacity: 0.78 })
    );
    halo1.position.set(195, 98, -155); halo1.rotation.x = Math.PI * 0.44;
    const halo2 = new THREE.Mesh(
      new THREE.TorusGeometry(78, 1.1, 8, 64),
      new THREE.MeshBasicMaterial({ color: '#ff1f7a', transparent: true, opacity: 0.72 })
    );
    halo2.position.set(195, 134, -155); halo2.rotation.x = Math.PI * 0.56;
    const halo3 = new THREE.Mesh(
      new THREE.TorusGeometry(54, 0.9, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd000', transparent: true, opacity: 0.65 })
    );
    halo3.position.set(195, 168, -155); halo3.rotation.x = Math.PI * 0.48;
    group.add(halo1, halo2, halo3);

    // 2. Animated Futuristic Neon Skytrain soaring through the city skyline!
    const trainGroup = new THREE.Group();
    const trainBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 3.2, 46),
      new THREE.MeshStandardMaterial({ color: '#0d172a', metalness: 0.9, roughness: 0.15 })
    );
    const trainGlow = new THREE.Mesh(
      new THREE.BoxGeometry(4.0, 0.55, 45),
      new THREE.MeshBasicMaterial({ color: '#00f0ff' })
    );
    trainGroup.add(trainBody, trainGlow);
    group.add(trainGroup);

    animators.push((t) => {
      halo1.rotation.z = t * 0.34;
      halo2.rotation.z = -t * 0.52;
      halo3.rotation.z = t * 0.75;
      laserMat.opacity = 0.44 + Math.sin(t * 3.8) * 0.16;
      const a = t * 0.22;
      trainGroup.position.set(195 + Math.cos(a) * 265, 58, -155 + Math.sin(a) * 265);
      trainGroup.rotation.y = -a;
    });

    // 3. Instanced Cyber-Naga Highway Portal Arches (3 draw calls total instead of 150!)
    const archSamples = [];
    for (let i = 18; i < spline.N; i += 22) archSamples.push(spline.samples[i]);
    const archDark = new THREE.MeshStandardMaterial({ color: '#0a1222', metalness: 0.88, roughness: 0.18 });
    const archCyan = new THREE.MeshBasicMaterial({ color: '#00f0ff' });
    const archPink = new THREE.MeshBasicMaterial({ color: '#ff1f7a' });

    const pInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 10.6, 1.5), archDark, archSamples.length * 2);
    const tInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.2, 1.5), archDark, archSamples.length);
    const nCInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.36, 0.36), archCyan, Math.ceil(archSamples.length / 2));
    const nPInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.36, 0.36), archPink, Math.floor(archSamples.length / 2));
    const ao = new THREE.Object3D();
    const qBase = new THREE.Quaternion();
    let pi = 0, ci = 0, pki = 0;

    archSamples.forEach((smp, idx) => {
      qBase.setFromRotationMatrix(new THREE.Matrix4().makeBasis(smp.right, smp.normal, smp.tangent.clone().negate()));
      const hw = smp.width * 0.5 + 3.9;
      for (const side of [-1, 1]) {
        ao.position.copy(smp.pos).addScaledVector(smp.right, side * hw).addScaledVector(smp.normal, 5.3);
        ao.quaternion.copy(qBase);
        ao.scale.set(1, 1, 1);
        ao.updateMatrix();
        pInst.setMatrixAt(pi++, ao.matrix);
      }
      ao.position.copy(smp.pos).addScaledVector(smp.normal, 10.5);
      ao.quaternion.copy(qBase);
      ao.scale.set(hw * 2 + 2.4, 1, 1);
      ao.updateMatrix();
      tInst.setMatrixAt(idx, ao.matrix);

      ao.position.copy(smp.pos).addScaledVector(smp.normal, 9.8).addScaledVector(smp.tangent, -0.78);
      ao.scale.set(hw * 2, 1, 1);
      ao.updateMatrix();
      if (idx % 2 === 0 && ci < nCInst.count) nCInst.setMatrixAt(ci++, ao.matrix);
      else if (pki < nPInst.count) nPInst.setMatrixAt(pki++, ao.matrix);
    });
    for (const im of [pInst, tInst, nCInst, nPInst]) { im.instanceMatrix.needsUpdate = true; group.add(im); }

    // 4. Floating Khmer-Cyberpunk Neon Hologram Billboards
    const billboards = [
      { idx: 44, side: -1, t: 'អង្គរ 2099', s: 'URA-ANGKOR SECTOR 09', ca: '#00f0ff', cb: '#ff1f7a' },
      { idx: 150, side: 1, t: 'NEO KHMER', s: 'HYPERDRIVE CIRCUIT', ca: '#ff1f7a', cb: '#ffd000' },
      { idx: 262, side: -1, t: 'ភ្នំពេញ GT', s: 'PLASMA TURBO LAB', ca: '#00f0ff', cb: '#a6ff00' },
      { idx: 386, side: 1, t: 'GARUDA-X', s: 'QUANTUM OVERDRIVE', ca: '#ffd000', cb: '#00f0ff' },
      { idx: 500, side: -1, t: 'CYBER NAGA', s: 'APEX TERMINAL', ca: '#ff1f7a', cb: '#00f0ff' },
    ];
    for (const b of billboards) {
      const smp = spline.samples[b.idx % spline.N];
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(25, 12.5), makeNeonSign(b.t, b.s, b.ca, b.cb));
      sign.position.copy(smp.pos)
        .addScaledVector(smp.right, b.side * (smp.width * 0.5 + 18))
        .addScaledVector(smp.normal, 13);
      sign.lookAt(smp.pos.x, smp.pos.y + 8, smp.pos.z);
      group.add(sign);
      const baseY = sign.position.y;
      animators.push((t) => { sign.position.y = baseY + Math.sin(t * 2.0 + b.idx) * 0.9; });
    }

    // 5. Instanced High-Density Cyber Megastructure City (1 draw call for 48 neon skyscrapers!)
    const cyberFacade = getBuildingFacadeTexture('cyber');
    const megaMat = new THREE.MeshStandardMaterial({
      map: cyberFacade,
      emissiveMap: cyberFacade,
      emissive: '#ffffff',
      emissiveIntensity: 0.72,
      roughness: 0.2,
      metalness: 0.85,
    });
    const megaList = [];
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2;
      const rad = 295 + (i % 5) * 65;
      const mx = 200 + Math.cos(ang) * rad;
      const mz = -50 + Math.sin(ang) * rad;
      if (!isClearOfTrack(spline, mx, mz, 35)) continue;
      megaList.push({ x: mx, z: mz, w: 22 + (i % 4) * 8, h: 85 + (i % 7) * 32 });
    }
    if (megaList.length) {
      const mInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), megaMat, megaList.length);
      const mo = new THREE.Object3D();
      megaList.forEach((b, idx) => {
        mo.position.set(b.x, b.h * 0.5 - 6, b.z);
        mo.scale.set(b.w, b.h, b.w);
        mo.updateMatrix();
        mInst.setMatrixAt(idx, mo.matrix);
      });
      mInst.instanceMatrix.needsUpdate = true;
      group.add(mInst);
    }

  } else if (course.theme === 'bokor') {
    // 1. Multi-layered Drifting Sea of Clouds below the mountain pass
    const cloudMat1 = new THREE.MeshBasicMaterial({ color: '#d8e4ec', transparent: true, opacity: 0.52 });
    const cloud1 = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), cloudMat1);
    cloud1.rotation.x = -Math.PI / 2;
    cloud1.position.y = 5.5;
    group.add(cloud1);

    // 2. Old Bokor Palace Hotel & Casino (French Colonial Historic Ruin with Arches & Weathered Stone)
    const palace = new THREE.Group();
    palace.position.set(315, 34.5, 82);
    palace.rotation.y = -0.6;
    const oldWall = new THREE.MeshStandardMaterial({
      map: getAngkorStoneTextures(false).map,
      color: '#b8a894',
      roughness: 0.92,
    });
    const oldRoof = new THREE.MeshStandardMaterial({ color: '#6e3628', roughness: 0.85 });
    const darkArch = new THREE.MeshStandardMaterial({ color: '#171c22', roughness: 0.5 });

    const mainB = new THREE.Mesh(new THREE.BoxGeometry(48, 16, 18), oldWall); mainB.position.y = 8;
    const roofB = new THREE.Mesh(new THREE.ConeGeometry(34, 7.5, 4), oldRoof);
    roofB.rotation.y = Math.PI / 4; roofB.scale.set(1.25, 1, 0.52); roofB.position.y = 19.5;
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(15, 19, 23), oldWall); wingL.position.set(-24, 9.5, 2);
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(15, 19, 23), oldWall); wingR.position.set(24, 9.5, 2);
    palace.add(mainB, roofB, wingL, wingR);
    for (let x = -18; x <= 18; x += 6) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5.2, 0.6), darkArch);
      w.position.set(x, 8.5, 9.2);
      palace.add(w);
    }
    group.add(palace);

    // 3. Old Bokor Catholic Church & Lok Yeay Mao Highland Monument
    const church = new THREE.Group();
    church.position.set(165, 23, -155);
    const chBody = new THREE.Mesh(new THREE.BoxGeometry(13, 12, 24), oldWall); chBody.position.y = 6;
    const chTower = new THREE.Mesh(new THREE.BoxGeometry(6.5, 24, 6.5), oldWall); chTower.position.set(0, 12, -12);
    const chSpire = new THREE.Mesh(new THREE.ConeGeometry(4.5, 10, 4), oldRoof); chSpire.position.set(0, 29, -12);
    church.add(chBody, chTower, chSpire);
    group.add(church);

    // 4. Misty Highland Cloud-Forest Trees + Warm Amber Mountain Fog Lamps
    const trees = [];
    const glowAmber = getGlowTexture('#ffaa44');
    for (let i = 0; i < spline.N; i += 14) {
      const smp = spline.samples[i];
      const side = i % 28 === 0 ? 1 : -1;
      const p = smp.pos.clone().addScaledVector(smp.right, side * (smp.width * 0.5 + 14 + (i % 3) * 5));
      if (isClearOfTrack(spline, p.x, p.z, 19)) {
        trees.push({ x: p.x, y: p.y - 1.0, z: p.z, h: 10 + (i % 5) * 2.5, scale: 0.95 + (i % 3) * 0.25 });
      }
      if (i % 28 === 0) {
        const lp = smp.pos.clone().addScaledVector(smp.right, -side * (smp.width * 0.5 + 4.4));
        const halo = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowAmber, transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        halo.scale.set(5.2, 5.2, 1);
        halo.position.set(lp.x, lp.y + 6.5, lp.z);
        group.add(halo);
      }
    }
    addInstancedForest(group, trees);

  } else if (course.theme === 'kampot') {
    // 1. Animated Sparkling Praek Tuek Chhu River + Steel Truss Old French Bridge
    const riverMat = new THREE.MeshStandardMaterial({
      color: '#1888ab',
      bumpMap: waterBump,
      bumpScale: 0.32,
      roughness: 0.12,
      metalness: 0.62,
    });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(175, 1800), riverMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(-142, -0.55, -20);
    group.add(river);
    animators.push((t) => { waterBump.offset.set(t * 0.01, t * 0.03); });

    // Steel Truss Bridge Landmark spanning river near start straight
    const bridge = new THREE.Group();
    bridge.position.set(-142, 4.5, -180);
    const steelMat = new THREE.MeshStandardMaterial({ color: '#45505c', metalness: 0.78, roughness: 0.35 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(178, 1.4, 11), steelMat);
    bridge.add(deck);
    for (let x = -72; x <= 72; x += 24) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(11.5, 0.55, 6, 12, Math.PI), steelMat);
      arch.position.set(x, 0.5, -5.2);
      const arch2 = arch.clone(); arch2.position.z = 5.2;
      bridge.add(arch, arch2);
    }
    group.add(bridge);

    // 2. Gleaming Kampot Salt Fields (Reflective Salt Pans + White Sea Salt Pyramids)
    const saltWater = new THREE.MeshStandardMaterial({ color: '#d4f0fa', roughness: 0.08, metalness: 0.55 });
    const saltPileMat = new THREE.MeshStandardMaterial({ color: '#f8f8f4', roughness: 0.82 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const sx = 120 + c * 62;
        const sz = -260 + r * 58;
        if (!isClearOfTrack(spline, sx, sz, 28)) continue;
        const pan = new THREE.Mesh(new THREE.PlaneGeometry(48, 42), saltWater);
        pan.rotation.x = -Math.PI / 2;
        pan.position.set(sx, -0.65, sz);
        group.add(pan);
        const pyramid = new THREE.Mesh(new THREE.ConeGeometry(5.8, 4.5, 4), saltPileMat);
        pyramid.position.set(sx + 10, 1.5, sz + 8);
        group.add(pyramid);
      }
    }

    // 3. Iconic Kampot Giant Durian Roundabout Monument
    const durianGroup = new THREE.Group();
    durianGroup.position.set(175, -0.6, 145);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(13, 15, 3.2, 20), new THREE.MeshStandardMaterial({ color: '#ece5d8', roughness: 0.65 }));
    ped.position.y = 1.6;
    const durian = new THREE.Mesh(
      new THREE.IcosahedronGeometry(7.5, 2),
      new THREE.MeshStandardMaterial({ color: '#9eb83b', roughness: 0.68, flatShading: true })
    );
    durian.scale.set(0.84, 1.24, 0.84);
    durian.position.y = 11.8;
    durianGroup.add(ped, durian);
    group.add(durianGroup);

    // 4. Pastel French Colonial Shophouses with Green Shutters Texture
    const colonialTex = getBuildingFacadeTexture('colonial');
    const colMat = new THREE.MeshStandardMaterial({ map: colonialTex, roughness: 0.72 });
    const terracotta = new THREE.MeshStandardMaterial({ color: '#a8462c', roughness: 0.82 });
    const palms = [];
    for (let i = 0; i < spline.N; i += 24) {
      const smp = spline.samples[i];
      const pos = smp.pos.clone().addScaledVector(smp.right, -(smp.width * 0.5 + 15.5));
      if (isClearOfTrack(spline, pos.x, pos.z, 20)) {
        const house = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(13, 10, 11), colMat); body.position.y = 5;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(10, 4.6, 4), terracotta); roof.rotation.y = Math.PI / 4; roof.position.y = 12.2;
        house.add(body, roof);
        house.position.set(pos.x, pos.y - 0.6, pos.z);
        house.lookAt(smp.pos.x, pos.y, smp.pos.z);
        group.add(house);
      }
      const pp = smp.pos.clone().addScaledVector(smp.right, smp.width * 0.5 + 13);
      if (isClearOfTrack(spline, pp.x, pp.z, 19)) {
        palms.push({ x: pp.x, y: pp.y - 0.5, z: pp.z, h: 11 + (i % 4) * 2, rot: i });
      }
    }
    addInstancedPalms(group, palms);
  }

  scene.add(group);
  return {
    group,
    update(t) {
      for (const fn of animators) fn(t);
    },
    dispose() {
      group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      scene.remove(group);
    },
  };
}
