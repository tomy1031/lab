// js/track/builder.js — Commercial-grade circuit roadbed: PBR Asphalt (Bump+Roughness wet puddles),
// 3D Curbs, Instanced Guardrail Posts, Grandstands with Crowd, Braking Distance Boards, Start Grid Boxes & 5-Light Gantry
import * as THREE from 'three';
import { getAsphaltTextures, getCrowdTexture } from '../engine/textures.js';

function createCurbTexture(course) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = course.roadColors.curbA;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = course.roadColors.curbB;
  ctx.fillRect(0, 64, 64, 64);
  // Subtle grime edge
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.32)');
  g.addColorStop(0.2, 'rgba(0,0,0,0)');
  g.addColorStop(0.8, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 240);
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
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
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

function createGuardRail(spline, side, wallBottom = 0.25, wallTop = 1.05, distExtra = 3.2) {
  const N = spline.N;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= N; i++) {
    const s = spline.samples[i % N];
    const offset = side * (s.width * 0.5 + distExtra);
    const base = s.pos.clone().addScaledVector(s.right, offset).addScaledVector(s.normal, wallBottom);
    const top = s.pos.clone().addScaledVector(s.right, offset).addScaledVector(s.normal, wallTop);
    positions.push(base.x, base.y, base.z, top.x, top.y, top.z);
    uvs.push((i / N) * 140, 0, (i / N) * 140, 1);

    if (i < N) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
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

function buildGrandstand(course) {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({
    color: course.isCyber ? '#10182b' : '#242934',
    metalness: 0.65,
    roughness: 0.35,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: course.isCyber ? '#0a1426' : '#e6ebf2',
    metalness: 0.35,
    roughness: 0.4,
  });
  const crowdMat = new THREE.MeshStandardMaterial({
    map: getCrowdTexture(),
    roughness: 0.85,
  });

  // Tiered spectator slope (single textured mesh!)
  const standW = 54;
  const seats = new THREE.Mesh(new THREE.BoxGeometry(standW, 9.5, 11), crowdMat);
  seats.position.set(0, 4.8, 0);
  seats.rotation.x = 0.42;
  g.add(seats);

  // Concrete rear wall & base deck
  const base = new THREE.Mesh(new THREE.BoxGeometry(standW + 2, 3.2, 14), frameMat);
  base.position.set(0, 1.4, 2.2);
  g.add(base);

  // Cantilevered GT Stadium Canopy Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(standW + 4, 0.55, 14.5), roofMat);
  roof.position.set(0, 11.8, -0.5);
  roof.rotation.x = -0.14;
  g.add(roof);

  // Accent light strip along canopy lip
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(standW + 4, 0.28, 0.35),
    new THREE.MeshBasicMaterial({ color: course.accentColor })
  );
  strip.position.set(0, 12.6, -7.5);
  g.add(strip);

  // Rear steel support columns
  for (let x = -24; x <= 24; x += 12) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.6, 12.2, 0.6), frameMat);
    col.position.set(x, 6.0, 6.2);
    g.add(col);
  }
  return g;
}

export function buildTrackMesh(spline, course) {
  const group = new THREE.Group();
  group.name = 'TrackMesh';

  // 1. Main Road Asphalt with Full PBR (Albedo + RoughnessMap + BumpMap)
  const asphalt = getAsphaltTextures(course);
  const roadGeo = createRibbon(spline, (s) => -s.width * 0.5, (s) => s.width * 0.5, 0.02, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphalt.map,
    roughnessMap: asphalt.roughnessMap,
    bumpMap: asphalt.bumpMap,
    bumpScale: course.isWet ? 0.03 : 0.06,
    roughness: course.isWet ? 0.85 : 0.95, // modulated by roughnessMap (puddles hit ~0.09!)
    metalness: course.isWet ? 0.58 : 0.06,
    emissive: course.isCyber ? new THREE.Color('#041c30') : new THREE.Color('#000000'),
    emissiveIntensity: course.isCyber ? 0.55 : 0,
  });
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);

  // 2. Sculpted Raised Rumble Curbs
  const curbTex = createCurbTexture(course);
  const curbMat = new THREE.MeshStandardMaterial({
    map: curbTex,
    roughness: course.isCyber ? 0.25 : 0.55,
    metalness: course.isCyber ? 0.45 : 0.08,
    emissive: course.isCyber ? new THREE.Color('#2d0d36') : new THREE.Color('#000000'),
    emissiveIntensity: course.isCyber ? 0.85 : 0,
  });
  const curbL = new THREE.Mesh(createRibbon(spline, (s) => -s.width * 0.5 - 1.2, (s) => -s.width * 0.5, 0.07, 1), curbMat);
  const curbR = new THREE.Mesh(createRibbon(spline, (s) => s.width * 0.5, (s) => s.width * 0.5 + 1.2, 0.07, 1), curbMat);
  curbL.receiveShadow = true;
  curbR.receiveShadow = true;
  group.add(curbL, curbR);

  // 3. Runoff Shoulders + Roadbed Deck Thickness (gives bridges & mountain roads real architectural mass)
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: course.roadColors.shoulder,
    roughness: 0.88,
    metalness: 0.08,
  });
  group.add(
    new THREE.Mesh(createRibbon(spline, (s) => -s.width * 0.5 - 3.3, (s) => -s.width * 0.5 - 1.2, -0.02, 1), shoulderMat),
    new THREE.Mesh(createRibbon(spline, (s) => s.width * 0.5 + 1.2, (s) => s.width * 0.5 + 3.3, -0.02, 1), shoulderMat)
  );

  // Concrete side retaining apron under road edges (eliminates any thin floating paper look)
  const skirtMat = new THREE.MeshStandardMaterial({
    color: course.isCyber ? '#0b1322' : '#4a4e54',
    roughness: 0.82,
    metalness: course.isCyber ? 0.5 : 0.1,
    side: THREE.DoubleSide,
  });
  group.add(
    new THREE.Mesh(createGuardRail(spline, -1, -2.4, -0.02, 3.3), skirtMat),
    new THREE.Mesh(createGuardRail(spline, 1, -2.4, -0.02, 3.3), skirtMat)
  );

  // Instanced Viaduct Support Pillars strictly underneath elevated road decks (never piercing road!)
  const pillarPositions = [];
  for (let i = 0; i < spline.N; i += 14) {
    const s = spline.samples[i];
    if (s.pos.y > 3.2) {
      const h = s.pos.y + 10;
      for (const side of [-1, 1]) {
        const base = s.pos.clone().addScaledVector(s.right, side * (s.width * 0.42));
        pillarPositions.push({ x: base.x, y: s.pos.y - h * 0.5 - 1.4, z: base.z, h });
      }
    }
  }
  if (pillarPositions.length) {
    const pGeo = new THREE.BoxGeometry(1.9, 1, 1.9);
    const pMat = new THREE.MeshStandardMaterial({
      color: course.isCyber ? '#0f182a' : '#585d64',
      roughness: 0.62,
      metalness: course.isCyber ? 0.65 : 0.2,
    });
    const inst = new THREE.InstancedMesh(pGeo, pMat, pillarPositions.length);
    const dummy = new THREE.Object3D();
    pillarPositions.forEach((p, idx) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(1, p.h, 1);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  // 4. Armco Steel Guardrails + Instanced Posts (or Glowing Cyber Energy Rails)
  const railMat = course.isCyber
    ? new THREE.MeshStandardMaterial({
        color: '#0b182c',
        emissive: '#00d8ff',
        emissiveIntensity: 0.72,
        roughness: 0.18,
        metalness: 0.75,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      })
    : new THREE.MeshStandardMaterial({
        color: '#cdd3dc',
        roughness: 0.36,
        metalness: 0.68,
        side: THREE.DoubleSide,
      });
  group.add(
    new THREE.Mesh(createGuardRail(spline, -1, 0.38, course.isCyber ? 1.38 : 1.02, 3.2), railMat),
    new THREE.Mesh(createGuardRail(spline, 1, 0.38, course.isCyber ? 1.38 : 1.02, 3.2), railMat)
  );

  // Instanced Guardrail Steel Posts (1 draw call for 200 posts!)
  const postStep = 6;
  const postCount = Math.floor(spline.N / postStep) * 2;
  const postGeo = new THREE.BoxGeometry(0.16, 1.12, 0.16);
  const postMat = new THREE.MeshStandardMaterial({
    color: course.isCyber ? '#00f0ff' : '#4a505c',
    emissive: course.isCyber ? '#00aacc' : '#000000',
    emissiveIntensity: course.isCyber ? 0.9 : 0,
    metalness: 0.7,
    roughness: 0.35,
  });
  const postsInst = new THREE.InstancedMesh(postGeo, postMat, postCount);
  const pm = new THREE.Matrix4();
  let pi = 0;
  for (let i = 0; i < spline.N && pi + 1 < postCount; i += postStep) {
    const s = spline.samples[i];
    for (const side of [-1, 1]) {
      const pt = s.pos.clone().addScaledVector(s.right, side * (s.width * 0.5 + 3.35)).addScaledVector(s.normal, 0.52);
      pm.makeTranslation(pt.x, pt.y, pt.z);
      postsInst.setMatrixAt(pi++, pm);
    }
  }
  postsInst.instanceMatrix.needsUpdate = true;
  group.add(postsInst);

  // 5. Checkered Start/Finish Line + Painted Starting Grid Boxes (instanced 1 draw call)
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
    new THREE.MeshStandardMaterial({ map: sfTex, roughness: 0.55 })
  );
  sfMesh.position.copy(sfFrame.pos).addScaledVector(sfFrame.normal, 0.06);
  sfMesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sfFrame.right, sfFrame.tangent, sfFrame.normal));
  group.add(sfMesh);

  const gridInst = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2.6, 0.25),
    new THREE.MeshBasicMaterial({ color: course.isCyber ? '#00f0ff' : '#eef1f5', transparent: true, opacity: 0.72 }),
    8
  );
  const gObj = new THREE.Object3D();
  for (let idx = 0; idx < 8; idx++) {
    const row = Math.floor(idx / 2);
    const col = idx % 2;
    const gs = spline.wrapS(spline.length - 12 - row * 10.5 - col * 3.5);
    const gd = col === 0 ? -3.4 : 3.4;
    const gf = spline.sampleAt(gs);
    gObj.position.copy(gf.pos).addScaledVector(gf.right, gd).addScaledVector(gf.tangent, 2.5).addScaledVector(gf.normal, 0.06);
    gObj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(gf.right, gf.tangent, gf.normal));
    gObj.updateMatrix();
    gridInst.setMatrixAt(idx, gObj.matrix);
  }
  gridInst.instanceMatrix.needsUpdate = true;
  group.add(gridInst);

  // 6. Grand GT Start/Finish Gantry + 5 Red Start Lights
  const gantry = new THREE.Group();
  gantry.position.copy(sfFrame.pos);
  gantry.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(sfFrame.right, sfFrame.normal, sfFrame.tangent.clone().negate())
  );

  const halfW = sfFrame.width * 0.5 + 3.2;
  const gantryMat = new THREE.MeshStandardMaterial({
    color: course.isCyber ? '#09101f' : '#1b2029',
    metalness: 0.72,
    roughness: 0.28,
  });
  const colGeo = new THREE.BoxGeometry(1.2, 9.6, 1.5);
  const colL = new THREE.Mesh(colGeo, gantryMat); colL.position.set(-halfW, 4.8, 0);
  const colR = new THREE.Mesh(colGeo, gantryMat); colR.position.set(halfW, 4.8, 0);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 1.4, 2.4, 1.7), gantryMat);
  beam.position.set(0, 8.4, 0);
  gantry.add(colL, colR, beam);

  const banCv = document.createElement('canvas');
  banCv.width = 1024; banCv.height = 192;
  const bc = banCv.getContext('2d');
  bc.fillStyle = course.isCyber ? '#051226' : '#121620';
  bc.fillRect(0, 0, 1024, 192);
  bc.fillStyle = course.accentColor;
  bc.fillRect(0, 0, 1024, 14);
  bc.fillRect(0, 178, 1024, 14);
  bc.fillStyle = '#ffffff';
  bc.font = '900 56px "Orbitron", "Noto Sans JP", sans-serif';
  bc.textAlign = 'center';
  bc.textBaseline = 'middle';
  bc.fillText(`KHMER GT  •  ${course.name}`, 512, 98);
  const banTex = new THREE.CanvasTexture(banCv);
  banTex.colorSpace = THREE.SRGBColorSpace;
  const banMat = new THREE.MeshBasicMaterial({ map: banTex });
  const banFront = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 1.9, 2.0), banMat);
  banFront.position.set(0, 8.4, 0.9);
  const banBack = banFront.clone();
  banBack.rotation.y = Math.PI;
  banBack.position.z = -0.9;
  gantry.add(banFront, banBack);

  const startLights = [];
  const podMat = new THREE.MeshStandardMaterial({ color: '#0c1017', roughness: 0.35 });
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 1.55;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.38, 0.48), podMat);
    pod.position.set(x, 6.4, 0.42);
    gantry.add(pod);

    const lampMat = new THREE.MeshStandardMaterial({
      color: '#22080a',
      emissive: '#ff1e2d',
      emissiveIntensity: 0.0,
      roughness: 0.2,
    });
    const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), lampMat);
    lamp.position.set(x, 6.4, 0.68);
    gantry.add(lamp);
    startLights.push(lampMat);
  }
  group.add(gantry);

  // 7. Start Straight GT Grandstand (placed on LEFT for Angkor & Cyber so the iconic 5-tower Angkor Wat on the right is 100% unobstructed!)
  if (course.theme !== 'bokor') {
    const standFrame = spline.sampleAt(spline.length - 38);
    const stand = buildGrandstand(course);
    const onLeft = course.theme === 'angkor' || course.theme === 'cyber';
    const side = onLeft ? -1 : 1;
    stand.position.copy(standFrame.pos).addScaledVector(standFrame.right, side * (standFrame.width * 0.5 + 15.5));
    stand.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        standFrame.tangent.clone().multiplyScalar(side),
        standFrame.normal,
        standFrame.right.clone().multiplyScalar(side)
      )
    );
    group.add(stand);
  }

  // 8. Instanced Corner Chevron Warning Boards (1 draw call total!)
  const chevCv = document.createElement('canvas');
  chevCv.width = 128; chevCv.height = 64;
  const cc = chevCv.getContext('2d');
  cc.fillStyle = course.isCyber ? '#071224' : '#151922';
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

  const chevList = [];
  for (let i = 0; i < spline.N; i += 8) {
    const s = spline.samples[i];
    if (Math.abs(s.curvature) > 0.0085) chevList.push(s);
  }
  if (chevList.length) {
    const chevInst = new THREE.InstancedMesh(chevGeo, chevMat, chevList.length);
    const co = new THREE.Object3D();
    chevList.forEach((s, idx) => {
      const outside = s.curvature > 0 ? -1 : 1;
      co.position.copy(s.pos)
        .addScaledVector(s.right, outside * (s.width * 0.5 + 3.8))
        .addScaledVector(s.normal, 1.9);
      co.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          s.tangent.clone().multiplyScalar(outside),
          s.normal,
          s.right.clone().multiplyScalar(-outside)
        )
      );
      co.updateMatrix();
      chevInst.setMatrixAt(idx, co.matrix);
    });
    chevInst.instanceMatrix.needsUpdate = true;
    group.add(chevInst);
  }

  return { group, startLights };
}
