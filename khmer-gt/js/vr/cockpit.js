// js/vr/cockpit.js — Gran Turismo 3D Carbon Cockpit with interactive steering wheel, shift LEDs, digital dash & 3D VR Hand Visualization
import * as THREE from 'three';

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

    const carbonMat = new THREE.MeshStandardMaterial({ color: '#1b202b', roughness: 0.38, metalness: 0.55 });
    const alcantaraMat = new THREE.MeshStandardMaterial({ color: '#242934', roughness: 0.85, metalness: 0.1 });
    const accentMat = new THREE.MeshStandardMaterial({ color: '#e6b852', roughness: 0.25, metalness: 0.75, emissive: '#593e0a', emissiveIntensity: 0.4 });

    // Subtle interior cockpit instrument light so steering wheel & carbon dash always read clearly even at night
    const dashLight = new THREE.PointLight('#cfe8ff', 1.4, 2.2);
    dashLight.position.set(0, 0.12, -0.35);
    this.group.add(dashLight);

    // Dashboard cowl & A-pillars (positioned relative to driver's eye at 0,0,0)
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.18, 0.44), alcantaraMat);
    dash.position.set(0, -0.39, -0.78);
    this.group.add(dash);

    const hoodCowl = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.035, 0.52), carbonMat);
    hoodCowl.position.set(0, -0.29, -0.82);
    hoodCowl.rotation.x = 0.08;
    this.group.add(hoodCowl);

    // Sleek A-Pillars framing the windshield
    for (const sx of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.76, 0.055), carbonMat);
      pillar.position.set(sx * 0.72, 0.08, -0.68);
      pillar.rotation.z = sx * 0.18;
      pillar.rotation.x = -0.32;
      this.group.add(pillar);
    }

    // Steering Column & Interactive GT3 Steering Wheel
    this.wheelGroup = new THREE.Group();
    this.wheelGroup.position.set(0, -0.21, -0.48);
    this.wheelGroup.rotation.x = 0.24;
    this.group.add(this.wheelGroup);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.020, 12, 32), alcantaraMat);
    this.wheelGroup.add(rim);

    // Top-center red marker strip on steering wheel
    const marker = new THREE.Mesh(
      new THREE.BoxGeometry(0.022, 0.046, 0.046),
      new THREE.MeshBasicMaterial({ color: '#ff2b3a' })
    );
    marker.position.set(0, 0.155, 0);
    this.wheelGroup.add(marker);

    // Carbon center plate & spokes
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.075, 0.026), carbonMat);
    this.wheelGroup.add(hub);
    const spokeBottom = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.15, 0.022), carbonMat);
    spokeBottom.position.set(0, -0.075, 0);
    this.wheelGroup.add(spokeBottom);
    const logoBadge = new THREE.Mesh(new THREE.CircleGeometry(0.025, 16), accentMat);
    logoBadge.position.set(0, 0, 0.017);
    this.wheelGroup.add(logoBadge);

    // 7 RPM Shift LEDs across top of steering wheel hub
    this.shiftLeds = [];
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#1b2028' });
      const led = new THREE.Mesh(new THREE.CircleGeometry(0.0075, 8), mat);
      led.position.set((i - 3) * 0.021, 0.052, 0.017);
      this.wheelGroup.add(led);
      this.shiftLeds.push(mat);
    }

    // High-resolution Digital Telemetry Dash Display (CanvasTexture)
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

    // 3D Hand Joint Spheres for VR Controller-Free Hand Tracking visualization
    this.handMeshes = [];
    const jointGeo = new THREE.SphereGeometry(0.011, 8, 8);
    const jointMatL = new THREE.MeshStandardMaterial({ color: '#00f0ff', emissive: '#00a8c7', emissiveIntensity: 0.9, roughness: 0.2 });
    const jointMatR = new THREE.MeshStandardMaterial({ color: '#ffd05c', emissive: '#c98816', emissiveIntensity: 0.9, roughness: 0.2 });

    for (let h = 0; h < 2; h++) {
      const map = new Map();
      const mat = h === 0 ? jointMatL : jointMatR;
      for (const name of JOINT_NAMES) {
        const m = new THREE.Mesh(jointGeo, mat);
        m.visible = false;
        if (name.endsWith('-tip')) m.scale.setScalar(1.25);
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

    // Rotate GT steering wheel 1:1 with hand steering
    this.wheelGroup.rotation.z = -steer * 1.15;

    // Update 3D VR Hand joint visualization if in VR hand-tracking mode
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

    // Shift LEDs on wheel
    const rpm = car.rpmNorm;
    for (let i = 0; i < 7; i++) {
      const thresh = 0.48 + i * 0.075;
      const mat = this.shiftLeds[i];
      if (rpm >= thresh) {
        mat.color.set(i < 3 ? '#27f56b' : i < 5 ? '#ffd43b' : '#ff2233');
      } else {
        mat.color.set('#1a1f28');
      }
    }

    // Throttle dashboard texture redraw to ~20Hz for smooth VR framerate
    const now = performance.now();
    if (now - this._lastDashUpdate < 50) return;
    this._lastDashUpdate = now;

    const c = this.dashCtx;
    const W = 512, H = 224;
    c.fillStyle = isCyber ? '#050d1a' : '#0b0e14';
    c.fillRect(0, 0, W, H);
    c.strokeStyle = isCyber ? '#00f0ff' : '#d4a84b';
    c.lineWidth = 4;
    c.strokeRect(4, 4, W - 8, H - 8);

    // RPM Bar
    const barW = W - 40;
    c.fillStyle = '#1b2230';
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

    // Gear Box
    c.fillStyle = '#18202e';
    c.fillRect(348, 62, 134, 114);
    c.strokeStyle = isCyber ? '#ff1f7a' : '#d92b3a';
    c.lineWidth = 3;
    c.strokeRect(348, 62, 134, 114);
    c.fillStyle = car.boosting ? '#00f0ff' : '#ffd447';
    c.font = '900 78px "Orbitron", sans-serif';
    c.fillText(car.gear === 0 ? 'R' : String(car.gear), 415, 118);

    // Left Telemetry: POS / LAP / ERS
    c.textAlign = 'left';
    c.fillStyle = '#d4a84b';
    c.font = '800 32px "Orbitron", sans-serif';
    c.fillText(`P${car.position}/8`, 24, 86);
    c.fillStyle = '#d8e0ec';
    c.font = '700 24px "Orbitron", sans-serif';
    c.fillText(`LAP ${car.lap}/${totalLaps}`, 24, 128);

    // ERS Bar
    c.fillStyle = '#162436';
    c.fillRect(24, 154, 110, 16);
    c.fillStyle = car.boosting ? '#ff2a85' : '#00e5ff';
    c.fillRect(24, 154, 110 * car.ers, 16);
    c.fillStyle = '#7adfff';
    c.font = '700 14px sans-serif';
    c.fillText('ERS', 24, 192);

    this.dashTex.needsUpdate = true;
  }
}
