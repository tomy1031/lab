// js/track/scenery.js — Iconic Cambodian 3D landmarks for all 5 courses + Sky Dome + Animated Cyberpunk Angkor Wat 2099
import * as THREE from 'three';

function makeSkyDome(course) {
  const s = course.sky;
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 512;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, s.top);
  g.addColorStop(0.35, s.mid);
  g.addColorStop(0.50, s.horizon);
  g.addColorStop(0.54, s.ground);
  g.addColorStop(1.0, s.ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1250, 32, 20),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  return dome;
}

function makeNeonSign(text, subtext, colorA = '#00f0ff', colorB = '#ff1f7a') {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(5, 10, 22, 0.88)';
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
  ctx.shadowBlur = 18;
  ctx.fillStyle = colorA;
  ctx.font = '900 58px "Orbitron", "Noto Sans JP", sans-serif';
  ctx.fillText(text, 256, 108);

  ctx.shadowColor = colorB;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 32px "Noto Sans JP", sans-serif';
  ctx.fillText(subtext, 256, 178);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
}

// Reusable stylized Angkor Lotus Tower (Prasat)
function buildPrasatTower(scale = 1, mat, glowMat = null) {
  const g = new THREE.Group();
  const tiers = [
    [14, 7, 14, 3.5],
    [11, 6, 11, 9.5],
    [8.2, 5.5, 8.2, 15.0],
    [5.8, 5.0, 5.8, 20.0],
    [3.8, 4.8, 3.8, 24.6],
    [2.1, 4.4, 2.1, 28.8],
  ];
  for (const [w, h, d, y] of tiers) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * scale, h * scale, d * scale), mat);
    m.position.y = y * scale;
    m.castShadow = true;
    g.add(m);
    if (glowMat) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * scale * 1.03, 0.38 * scale, d * scale * 1.03), glowMat);
      strip.position.y = (y + h * 0.45) * scale;
      g.add(strip);
    }
  }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.4 * scale, 6.5 * scale, 6), glowMat || mat);
  spire.position.y = 33.8 * scale;
  g.add(spire);
  return g;
}

// Full 5-Tower Angkor Wat Temple Complex (both classic sandstone AND cyber obsidian+neon!)
function buildAngkorComplex(scale = 1.0, cyber = false) {
  const g = new THREE.Group();
  const stoneMat = cyber
    ? new THREE.MeshStandardMaterial({ color: '#0c1322', roughness: 0.25, metalness: 0.85 })
    : new THREE.MeshStandardMaterial({ color: '#7d6e58', roughness: 0.9, metalness: 0.05 });
  const glowCyan = cyber
    ? new THREE.MeshBasicMaterial({ color: '#00f0ff' })
    : null;
  const glowPink = cyber
    ? new THREE.MeshBasicMaterial({ color: '#ff1f7a' })
    : null;

  // Stepped gallery base
  const base1 = new THREE.Mesh(new THREE.BoxGeometry(92 * scale, 8 * scale, 56 * scale), stoneMat);
  base1.position.y = 4 * scale;
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(66 * scale, 8 * scale, 42 * scale), stoneMat);
  base2.position.y = 11 * scale;
  g.add(base1, base2);

  if (cyber) {
    const trim1 = new THREE.Mesh(new THREE.BoxGeometry(93 * scale, 0.8 * scale, 57 * scale), glowCyan);
    trim1.position.y = 8.1 * scale;
    const trim2 = new THREE.Mesh(new THREE.BoxGeometry(67 * scale, 0.8 * scale, 43 * scale), glowPink);
    trim2.position.y = 15.1 * scale;
    g.add(trim1, trim2);
  }

  // Central tallest lotus tower
  const center = buildPrasatTower(1.32 * scale, stoneMat, glowCyan);
  center.position.y = 14 * scale;
  g.add(center);

  // 4 flanking lotus towers
  const offsets = [
    [-22, 0, -11], [22, 0, -11], [-22, 0, 11], [22, 0, 11],
  ];
  for (const [ox, oy, oz] of offsets) {
    const t = buildPrasatTower(0.92 * scale, stoneMat, cyber ? glowPink : null);
    t.position.set(ox * scale, (14 + oy) * scale, oz * scale);
    g.add(t);
  }

  return g;
}

// Palm tree helper
function makePalmTree(h = 11) {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#5c4632', roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#275c28', roughness: 0.8 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, h, 7), trunkMat);
  trunk.position.y = h * 0.5;
  trunk.rotation.z = (Math.random() - 0.5) * 0.14;
  g.add(trunk);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.75, 4.8, 4), leafMat);
    frond.position.set(Math.cos(a) * 1.9, h - 0.2, Math.sin(a) * 1.9);
    frond.rotation.z = -Math.PI * 0.36;
    frond.rotation.y = -a;
    g.add(frond);
  }
  return g;
}

// Check distance from track so scenery never clips into the road
function isClearOfTrack(spline, x, z, minClearance = 24) {
  const minD2 = minClearance * minClearance;
  for (let i = 0; i < spline.N; i += 4) {
    const p = spline.samples[i].pos;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < minD2) return false;
  }
  return true;
}

export function buildScenery(scene, spline, course) {
  const group = new THREE.Group();
  group.name = `Scenery_${course.id}`;
  const animators = [];

  // Fog & Sky
  const s = course.sky;
  scene.fog = new THREE.Fog(s.fogColor, s.fogNear, s.fogFar);
  group.add(makeSkyDome(course));

  // Directional Sun/Moon + Hemisphere Ambient
  const hemi = new THREE.HemisphereLight(s.ambientColor, s.ground, s.ambientInt);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(s.sunColor, s.sunInt);
  sun.position.set(s.sunPos[0], s.sunPos[1], s.sunPos[2]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 900;
  const d = 260;
  sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
  sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
  group.add(sun);

  // Visible sun disk (non-cyber)
  if (!course.isCyber) {
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(28, 20, 16),
      new THREE.MeshBasicMaterial({ color: s.sunColor, fog: false })
    );
    sunDisc.position.set(s.sunPos[0] * 2.2, s.sunPos[1] * 2.2, s.sunPos[2] * 2.2);
    group.add(sunDisc);
  }

  // Stars for Twilight & Cyber
  if (s.stars > 0) {
    const count = Math.round(500 * s.stars);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI * 0.44;
      const r = 1050;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * r;
      pos[i * 3 + 1] = Math.cos(ph) * r;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sm = new THREE.PointsMaterial({ color: course.isCyber ? '#7ff6ff' : '#fff7e0', size: 3.2, fog: false });
    group.add(new THREE.Points(sg, sm));
  }

  // Base terrain plane
  const groundMat = new THREE.MeshStandardMaterial({
    color: s.ground,
    roughness: course.isCyber ? 0.35 : 0.95,
    metalness: course.isCyber ? 0.4 : 0.0,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.2;
  ground.receiveShadow = true;
  group.add(ground);

  // =========================================================================
  // COURSE-SPECIFIC CAMBODIAN LANDMARKS
  // =========================================================================
  if (course.theme === 'phnompenh') {
    // 1. Mekong & Tonle Sap River (wide shimmering water to the west/left of start straight)
    const waterMat = new THREE.MeshStandardMaterial({
      color: '#1b3e5c',
      roughness: 0.16,
      metalness: 0.72,
      emissive: '#1e1620',
      emissiveIntensity: 0.25,
    });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(520, 1800), waterMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(-295, -0.65, -40);
    group.add(river);

    // 2. Royal Palace (Golden Khmer tiered roofs + white walls) inside the circuit
    const palace = new THREE.Group();
    palace.position.set(145, -1, -150);
    const wallMat = new THREE.MeshStandardMaterial({ color: '#f2e8cf', roughness: 0.7 });
    const goldRoof = new THREE.MeshStandardMaterial({ color: '#e8b63a', roughness: 0.25, metalness: 0.72, emissive: '#593b08', emissiveIntensity: 0.35 });
    const hall = new THREE.Mesh(new THREE.BoxGeometry(46, 12, 24), wallMat);
    hall.position.y = 6;
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(28, 12, 4), goldRoof);
    roof1.rotation.y = Math.PI / 4;
    roof1.scale.set(1.3, 1, 0.72);
    roof1.position.y = 17.5;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.2, 24, 6), goldRoof);
    spire.position.y = 31;
    palace.add(hall, roof1, spire);
    // Flanking pavilions
    for (const sx of [-32, 32]) {
      const pav = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 16), wallMat);
      pav.position.set(sx, 4.5, 4);
      const pr = new THREE.Mesh(new THREE.ConeGeometry(12, 9, 4), goldRoof);
      pr.rotation.y = Math.PI / 4;
      pr.position.set(sx, 13.5, 4);
      palace.add(pav, pr);
    }
    group.add(palace);

    // 3. Independence Monument (Vimean Ekareach — crimson lotus stupa)
    const indep = new THREE.Group();
    indep.position.set(140, -1, 130);
    const lotusMat = new THREE.MeshStandardMaterial({ color: '#9c2d31', roughness: 0.55, metalness: 0.15 });
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(16, 19, 3.5, 16), wallMat);
    plinth.position.y = 1.75;
    indep.add(plinth);
    const stupa = buildPrasatTower(0.95, lotusMat);
    stupa.position.y = 3.2;
    indep.add(stupa);
    group.add(indep);

    // 4. Phnom Penh Skyline / Koh Pich Modern Towers
    const bldMat = new THREE.MeshStandardMaterial({ color: '#222b3d', roughness: 0.35, metalness: 0.65 });
    const winMat = new THREE.MeshBasicMaterial({ color: '#ffd994' });
    const skylinePositions = [
      [440, -290, 26, 95, 26], [465, -180, 22, 130, 22], [430, -50, 28, 82, 24],
      [420, 120, 24, 112, 24], [360, 280, 26, 75, 24], [190, -520, 30, 118, 28],
      [85, -510, 24, 88, 24], [320, -490, 28, 104, 26],
    ];
    for (const [bx, bz, bw, bh, bd] of skylinePositions) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bldMat);
      tower.position.set(bx, bh * 0.5 - 1, bz);
      group.add(tower);
      // Warm illuminated office bands
      for (let y = 14; y < bh - 8; y += 14) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, 2.2, bd + 0.4), winMat);
        band.position.set(bx, y, bz);
        group.add(band);
      }
    }

    // 5. Riverfront Palms & Warm Streetlights along track
    const poleMat = new THREE.MeshStandardMaterial({ color: '#2b303a', metalness: 0.6 });
    const lampGlow = new THREE.MeshBasicMaterial({ color: '#ffcb7d' });
    for (let i = 0; i < spline.N; i += 15) {
      const smp = spline.samples[i];
      const side = (i % 30 === 0) ? -1 : 1;
      const pos = smp.pos.clone().addScaledVector(smp.right, side * (smp.width * 0.5 + 5.8));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 8.5, 6), poleMat);
      pole.position.set(pos.x, pos.y + 4.2, pos.z);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), lampGlow);
      bulb.position.set(pos.x, pos.y + 8.6, pos.z);
      group.add(pole, bulb);

      const palmPos = smp.pos.clone().addScaledVector(smp.right, -side * (smp.width * 0.5 + 11));
      if (isClearOfTrack(spline, palmPos.x, palmPos.z, 19)) {
        const palm = makePalmTree(10 + (i % 5));
        palm.position.set(palmPos.x, palmPos.y - 0.5, palmPos.z);
        group.add(palm);
      }
    }
  } else if (course.theme === 'angkor') {
    // 1. Grand Angkor Wat 5-Tower Temple Complex overlooking the circuit
    const angkor = buildAngkorComplex(1.85, false);
    angkor.position.set(175, -1, -175);
    angkor.rotation.y = -0.35;
    group.add(angkor);

    // 2. Reflective Angkor Moat encircling the temple
    const moatMat = new THREE.MeshStandardMaterial({
      color: '#2c4c57',
      roughness: 0.14,
      metalness: 0.65,
    });
    const moat = new THREE.Mesh(new THREE.PlaneGeometry(280, 230), moatMat);
    moat.rotation.x = -Math.PI / 2;
    moat.position.set(175, -0.55, -175);
    group.add(moat);

    // 3. Bayon-style Ancient Stone Arches spanning the circuit at key straights
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#786a55', roughness: 0.92 });
    const goldAccent = new THREE.MeshStandardMaterial({ color: '#c99c42', roughness: 0.5, metalness: 0.3 });
    for (const idx of [75, 290, 470]) {
      const smp = spline.samples[idx % spline.N];
      const gate = new THREE.Group();
      const gm = new THREE.Matrix4().makeBasis(smp.right, smp.normal, smp.tangent.clone().negate());
      gate.position.copy(smp.pos);
      gate.quaternion.setFromRotationMatrix(gm);
      const hw = smp.width * 0.5 + 4.0;
      const pL = new THREE.Mesh(new THREE.BoxGeometry(3.4, 12, 4.2), stoneMat); pL.position.set(-hw, 6, 0);
      const pR = new THREE.Mesh(new THREE.BoxGeometry(3.4, 12, 4.2), stoneMat); pR.position.set(hw, 6, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 4.4, 3.6, 4.8), stoneMat); top.position.set(0, 12.2, 0);
      const crown = buildPrasatTower(0.32, stoneMat, goldAccent);
      crown.position.set(0, 13.8, 0);
      gate.add(pL, pR, top, crown);
      group.add(gate);
    }

    // 4. Ta Prohm Ancient Jungle Trees & Laterite Ruins along the perimeter
    const canopyMat = new THREE.MeshStandardMaterial({ color: '#244721', roughness: 0.88 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#5c4b39', roughness: 0.95 });
    for (let i = 0; i < 85; i++) {
      const ang = (i / 85) * Math.PI * 2;
      const rad = 240 + (i % 7) * 55;
      const tx = 180 + Math.cos(ang) * rad;
      const tz = -50 + Math.sin(ang) * rad;
      if (!isClearOfTrack(spline, tx, tz, 25)) continue;
      const h = 14 + (i % 6) * 3.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, h, 7), trunkMat);
      trunk.position.set(tx, h * 0.5 - 1, tz);
      const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + (i % 4) * 2.2, 1), canopyMat);
      crown.position.set(tx, h + 1.5, tz);
      group.add(trunk, crown);
    }
  } else if (course.theme === 'cyber') {
    // =========================================================================
    // URA-ANGKOR WAT 2099 — CYBERPUNK MASTERPIECE
    // =========================================================================
    // 1. Colossal Cyber-Angkor Spire Complex at the heart of the circuit
    const cyberAngkor = buildAngkorComplex(2.3, true);
    cyberAngkor.position.set(195, -1, -155);
    cyberAngkor.rotation.y = -0.35;
    group.add(cyberAngkor);

    // Sky-piercing Quantum Laser Beam from the central Cyber Angkor spire
    const laserMat = new THREE.MeshBasicMaterial({
      color: '#00f0ff',
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
    });
    const laser = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 4.5, 480, 12, 1, true), laserMat);
    laser.position.set(195, 290, -155);
    group.add(laser);

    // Rotating Giant Hologram Halo Rings around Cyber Angkor
    const haloMat1 = new THREE.MeshBasicMaterial({ color: '#00f0ff', transparent: true, opacity: 0.72, side: THREE.DoubleSide });
    const haloMat2 = new THREE.MeshBasicMaterial({ color: '#ff1f7a', transparent: true, opacity: 0.65, side: THREE.DoubleSide });
    const halo1 = new THREE.Mesh(new THREE.TorusGeometry(95, 1.4, 8, 64), haloMat1);
    halo1.position.set(195, 92, -155);
    halo1.rotation.x = Math.PI * 0.44;
    const halo2 = new THREE.Mesh(new THREE.TorusGeometry(74, 1.1, 8, 64), haloMat2);
    halo2.position.set(195, 126, -155);
    halo2.rotation.x = Math.PI * 0.56;
    group.add(halo1, halo2);
    animators.push((t) => {
      halo1.rotation.z = t * 0.35;
      halo2.rotation.z = -t * 0.52;
      laserMat.opacity = 0.42 + Math.sin(t * 3.5) * 0.16;
    });

    // 2. Glowing Cyber Naga Tunnel Arches spanning the highway
    const archDark = new THREE.MeshStandardMaterial({ color: '#0c1324', metalness: 0.85, roughness: 0.2 });
    const archCyan = new THREE.MeshBasicMaterial({ color: '#00f0ff' });
    const archPink = new THREE.MeshBasicMaterial({ color: '#ff1f7a' });
    for (let i = 20; i < spline.N; i += 24) {
      const smp = spline.samples[i];
      const arch = new THREE.Group();
      const gm = new THREE.Matrix4().makeBasis(smp.right, smp.normal, smp.tangent.clone().negate());
      arch.position.copy(smp.pos);
      arch.quaternion.setFromRotationMatrix(gm);
      const hw = smp.width * 0.5 + 3.8;
      const isPink = (i / 24) % 2 === 1;
      const stripMat = isPink ? archPink : archCyan;

      const pL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 10.5, 1.4), archDark); pL.position.set(-hw, 5.2, 0);
      const pR = new THREE.Mesh(new THREE.BoxGeometry(1.1, 10.5, 1.4), archDark); pR.position.set(hw, 5.2, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2.4, 1.1, 1.4), archDark); top.position.set(0, 10.4, 0);
      const neonL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 9.8, 0.28), stripMat); neonL.position.set(-hw + 0.6, 5.2, 0.72);
      const neonR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 9.8, 0.28), stripMat); neonR.position.set(hw - 0.6, 5.2, 0.72);
      const neonT = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 0.32, 0.32), stripMat); neonT.position.set(0, 9.9, 0.72);
      arch.add(pL, pR, top, neonL, neonR, neonT);
      group.add(arch);
    }

    // 3. Floating Khmer-Cyberpunk Neon Hologram Billboards
    const billboards = [
      { idx: 48, side: -1, t: 'អង្គរ 2099', s: 'URA-ANGKOR SECTOR 09', ca: '#00f0ff', cb: '#ff1f7a' },
      { idx: 155, side: 1, t: 'NEO KHMER', s: 'HYPERDRIVE CIRCUIT', ca: '#ff1f7a', cb: '#ffd000' },
      { idx: 265, side: -1, t: 'ភ្នំពេញ GT', s: 'PLASMA TURBO LAB', ca: '#00f0ff', cb: '#a6ff00' },
      { idx: 390, side: 1, t: 'GARUDA-X', s: 'QUANTUM OVERDRIVE', ca: '#ffd000', cb: '#00f0ff' },
      { idx: 505, side: -1, t: 'CYBER NAGA', s: 'APEX TERMINAL', ca: '#ff1f7a', cb: '#00f0ff' },
    ];
    for (const b of billboards) {
      const smp = spline.samples[b.idx % spline.N];
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), makeNeonSign(b.t, b.s, b.ca, b.cb));
      sign.position.copy(smp.pos)
        .addScaledVector(smp.right, b.side * (smp.width * 0.5 + 17))
        .addScaledVector(smp.normal, 12.5);
      sign.lookAt(smp.pos.x, smp.pos.y + 8, smp.pos.z);
      group.add(sign);
      const baseY = sign.position.y;
      animators.push((t) => {
        sign.position.y = baseY + Math.sin(t * 2.1 + b.idx) * 0.9;
      });
    }

    // 4. Cyberpunk Megastructure Towers + Vertical Data Streams
    const megaMat = new THREE.MeshStandardMaterial({ color: '#090f1d', roughness: 0.22, metalness: 0.85 });
    for (let i = 0; i < 42; i++) {
      const ang = (i / 42) * Math.PI * 2;
      const rad = 310 + (i % 5) * 68;
      const mx = 200 + Math.cos(ang) * rad;
      const mz = -50 + Math.sin(ang) * rad;
      if (!isClearOfTrack(spline, mx, mz, 36)) continue;
      const bw = 20 + (i % 4) * 8;
      const bh = 75 + (i % 7) * 28;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw), megaMat);
      tower.position.set(mx, bh * 0.5 - 2, mz);
      group.add(tower);

      const stripeMat = i % 2 === 0 ? archCyan : archPink;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.8, 1.6, bw + 0.8), stripeMat);
      stripe.position.set(mx, bh - 8, mz);
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(1.1, bh * 0.85, 1.1), stripeMat);
      vBar.position.set(mx + bw * 0.51, bh * 0.45, mz + bw * 0.51);
      group.add(stripe, vBar);
    }

    // Glowing Grid Floor reflection accents
    const gridHelper = new THREE.GridHelper(1600, 80, '#00f0ff', '#162b52');
    gridHelper.position.y = -1.0;
    group.add(gridHelper);
  } else if (course.theme === 'bokor') {
    // 1. Sea of Clouds below the mountain pass
    const cloudMat = new THREE.MeshBasicMaterial({
      color: '#dce6ed',
      transparent: true,
      opacity: 0.58,
    });
    const clouds = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), cloudMat);
    clouds.rotation.x = -Math.PI / 2;
    clouds.position.y = 4.5;
    group.add(clouds);

    // 2. Old Bokor Palace Hotel & Casino (Historic French Colonial mountain landmark at summit)
    const palace = new THREE.Group();
    palace.position.set(315, 34, 82);
    palace.rotation.y = -0.6;
    const oldWall = new THREE.MeshStandardMaterial({ color: '#9c8f7d', roughness: 0.92 });
    const oldRoof = new THREE.MeshStandardMaterial({ color: '#6b3b2d', roughness: 0.85 });
    const darkWin = new THREE.MeshStandardMaterial({ color: '#1b2026', roughness: 0.4 });
    const mainB = new THREE.Mesh(new THREE.BoxGeometry(44, 15, 18), oldWall); mainB.position.y = 7.5;
    const roofB = new THREE.Mesh(new THREE.BoxGeometry(46, 4.5, 20), oldRoof); roofB.position.y = 17;
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(14, 18, 22), oldWall); wingL.position.set(-22, 9, 2);
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(14, 18, 22), oldWall); wingR.position.set(22, 9, 2);
    palace.add(mainB, roofB, wingL, wingR);
    for (let x = -16; x <= 16; x += 6.4) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.5, 0.5), darkWin);
      w.position.set(x, 8, 9.2);
      palace.add(w);
    }
    group.add(palace);

    // 3. Old Catholic Church spire on the ridge
    const church = new THREE.Group();
    church.position.set(165, 23, -155);
    const chBody = new THREE.Mesh(new THREE.BoxGeometry(12, 11, 22), oldWall); chBody.position.y = 5.5;
    const chTower = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 6), oldWall); chTower.position.set(0, 11, -11);
    const chSpire = new THREE.Mesh(new THREE.ConeGeometry(4.2, 9, 4), oldRoof); chSpire.position.set(0, 26.5, -11);
    church.add(chBody, chTower, chSpire);
    group.add(church);

    // 4. Lok Yeay Mao Monument Silhouette overlooking the valley
    const mao = new THREE.Group();
    mao.position.set(95, 14, 70);
    const maoMat = new THREE.MeshStandardMaterial({ color: '#3b4240', roughness: 0.75 });
    const ped = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), oldWall); ped.position.y = 5;
    const body = new THREE.Mesh(new THREE.ConeGeometry(6.5, 24, 8), maoMat); body.position.y = 21;
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 10), maoMat); head.position.y = 33;
    mao.add(ped, body, head);
    group.add(mao);

    // 5. Mountain Cliffs & Highland Pine/Cloud-Forest Trees
    const rockMat = new THREE.MeshStandardMaterial({ color: '#424b46', roughness: 0.95 });
    const treeMat = new THREE.MeshStandardMaterial({ color: '#213d2a', roughness: 0.9 });
    for (let i = 0; i < 60; i++) {
      const smp = spline.samples[(i * 10) % spline.N];
      const side = i % 2 === 0 ? 1 : -1;
      const p = smp.pos.clone().addScaledVector(smp.right, side * (smp.width * 0.5 + 14 + (i % 4) * 6));
      if (!isClearOfTrack(spline, p.x, p.z, 19)) continue;
      if (i % 3 === 0) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(9 + (i % 5) * 3, 0), rockMat);
        rock.position.set(p.x, p.y - 2, p.z);
        group.add(rock);
      } else {
        const pine = new THREE.Mesh(new THREE.ConeGeometry(4.2, 14 + (i % 4) * 3, 7), treeMat);
        pine.position.set(p.x, p.y + 5, p.z);
        group.add(pine);
      }
    }
  } else if (course.theme === 'kampot') {
    // 1. Praek Tuek Chhu River + Old French Steel Truss Bridge
    const riverMat = new THREE.MeshStandardMaterial({ color: '#1b89a8', roughness: 0.14, metalness: 0.55 });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(160, 1600), riverMat);
    river.rotation.x = -Math.PI / 2;
    river.position.set(-140, -0.5, -20);
    group.add(river);

    // 2. White Gleaming Salt Fields (Salt Pans + Pyramids of Kampot Sea Salt)
    const saltWater = new THREE.MeshStandardMaterial({ color: '#ccebf5', roughness: 0.12, metalness: 0.45 });
    const saltPileMat = new THREE.MeshStandardMaterial({ color: '#f7f7f2', roughness: 0.85 });
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const sx = 120 + c * 62;
        const sz = -260 + r * 58;
        if (!isClearOfTrack(spline, sx, sz, 28)) continue;
        const pan = new THREE.Mesh(new THREE.PlaneGeometry(48, 42), saltWater);
        pan.rotation.x = -Math.PI / 2;
        pan.position.set(sx, -0.8, sz);
        group.add(pan);
        const pyramid = new THREE.Mesh(new THREE.ConeGeometry(5.5, 4.2, 4), saltPileMat);
        pyramid.position.set(sx + 10, 1.2, sz + 8);
        group.add(pyramid);
      }
    }

    // 3. Famous Kampot Giant Durian Roundabout Monument
    const durianGroup = new THREE.Group();
    durianGroup.position.set(175, -1, 145);
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 14, 3.2, 18),
      new THREE.MeshStandardMaterial({ color: '#e6dfd1', roughness: 0.7 })
    );
    ped.position.y = 1.6;
    const durian = new THREE.Mesh(
      new THREE.IcosahedronGeometry(7.2, 1),
      new THREE.MeshStandardMaterial({ color: '#9ab33b', roughness: 0.7, flatShading: true })
    );
    durian.scale.set(0.85, 1.22, 0.85);
    durian.position.y = 11.5;
    durianGroup.add(ped, durian);
    group.add(durianGroup);

    // 4. Pastel French Colonial Shophouses along the riverfront & town
    const pastelColors = ['#f2d479', '#f0b89c', '#e8e2d0', '#b8dcd4', '#e5c17d'];
    const terracotta = new THREE.MeshStandardMaterial({ color: '#a8482f', roughness: 0.82 });
    for (let i = 0; i < spline.N; i += 28) {
      const smp = spline.samples[i];
      const pos = smp.pos.clone().addScaledVector(smp.right, -(smp.width * 0.5 + 15));
      if (!isClearOfTrack(spline, pos.x, pos.z, 20)) continue;
      const house = new THREE.Group();
      const bMat = new THREE.MeshStandardMaterial({ color: pastelColors[i % pastelColors.length], roughness: 0.75 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(12, 9.5, 10), bMat); body.position.y = 4.75;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(9.2, 4.2, 4), terracotta); roof.rotation.y = Math.PI / 4; roof.position.y = 11.5;
      house.add(body, roof);
      house.position.set(pos.x, pos.y - 0.8, pos.z);
      house.lookAt(smp.pos.x, pos.y, smp.pos.z);
      group.add(house);
    }

    // 5. Kampot Pepper Plantation Green Trellis Rows & Distant Elephant Mountains
    const pepperMat = new THREE.MeshStandardMaterial({ color: '#2b6b33', roughness: 0.85 });
    for (let i = 0; i < 36; i++) {
      const px = 420 + (i % 6) * 16;
      const pz = -260 + Math.floor(i / 6) * 28;
      if (!isClearOfTrack(spline, px, pz, 26)) continue;
      const trellis = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 5.2, 6), pepperMat);
      trellis.position.set(px, 2.2, pz);
      group.add(trellis);
    }

    const mtnMat = new THREE.MeshStandardMaterial({ color: '#3b646e', roughness: 0.95 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const mtn = new THREE.Mesh(new THREE.ConeGeometry(160 + (i % 3) * 50, 120 + (i % 4) * 35, 6), mtnMat);
      mtn.position.set(160 + Math.cos(a) * 680, 50, -40 + Math.sin(a) * 680);
      group.add(mtn);
    }
  }

  scene.add(group);
  return {
    group,
    update(t) {
      for (const fn of animators) fn(t);
    },
    dispose() {
      scene.remove(group);
    },
  };
}
