// js/car/model.js — Aerodynamic sculpted 3D Gran Turismo car models (ExtrudeGeometry coupe/hyper/gt3/cyber silhouettes)
import * as THREE from 'three';

function createAerodynamicProfile(style) {
  const shape = new THREE.Shape();
  // Side profile in (z: -2.25 front .. +2.25 rear, y: 0.22 .. 1.24)
  if (style === 'hyper' || style === 'cyber') {
    shape.moveTo(-2.35, 0.24);
    shape.lineTo(-2.30, 0.44);
    shape.quadraticCurveTo(-1.85, 0.62, -1.15, 0.68);
    shape.lineTo(-0.45, 1.06); // sleek hypercar windshield
    shape.quadraticCurveTo(0.15, 1.14, 0.72, 1.02);
    shape.lineTo(1.88, 0.74);  // fastback engine deck
    shape.lineTo(2.32, 0.66);
    shape.lineTo(2.34, 0.28);
    shape.closePath();
  } else if (style === 'roadster') {
    shape.moveTo(-2.18, 0.24);
    shape.lineTo(-2.14, 0.50);
    shape.quadraticCurveTo(-1.60, 0.68, -0.82, 0.72);
    shape.lineTo(-0.32, 1.05); // raked roadster windshield
    shape.lineTo(-0.14, 1.05);
    shape.lineTo(-0.18, 0.74); // open cockpit deck
    shape.lineTo(1.25, 0.74);
    shape.lineTo(2.14, 0.70);
    shape.lineTo(2.16, 0.28);
    shape.closePath();
  } else if (style === 'rally') {
    shape.moveTo(-2.22, 0.26);
    shape.lineTo(-2.18, 0.58);
    shape.lineTo(-1.12, 0.74);
    shape.lineTo(-0.52, 1.24);
    shape.lineTo(0.82, 1.24);
    shape.lineTo(1.42, 0.84);
    shape.lineTo(2.18, 0.78);
    shape.lineTo(2.20, 0.28);
    shape.closePath();
  } else {
    // Classic GT3 / GT-R Sculpted Fastback Coupe
    shape.moveTo(-2.26, 0.24);
    shape.lineTo(-2.22, 0.50);
    shape.quadraticCurveTo(-1.72, 0.68, -1.04, 0.73);
    shape.lineTo(-0.36, 1.15); // raked GT windshield
    shape.lineTo(0.46, 1.16);  // roofline
    shape.lineTo(1.56, 0.80);  // fastback rear glass
    shape.lineTo(2.24, 0.74);
    shape.lineTo(2.26, 0.28);
    shape.closePath();
  }
  return shape;
}

export function buildCarModel(carSpec, overrideColors = null) {
  const root = new THREE.Group();
  const bodyColor = overrideColors?.color || carSpec.color;
  const accentColor = overrideColors?.accent || carSpec.accent;
  const style = carSpec.bodyStyle || 'coupe';
  const isCyber = style === 'cyber';
  const isHyper = style === 'hyper' || isCyber;

  const paintMat = new THREE.MeshPhysicalMaterial({
    color: bodyColor,
    metalness: isCyber ? 0.85 : 0.65,
    roughness: isCyber ? 0.16 : 0.20,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });

  const accentMat = new THREE.MeshPhysicalMaterial({
    color: accentColor,
    metalness: 0.5,
    roughness: 0.22,
    clearcoat: 0.9,
    emissive: isCyber ? new THREE.Color(accentColor) : new THREE.Color('#000000'),
    emissiveIntensity: isCyber ? 1.6 : 0,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: carSpec.trim || '#13161c',
    metalness: 0.4,
    roughness: 0.38,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: '#08101a',
    metalness: 0.25,
    roughness: 0.05,
    clearcoat: 1.0,
    opacity: 0.92,
    transparent: true,
  });

  const headLightMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: isCyber ? '#00f0ff' : '#eef7ff',
    emissiveIntensity: 2.6,
    roughness: 0.08,
  });

  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: '#6b0810',
    emissive: '#ff1224',
    emissiveIntensity: 0.85,
    roughness: 0.18,
  });

  const chassis = new THREE.Group();
  root.add(chassis);

  // Interior-hidden group (hidden when player is inside cockpit / VR view so windshield & roof never block view)
  const upperExterior = new THREE.Group();
  chassis.add(upperExterior);

  const bodyW = isHyper ? 2.04 : 1.96;
  const bodyL = isHyper ? 4.66 : 4.48;

  // 1. Sculpted Aerodynamic Core Fuselage via ExtrudeGeometry (rotated so profile X -> -Z length, Y -> Y height, extrude depth -> X width)
  const mainShape = createAerodynamicProfile(style);
  const coreWidth = bodyW * 0.78;
  const coreGeo = new THREE.ExtrudeGeometry(mainShape, {
    depth: coreWidth,
    bevelEnabled: true,
    bevelThickness: 0.11,
    bevelSize: 0.08,
    bevelSegments: 3,
  });
  // Rotate so shape's X axis aligns with car Z axis (front at -Z, rear at +Z) and center along X
  coreGeo.translate(0, 0, -coreWidth * 0.5);
  coreGeo.rotateY(-Math.PI / 2);
  const coreMesh = new THREE.Mesh(coreGeo, paintMat);
  coreMesh.castShadow = true;
  coreMesh.receiveShadow = true;
  upperExterior.add(coreMesh);

  // Lower nose & hood visible from cockpit view too (so driver sees realistic hood ahead!)
  const hoodMesh = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.84, 0.24, 1.38), paintMat);
  hoodMesh.position.set(0, 0.56, -1.50);
  hoodMesh.rotation.x = 0.13;
  chassis.add(hoodMesh);

  // Hood racing stripe visible even from cockpit
  const hoodStripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.015, 1.42), accentMat);
  hoodStripe.position.set(0, 0.68, -1.50);
  hoodStripe.rotation.x = 0.13;
  chassis.add(hoodStripe);

  // 2. Sculpted Wide GT Side Pontoons & Muscular Wheel Arches
  for (const sx of [-1, 1]) {
    const pontoon = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, bodyL * 0.84), paintMat);
    pontoon.position.set(sx * (bodyW * 0.42), 0.48, 0.04);
    pontoon.castShadow = true;
    chassis.add(pontoon);

    // Side aero skirt + colored blade
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 2.32), carbonMat);
    skirt.position.set(sx * (bodyW * 0.51), 0.24, 0.05);
    chassis.add(skirt);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.045, 2.24), accentMat);
    blade.position.set(sx * (bodyW * 0.53), 0.30, 0.05);
    chassis.add(blade);

    // Sculpted side mirror on door shoulder
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.14), isCyber ? accentMat : paintMat);
    mirror.position.set(sx * (bodyW * 0.52), 0.86, -0.58);
    chassis.add(mirror);
  }

  // 3. Tinted Raked Windshield, Side Glass & Fastback Rear Window
  const winW = bodyW * 0.72;
  const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(winW, 0.82), glassMat);
  frontGlass.position.set(0, 0.94, -0.72);
  frontGlass.rotation.x = -Math.PI * 0.32;
  upperExterior.add(frontGlass);

  if (style !== 'roadster') {
    const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(winW * 0.92, 0.96), glassMat);
    rearGlass.position.set(0, 0.98, 0.98);
    rearGlass.rotation.x = Math.PI * 0.36;
    rearGlass.rotation.y = Math.PI;
    upperExterior.add(rearGlass);
  }

  // Side window dark glass panels
  for (const sx of [-1, 1]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 1.32), glassMat);
    sideGlass.position.set(sx * (coreWidth * 0.5 + 0.09), 0.94, 0.08);
    upperExterior.add(sideGlass);
  }

  // Carbon floorpan, Front Splitter & Rear Diffuser
  const floor = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.02, 0.10, bodyL * 1.02), carbonMat);
  floor.position.set(0, 0.22, 0);
  chassis.add(floor);

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 1.06, 0.05, 0.44), carbonMat);
  splitter.position.set(0, 0.19, -bodyL * 0.51);
  chassis.add(splitter);

  // Aggressive Front Grille Intake
  const grille = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.62, 0.20, 0.08), carbonMat);
  grille.position.set(0, 0.34, -bodyL * 0.50);
  chassis.add(grille);

  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.92, 0.24, 0.28), carbonMat);
  diffuser.position.set(0, 0.31, bodyL * 0.49);
  chassis.add(diffuser);

  // Rear GT Swan-Neck Wing
  const wingH = isHyper || style === 'gt3' ? 0.44 : style === 'rally' ? 0.36 : 0.24;
  const wingW = bodyW * (style === 'gt3' || isHyper ? 1.05 : 0.94);
  const wingY = 0.76 + wingH;
  const wingZ = bodyL * 0.44;

  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.05, 0.32), isCyber ? accentMat : carbonMat);
  wingBlade.position.set(0, wingY, wingZ);
  wingBlade.rotation.x = 0.11;
  upperExterior.add(wingBlade);

  for (const sx of [-0.46, 0.46]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, wingH, 0.20), carbonMat);
    strut.position.set(sx, 0.76 + wingH * 0.5, wingZ);
    upperExterior.add(strut);
  }
  for (const sx of [-wingW * 0.5, wingW * 0.5]) {
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.40), accentMat);
    endplate.position.set(sx, wingY, wingZ);
    upperExterior.add(endplate);
  }

  // Twin Exhausts & ERS Boost Flame Cones
  const flameMat = new THREE.MeshBasicMaterial({
    color: isCyber ? '#00f0ff' : '#4ecbff',
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const flames = [];
  for (const sx of [-0.46, 0.46]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.24, 12), carbonMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx, 0.29, bodyL * 0.51);
    chassis.add(pipe);

    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.95, 8), flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(sx, 0.29, bodyL * 0.51 + 0.48);
    chassis.add(flame);
    flames.push(flame);
  }

  // Sleek Angled LED Headlights & Full-Width GT Tail Light Bar
  for (const sx of [-0.66, 0.66]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.16), headLightMat);
    hl.position.set(sx, 0.52, -bodyL * 0.47);
    hl.rotation.y = sx * 0.16;
    chassis.add(hl);
  }
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.86, 0.09, 0.08), brakeLightMat);
  tailBar.position.set(0, 0.63, bodyL * 0.49);
  chassis.add(tailBar);

  // Cyber Prototype Underglow & Neon Trim
  if (isCyber) {
    const underglow = new THREE.Mesh(
      new THREE.PlaneGeometry(bodyW * 1.16, bodyL * 1.06),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      })
    );
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.y = 0.07;
    chassis.add(underglow);
  }

  // 4 High-Detail Racing Wheels (Multi-spoke alloy rims + Brake Calipers + Low-profile Tires)
  const tireMat = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.82, metalness: 0.06 });
  const rimMat = new THREE.MeshStandardMaterial({
    color: carSpec.wheelColor || '#c8ced6',
    metalness: 0.86,
    roughness: 0.18,
    emissive: isCyber ? new THREE.Color(carSpec.wheelColor) : new THREE.Color('#000000'),
    emissiveIntensity: isCyber ? 0.55 : 0,
  });
  const caliperMat = new THREE.MeshStandardMaterial({ color: carSpec.caliperColor || '#d92b3a', roughness: 0.3 });

  const wheels = [];
  const frontPivots = [];
  const wheelCoords = [
    { x: -bodyW * 0.47, z: -1.36, front: true },
    { x: bodyW * 0.47, z: -1.36, front: true },
    { x: -bodyW * 0.48, z: 1.34, front: false },
    { x: bodyW * 0.48, z: 1.34, front: false },
  ];

  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.30, 22);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.31, 14);
  rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.32, 0.44, 0.05);

  for (const wc of wheelCoords) {
    const pivot = new THREE.Group();
    pivot.position.set(wc.x, 0.36, wc.z);
    root.add(pivot);
    if (wc.front) frontPivots.push(pivot);

    const spinGroup = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    spinGroup.add(tire, rim);
    for (let k = 0; k < 5; k++) {
      const spk = new THREE.Mesh(spokeGeo, rimMat);
      spk.rotation.x = (k / 5) * Math.PI;
      spinGroup.add(spk);
    }
    pivot.add(spinGroup);
    wheels.push(spinGroup);

    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), caliperMat);
    caliper.position.set(wc.x > 0 ? -0.06 : 0.06, 0.05, 0.12);
    pivot.add(caliper);
  }

  return {
    root,
    chassis,
    upperExterior,
    wheels,
    frontPivots,
    brakeLightMat,
    flameMat,
    setInteriorMode(inside) {
      upperExterior.visible = !inside;
    },
    setVisualState({ steer = 0, wheelSpin = 0, brake = 0, roll = 0, pitch = 0, boost = false }) {
      for (const p of frontPivots) p.rotation.y = -steer * 0.42;
      for (const w of wheels) w.rotation.x -= wheelSpin;
      chassis.rotation.z = roll;
      chassis.rotation.x = pitch;
      brakeLightMat.emissiveIntensity = brake > 0.15 ? 3.5 : 0.8;
      flameMat.opacity = boost ? 0.9 : 0;
      const fs = boost ? 0.9 + Math.random() * 0.55 : 0.01;
      for (const f of flames) f.scale.set(1, fs, 1);
    },
  };
}
