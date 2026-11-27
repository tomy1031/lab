// js/vr/cockpit.js — Commercial-grade 3D Carbon GT3 Cockpit with textured carbon dash, paddle shifters,
// 9-LED shift bar, high-res OLED telemetry screen, sun-strip banner & 3D VR Hand Tracking Skeleton.
import * as THREE from 'three';
import { getCarbonTextures } from '../engine/textures.js';

const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];

export class GTCockpit {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'GTCockpit';
    this.group.visible = false;

    const carbonTex = getCarbonTextures();
    const carbonMat = new THREE.MeshStandardMaterial({
      map: carbonTex.map,
      color: '#2d3340',
      roughness: 0.34,
      metalness: 0.55,
    });
    const alcantaraMat = new THREE.MeshStandardMaterial({
      color: '#20242e',
      roughness: 0.90,
      metalness: 0.08,
    });
    const brushedAlu = new THREE.MeshStandardMaterial({
      color: '#c2cad6',
      roughness: 0.22,
      metalness: 0.88,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#e8b954',
      roughness: 0.24,
      metalness: 0.80,
      emissive: '#593c06',
      emissiveIntensity: 0.35,
    });

    // Dedicated interior ambient fill so carbon weave & steering grips always read crisply
    const dashLight = new THREE.PointLight('#dceeff', 1.65, 2.5);
    dashLight.position.set(0, 0.16, -0.32);
    this.group.add(dashLight);

    // Sculpted Curved Dashboard Cowl + Instrument Binnacle Hood
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.18, 0.48), alcantaraMat);
    dash.position.set(0, -0.40, -0.78);
    this.group.add(dash);

    const carbonDeck = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.032, 0.50), carbonMat);
    carbonDeck.position.set(0, -0.30, -0.80);
    carbonDeck.rotation.x = 0.06;
    this.group.add(carbonDeck);

    // Racing Instrument Binnacle Arch over OLED display
    const binnacle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.22, 16, 1, true, -Math.PI * 0.42, Math.PI * 0.84),
      carbonMat
    );
    binnacle.rotation.x = Math.PI / 2;
    binnacle.position.set(0, -0.27, -0.72);
    this.group.add(binnacle);

    // Sleek Carbon A-Pillars + Roll Cage Tubes + Windshield Sun-Strip Banner
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.82, 0.06), carbonMat);
      pillar.position.set(sx * 0.74, 0.08, -0.68);
      pillar.rotation.z = sx * 0.18;
      pillar.rotation.x = -0.32;
      this.group.add(pillar);

      const cageBar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.78, 8), brushedAlu);
      cageBar.position.set(sx * 0.68, 0.08, -0.64);
      cageBar.rotation.z = sx * 0.18;
      cageBar.rotation.x = -0.32;
      this.group.add(cageBar);
    }

    // Upper windshield racing sun-strip banner ("KHMER GT")
    const sunCv = document.createElement('canvas');
    sunCv.width = 512; sunCv.height = 64;
    const sc = sunCv.getContext('2d');
    sc.fillStyle = '#0c1018';
    sc.fillRect(0, 0, 512, 64);
    sc.fillStyle = '#d4a84b';
    sc.fillRect(0, 58, 512, 6);
    sc.fillStyle = '#ffffff';
    sc.font = '900 30px "Orbitron", sans-serif';
    sc.textAlign = 'center';
    sc.textBaseline = 'middle';
    sc.fillText('KHMER GT  •  OFFICIAL WORKS', 256, 30);
    const sunTex = new THREE.CanvasTexture(sunCv);
    sunTex.colorSpace = THREE.SRGBColorSpace;
    const sunStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.38, 0.11),
      new THREE.MeshBasicMaterial({ map: sunTex })
    );
    sunStrip.position.set(0, 0.44, -0.64);
    sunStrip.rotation.x = 0.22;
    this.group.add(sunStrip);

    // Steering Column & Interactive GT3 Butterfly/Round Steering Wheel
    this.wheelGroup = new THREE.Group();
    this.wheelGroup.position.set(0, -0.21, -0.47);
    this.wheelGroup.rotation.x = 0.24;
    this.group.add(this.wheelGroup);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.156, 0.021, 14, 36), alcantaraMat);
    this.wheelGroup.add(rim);

    // Red 12-o'clock alignment band
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.020, 0.046, 0.046),
      new THREE.MeshBasicMaterial({ color: '#ff2436' })
    );
    marker.position.set(0, 0.156, 0);
    this.wheelGroup.add(marker);

    // Carbon Faceplate, Brushed Aluminum Spokes, Rotary Knobs & Paddle Shifters
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.088, 0.026), carbonMat);
    this.wheelGroup.add(hub);
    const spokeBottom = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.15, 0.022), brushedAlu);
    spokeBottom.position.set(0, -0.078, -0.002);
    this.wheelGroup.add(spokeBottom);
    const logoBadge = new THREE.Mesh(new THREE.CircleGeometry(0.024, 18), goldMat);
    logoBadge.position.set(0, -0.004, 0.016);
    this.wheelGroup.add(logoBadge);

    // Rotary TCS/ERS dials & Aluminum Paddle Shifters behind wheel
    const dialColors = ['#ff2b3a', '#00e5ff'];
    [-0.072, 0.072].forEach((dx, idx) => {
      const dial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.013, 0.014, 12),
        new THREE.MeshStandardMaterial({ color: dialColors[idx], roughness: 0.3, metalness: 0.5 })
      );
      dial.rotation.x = Math.PI / 2;
      dial.position.set(dx, -0.006, 0.018);
      this.wheelGroup.add(dial);

      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.078, 0.008), brushedAlu);
      paddle.position.set(dx * 1.45, 0.01, -0.028);
      this.wheelGroup.add(paddle);
    });

    // 9 High-Visibility RPM Shift LEDs across top of steering wheel
    this.shiftLeds = [];
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#1b2028' });
      const led = new THREE.Mesh(new THREE.CircleGeometry(0.0068, 8), mat);
      led.position.set((i - 4) * 0.0175, 0.052, 0.017);
      this.wheelGroup.add(led);
      this.shiftLeds.push(mat);
    }

    // High-Resolution OLED Telemetry Display (CanvasTexture)
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 224;
    this.dashCtx = this.dashCanvas.getContext('2d');
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;

    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.36, 0.155),
      new THREE.MeshBasicMaterial({ map: this.dashTex })
    );
    screen.position.set(0, -0.17, -0.68);
    screen.rotation.x = -0.14;
    this.group.add(screen);

    // 3D VR Hand Joint Spheres (translucent cyber-glove aesthetic)
    this.handMeshes = [];
    const jointGeo = new THREE.SphereGeometry(0.011, 8, 8);
    const jointMatL = new THREE.MeshStandardMaterial({ color: '#00f0ff', emissive: '#00a8c7', emissiveIntensity: 1.0, roughness: 0.2 });
    const jointMatR = new THREE.MeshStandardMaterial({ color: '#ffd05c', emissive: '#c98816', emissiveIntensity: 1.0, roughness: 0.2 });

    for (let h = 0; h < 2; h++) {
      const map = new Map();
      const mat = h === 0 ? jointMatL : jointMatR;
      for (const name of JOINT_NAMES) {
        const m = new THREE.Mesh(jointGeo, mat);
        m.visible = false;
        if (name.endsWith('-tip')) m.scale.setScalar(1.28);
        this.group.add(m);
        map.set(name, m);
      }
      this.handMeshes.push(map);
    }

    this._lastDashUpdate = 0;
  }

  attachTo(parent) {
    parent.add(this.group);
  }

  update({ visible, car, steer = 0, totalLaps = 3, vrHands = null, isCyber = false }) {
    this.group.visible = visible;
    if (!visible) return;

    this.wheelGroup.rotation.z = -steer * 1.15;

    for (let h = 0; h < 2; h++) {
      const xrHand = vrHands && vrHands[h];
      const map = this.handMeshes[h];
      const active = !!(xrHand && xrHand.userData.source?.hand && xrHand.joints);
      for (const name of JOINT_NAMES) {
        const mesh = map.get(name);
        if (active && xrHand.joints[name]) {
          mesh.visible = true;
          mesh.position.copy(xrHand.joints[name].position);
        } else {
          mesh.visible = false;
        }
      }
    }

    if (!car) return;

    const rpm = car.rpmNorm;
    for (let i = 0; i < 9; i++) {
      const thresh = 0.44 + i * 0.062;
      const mat = this.shiftLeds[i];
      if (rpm >= thresh) {
        mat.color.set(i < 3 ? '#27f56b' : i < 6 ? '#ffd43b' : '#ff2233');
      } else {
        mat.color.set('#1a1f28');
      }
    }

    const now = performance.now();
    if (now - this._lastDashUpdate < 50) return;
    this._lastDashUpdate = now;

    const c = this.dashCtx;
    const W = 512, H = 224;
    c.fillStyle = isCyber ? '#040c18' : '#090d14';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = isCyber ? '#00f0ff' : '#d4a84b';
    c.lineWidth = 4;
    c.strokeRect(4, 4, W - 8, H - 8);

    // RPM Bar
    const barW = W - 40;
    c.fillStyle = '#19202e';
    c.fillRect(20, 18, barW, 20);
    const fillW = Math.min(1, car.rpmNorm) * barW;
    const g = c.createLinearGradient(20, 0, 20 + barW, 0);
    g.addColorStop(0, '#27f56b');
    g.addColorStop(0.7, '#ffd43b');
    g.addColorStop(1, '#ff2638');
    c.fillStyle = g;
    c.fillRect(20, 18, fillW, 20);

    // Speed & Gear
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.fillStyle = '#ffffff';
    c.font = '900 84px "Orbitron", sans-serif';
    c.fillText(String(car.kmh), W * 0.44, 114);
    c.font = '700 20px sans-serif';
    c.fillStyle = '#8b99ad';
    c.fillText('KM/H', W * 0.44, 162);

    // Gear Indicator
    c.fillStyle = '#141c2a';
    c.fillRect(348, 62, 134, 114);
    c.strokeStyle = isCyber ? '#ff1f7a' : '#d92b3a';
    c.lineWidth = 3;
    c.strokeRect(348, 62, 134, 114);
    c.fillStyle = car.boosting ? '#00f0ff' : '#ffd447';
    c.font = '900 78px "Orbitron", sans-serif';
    c.fillText(car.gear === 0 ? 'R' : String(car.gear), 415, 118);

    // Left Telemetry
    c.textAlign = 'left';
    c.fillStyle = '#d4a84b';
    c.font = '800 32px "Orbitron", sans-serif';
    c.fillText(`P${car.position}/8`, 24, 86);
    c.fillStyle = '#d8e0ec';
    c.font = '700 24px "Orbitron", sans-serif';
    c.fillText(`LAP ${car.lap}/${totalLaps}`, 24, 128);

    c.fillStyle = '#152436';
    c.fillRect(24, 154, 110, 16);
    c.fillStyle = car.boosting ? '#ff2a85' : '#00e5ff';
    c.fillRect(24, 154, 110 * car.ers, 16);
    c.fillStyle = '#7adfff';
    c.font = '700 14px sans-serif';
    c.fillText('ERS', 24, 192);

    this.dashTex.needsUpdate = true;
  }
}
