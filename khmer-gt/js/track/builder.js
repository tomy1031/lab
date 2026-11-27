// js/track/builder.js — Procedural road ribbon, textured asphalt (standard & wet cyber), curbs, barriers, start gantry with 5 GT start lights
import * as THREE from 'three';

function createRoadTexture(course) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const ctx = cv.getContext('2d');
  const rc = course.roadColors;

  ctx.fillStyle = rc.asphalt;
  ctx.fillRect(0, 0, 512, 512);

  // Fine asphalt grain
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = course.isCyber ? (18 + Math.random() * 24) : (32 + Math.random() * 34);
    ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + (course.isCyber ? 14 : 4)})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Dark tire racing grooves
  const groove = ctx.createLinearGradient(0, 0, 512, 0);
  groove.addColorStop(0.0, 'rgba(0,0,0,0)');
  groove.addColorStop(0.24, 'rgba(0,0,0,0.22)');
  groove.addColorStop(0.34, 'rgba(0,0,0,0.06)');
  groove.addColorStop(0.66, 'rgba(0,0,0,0.06)');
  groove.addColorStop(0.76, 'rgba(0,0,0,0.22)');
  groove.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = groove;
  ctx.fillRect(0, 0, 512, 512);

  if (course.isCyber) {
    // Glowing cyber circuit grid lines on wet asphalt
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
    ctx.lineWidth = 2;
    for (let y = 0; y < 512; y += 64) {
      ctx.beginPath();
      ctx.moveTo(28, y);
      ctx.lineTo(484, y);
      ctx.stroke();
    }
    // Glowing edge tracks
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(16, 0, 10, 512);
    ctx.fillStyle = '#ff1f7a';
    ctx.fillRect(486, 0, 10, 512);

    // Center dashed cyber chevron
    ctx.fillStyle = 'rgba(0, 240, 255, 0.72)';
    for (let y = 16; y < 512; y += 128) {
      ctx.fillRect(252, y, 8, 56);
    }
  } else {
    // Classic GT white/gold edge lines
    ctx.fillStyle = rc.line;
    ctx.fillRect(20, 0, 10, 512);
    ctx.fillRect(482, 0, 10, 512);

    // Subtle dashed center line
    ctx.fillStyle = 'rgba(255, 248, 228, 0.48)';
    for (let y = 16; y < 512; y += 128) {
      ctx.fillRect(253, y, 6, 56);
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 140);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createCurbTexture(course) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = course.roadColors.curbA;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = course.roadColors.curbB;
  ctx.fillRect(0, 64, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 220);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRibbon(spline, leftFn, rightFn, yOffset = 0, uvRepeatV = 1) {
  const N = spline.N;
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= N; i++) {
    const s = spline.samples[i % N];
    const lOff = leftFn(s);
    const rOff = rightFn(s);
    const pL = s.pos.clone().addScaledVector(s.right, lOff).addScaledVector(s.normal, yOffset);
    const pR = s.pos.clone().addScaledVector(s.right, rOff).addScaledVector(s.normal, yOffset);

    positions.push(pL.x, pL.y, pL.z, pR.x, pR.y, pR.z);
    normals.push(s.normal.x, s.normal.y, s.normal.z, s.normal.x, s.normal.y, s.normal.z);
    const v = (i / N) * uvRepeatV;
    uvs.push(0, v, 1, v);

    if (i < N) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function createGuardRail(spline, side, wallHeight = 1.15) {
  const N = spline.N;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= N; i++) {
    const s = spline.samples[i % N];
    const offset = side * (s.width * 0.5 + 3.2);
    const base = s.pos.clone().addScaledVector(s.right, offset);
    const top = base.clone().addScaledVector(s.normal, wallHeight);
    positions.push(base.x, base.y - 0.3, base.z, top.x, top.y, top.z);
    uvs.push(i / N * 120, 0, i / N * 120, 1);

    if (i < N) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      if (side > 0) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildTrackMesh(spline, course) {
  const group = new THREE.Group();
  group.name = 'TrackMesh';

  // 1. Main Road Asphalt
  const roadTex = createRoadTexture(course);
  const roadGeo = createRibbon(spline, (s) => -s.width * 0.5, (s) => s.width * 0.5, 0.02, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: course.isWet ? 0.16 : 0.72,
    metalness: course.isWet ? 0.52 : 0.08,
    emissive: course.isCyber ? new THREE.Color('#041b2c') : new THREE.Color('#000000'),
    emissiveIntensity: course.isCyber ? 0.65 : 0,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // 2. Left & Right Curbs (Rumble strips)
  const curbTex = createCurbTexture(course);
  const curbMat = new THREE.MeshStandardMaterial({
    map: curbTex,
    roughness: course.isCyber ? 0.25 : 0.6,
    metalness: course.isCyber ? 0.4 : 0.1,
    emissive: course.isCyber ? new THREE.Color('#301038') : new THREE.Color('#000000'),
    emissiveIntensity: course.isCyber ? 0.8 : 0,
  });
  const curbL = new THREE.Mesh(createRibbon(spline, (s) => -s.width * 0.5 - 1.15, (s) => -s.width * 0.5, 0.06, 1), curbMat);
  const curbR = new THREE.Mesh(createRibbon(spline, (s) => s.width * 0.5, (s) => s.width * 0.5 + 1.15, 0.06, 1), curbMat);
  curbL.receiveShadow = true;
  curbR.receiveShadow = true;
  group.add(curbL, curbR);

  // 3. Runoff Shoulders + Road Underside Skirt (for elevated Bokor & Cyber highways)
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: course.roadColors.shoulder,
    roughness: 0.88,
    metalness: 0.05,
  });
  const shL = new THREE.Mesh(createRibbon(spline, (s) => -s.width * 0.5 - 3.3, (s) => -s.width * 0.5 - 1.15, -0.02, 1), shoulderMat);
  const shR = new THREE.Mesh(createRibbon(spline, (s) => s.width * 0.5 + 1.15, (s) => s.width * 0.5 + 3.3, -0.02, 1), shoulderMat);
  group.add(shL, shR);

  // Support pillars for elevated sections (y > 2.5m)
  const pillarMat = new THREE.MeshStandardMaterial({
    color: course.isCyber ? '#141c2e' : '#585c63',
    roughness: 0.65,
    metalness: course.isCyber ? 0.6 : 0.2,
  });
  const pillarGeo = new THREE.BoxGeometry(2.2, 1, 2.2);
  for (let i = 0; i < spline.N; i += 14) {
    const s = spline.samples[i];
    if (s.pos.y > 2.2) {
      const h = s.pos.y + 8;
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(pillarGeo, pillarMat);
        p.scale.y = h;
        const base = s.pos.clone().addScaledVector(s.right, side * (s.width * 0.42));
        p.position.set(base.x, s.pos.y - h * 0.5 - 0.2, base.z);
        group.add(p);
      }
    }
  }

  // 4. Safety Guardrails (or glowing Cyber energy barriers)
  const railMat = course.isCyber
    ? new THREE.MeshStandardMaterial({
        color: '#0d192b',
        emissive: '#00d4ff',
        emissiveIntensity: 0.65,
        roughness: 0.2,
        metalness: 0.7,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      })
    : new THREE.MeshStandardMaterial({
        color: '#c8ced6',
        roughness: 0.42,
        metalness: 0.55,
        side: THREE.DoubleSide,
      });
  group.add(new THREE.Mesh(createGuardRail(spline, -1, course.isCyber ? 1.45 : 1.05), railMat));
  group.add(new THREE.Mesh(createGuardRail(spline, 1, course.isCyber ? 1.45 : 1.05), railMat));

  // 5. Checkered Start/Finish Line
  const sfFrame = spline.sampleAt(0);
  const sfCv = document.createElement('canvas');
  sfCv.width = 256; sfCv.height = 64;
  const sfc = sfCv.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 16; x++) {
      sfc.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#11141a';
      sfc.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const sfTex = new THREE.CanvasTexture(sfCv);
  sfTex.colorSpace = THREE.SRGBColorSpace;
  const sfMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sfFrame.width, 3.6),
    new THREE.MeshStandardMaterial({ map: sfTex, roughness: 0.5 })
  );
  sfMesh.position.copy(sfFrame.pos).addScaledVector(sfFrame.normal, 0.08);
  const m = new THREE.Matrix4().makeBasis(sfFrame.right, sfFrame.tangent, sfFrame.normal);
  sfMesh.quaternion.setFromRotationMatrix(m);
  group.add(sfMesh);

  // 6. GT Start/Finish Gantry + 5 Red Start Lights
  const gantry = new THREE.Group();
  const gm = new THREE.Matrix4().makeBasis(sfFrame.right, sfFrame.normal, sfFrame.tangent.clone().negate());
  gantry.position.copy(sfFrame.pos);
  gantry.quaternion.setFromRotationMatrix(gm);

  const halfW = sfFrame.width * 0.5 + 2.8;
  const gantryMat = new THREE.MeshStandardMaterial({
    color: course.isCyber ? '#0b101d' : '#1b2029',
    metalness: 0.65,
    roughness: 0.3,
  });
  const colGeo = new THREE.BoxGeometry(1.1, 9.2, 1.4);
  const colL = new THREE.Mesh(colGeo, gantryMat); colL.position.set(-halfW, 4.6, 0);
  const colR = new THREE.Mesh(colGeo, gantryMat); colR.position.set(halfW, 4.6, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 1.2, 2.3, 1.6), gantryMat);
  beam.position.set(0, 8.2, 0);
  gantry.add(colL, colR, beam);

  // Banner sign with course title
  const banCv = document.createElement('canvas');
  banCv.width = 1024; banCv.height = 192;
  const bc = banCv.getContext('2d');
  bc.fillStyle = course.isCyber ? '#061224' : '#141821';
  bc.fillRect(0, 0, 1024, 192);
  bc.fillStyle = course.accentColor;
  bc.fillRect(0, 0, 1024, 12);
  bc.fillRect(0, 180, 1024, 12);
  bc.fillStyle = '#ffffff';
  bc.font = '900 58px "Orbitron", "Noto Sans JP", sans-serif';
  bc.textAlign = 'center';
  bc.textBaseline = 'middle';
  bc.fillText(`KHMER GT  •  ${course.name}`, 512, 98);
  const banTex = new THREE.CanvasTexture(banCv);
  banTex.colorSpace = THREE.SRGBColorSpace;
  const banMat = new THREE.MeshBasicMaterial({ map: banTex });
  const banFront = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 1.9, 2.0), banMat);
  banFront.position.set(0, 8.2, 0.85);
  const banBack = banFront.clone();
  banBack.rotation.y = Math.PI;
  banBack.position.z = -0.85;
  gantry.add(banFront, banBack);

  // 5 Gran Turismo start signal pods
  const startLights = [];
  const podMat = new THREE.MeshStandardMaterial({ color: '#0d1016', roughness: 0.4 });
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 1.55;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.35, 0.45), podMat);
    pod.position.set(x, 6.25, 0.4);
    gantry.add(pod);

    const lampMat = new THREE.MeshStandardMaterial({
      color: '#22080a',
      emissive: '#ff1e2d',
      emissiveIntensity: 0.0,
      roughness: 0.2,
    });
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), lampMat);
    lamp.position.set(x, 6.25, 0.65);
    gantry.add(lamp);
    startLights.push(lampMat);
  }

  group.add(gantry);

  // 7. Corner Chevron Warning Boards on sharp turns
  const chevCv = document.createElement('canvas');
  chevCv.width = 128; chevCv.height = 64;
  const cc = chevCv.getContext('2d');
  cc.fillStyle = course.isCyber ? '#0a1426' : '#161a22';
  cc.fillRect(0, 0, 128, 64);
  cc.fillStyle = course.isCyber ? '#00f0ff' : '#ffd22e';
  for (let x = 8; x < 120; x += 38) {
    cc.beginPath();
    cc.moveTo(x, 8); cc.lineTo(x + 22, 32); cc.lineTo(x, 56);
    cc.lineTo(x + 14, 56); cc.lineTo(x + 36, 32); cc.lineTo(x + 14, 8);
    cc.closePath();
    cc.fill();
  }
  const chevTex = new THREE.CanvasTexture(chevCv);
  chevTex.colorSpace = THREE.SRGBColorSpace;
  const chevMat = new THREE.MeshBasicMaterial({ map: chevTex, side: THREE.DoubleSide });
  const chevGeo = new THREE.PlaneGeometry(3.8, 1.7);

  for (let i = 0; i < spline.N; i += 9) {
    const s = spline.samples[i];
    if (Math.abs(s.curvature) > 0.009) {
      const outside = s.curvature > 0 ? -1 : 1; // right turn -> chevron on left outside
      const board = new THREE.Mesh(chevGeo, chevMat);
      board.position.copy(s.pos)
        .addScaledVector(s.right, outside * (s.width * 0.5 + 3.6))
        .addScaledVector(s.normal, 1.9);
      const bm = new THREE.Matrix4().makeBasis(
        s.tangent.clone().multiplyScalar(outside),
        s.normal,
        s.right.clone().multiplyScalar(-outside)
      );
      board.quaternion.setFromRotationMatrix(bm);
      group.add(board);
    }
  }

  return { group, startLights };
}
