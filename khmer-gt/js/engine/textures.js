// js/engine/textures.js — High-resolution procedural PBR texture factory (Albedo, Bump, Roughness, Alpha Foliage, Car Livery, Sky)
// Designed for Quest 3S memory & draw-call efficiency while delivering crisp commercial-grade surface detail.
import * as THREE from 'three';

const cache = new Map();

function cached(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const val = fn();
  cache.set(key, val);
  return val;
}

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return { cv, ctx: cv.getContext('2d') };
}

// Fast deterministic pseudo-random for rich repeatable surface grain
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// 1. Carbon Fiber Weave (Albedo + Roughness/Bump) for splitters, wings, diffusers, cockpit
export function getCarbonTextures() {
  return cached('carbon', () => {
    const { cv, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = '#14171d';
    ctx.fillRect(0, 0, 256, 256);
    const step = 16;
    for (let y = 0; y < 256; y += step) {
      for (let x = 0; x < 256; x += step) {
        const alt = ((x / step + y / step) % 2) === 0;
        const g = ctx.createLinearGradient(x, y, x + step, y + step);
        if (alt) {
          g.addColorStop(0, '#2a2f3a');
          g.addColorStop(0.5, '#191d25');
          g.addColorStop(1, '#0e1116');
        } else {
          g.addColorStop(0, '#11141a');
          g.addColorStop(0.5, '#252a34');
          g.addColorStop(1, '#14171f');
        }
        ctx.fillStyle = g;
        ctx.fillRect(x + 1, y + 1, step - 2, step - 2);
      }
    }
    const map = new THREE.CanvasTexture(cv);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(8, 8);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return { map };
  });
}

// 2. High-detail Asphalt PBR Pack (Albedo + Roughness + Bump) — dry GT tarmac OR wet neon cyberpunk mirror tarmac
export function getAsphaltTextures(course) {
  return cached(`asphalt_${course.id}`, () => {
    const W = 512, H = 512;
    const col = makeCanvas(W, H);
    const rough = makeCanvas(W, H);
    const bump = makeCanvas(W, H);
    const rc = course.roadColors;

    // Base fill
    col.ctx.fillStyle = rc.asphalt;
    col.ctx.fillRect(0, 0, W, H);
    rough.ctx.fillStyle = course.isWet ? '#585858' : '#c8c8c8';
    rough.ctx.fillRect(0, 0, W, H);
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, W, H);

    // Multi-scale aggregate stone noise
    const cImg = col.ctx.getImageData(0, 0, W, H);
    const rImg = rough.ctx.getImageData(0, 0, W, H);
    const bImg = bump.ctx.getImageData(0, 0, W, H);
    const cd = cImg.data, rd = rImg.data, bd = bImg.data;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const n1 = hash2(x * 0.5, y * 0.5);
        const n2 = hash2(Math.floor(x / 3), Math.floor(y / 3));
        const grain = (n1 * 0.65 + n2 * 0.35 - 0.5) * 28;

        cd[i] = Math.max(0, Math.min(255, cd[i] + grain));
        cd[i + 1] = Math.max(0, Math.min(255, cd[i + 1] + grain));
        cd[i + 2] = Math.max(0, Math.min(255, cd[i + 2] + grain + (course.isCyber ? 5 : 0)));

        const bVal = Math.max(0, Math.min(255, 128 + grain * 2.5));
        bd[i] = bd[i + 1] = bd[i + 2] = bVal;

        // Wet puddles on cyber road (very low roughness mirror patches!)
        if (course.isWet) {
          const puddle = Math.sin(x * 0.025 + Math.cos(y * 0.018) * 2.2) * Math.cos(y * 0.022 - x * 0.01);
          const rVal = puddle > 0.15 ? 24 : 115 + grain;
          rd[i] = rd[i + 1] = rd[i + 2] = Math.max(12, Math.min(220, rVal));
        } else {
          const rVal = Math.max(120, Math.min(240, 198 + grain * 1.4));
          rd[i] = rd[i + 1] = rd[i + 2] = rVal;
        }
      }
    }
    col.ctx.putImageData(cImg, 0, 0);
    rough.ctx.putImageData(rImg, 0, 0);
    bump.ctx.putImageData(bImg, 0, 0);

    // Subtle rubber racing grooves (darker + smoother in tire tracks)
    const groove = col.ctx.createLinearGradient(0, 0, W, 0);
    groove.addColorStop(0.0, 'rgba(0,0,0,0)');
    groove.addColorStop(0.22, 'rgba(0,0,0,0.28)');
    groove.addColorStop(0.35, 'rgba(0,0,0,0.06)');
    groove.addColorStop(0.65, 'rgba(0,0,0,0.06)');
    groove.addColorStop(0.78, 'rgba(0,0,0,0.28)');
    groove.addColorStop(1.0, 'rgba(0,0,0,0)');
    col.ctx.fillStyle = groove;
    col.ctx.fillRect(0, 0, W, H);

    // Subtle tar repair seams
    col.ctx.strokeStyle = 'rgba(10, 12, 16, 0.35)';
    col.ctx.lineWidth = 2;
    col.ctx.beginPath();
    col.ctx.moveTo(0, 140); col.ctx.bezierCurveTo(180, 152, 330, 128, 512, 144);
    col.ctx.stroke();

    // Road markings
    if (course.isCyber) {
      // Glowing futuristic telemetry grid & edge rails
      col.ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
      col.ctx.lineWidth = 2;
      for (let y = 0; y < H; y += 64) {
        col.ctx.beginPath(); col.ctx.moveTo(26, y); col.ctx.lineTo(W - 26, y); col.ctx.stroke();
      }
      col.ctx.fillStyle = '#00f0ff';
      col.ctx.fillRect(14, 0, 10, H);
      col.ctx.fillStyle = '#ff1f7a';
      col.ctx.fillRect(W - 24, 0, 10, H);
      // Glowing cyber directional chevrons down center
      col.ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
      col.ctx.lineWidth = 5;
      for (let y = 32; y < H; y += 128) {
        col.ctx.beginPath();
        col.ctx.moveTo(W / 2 - 22, y + 26);
        col.ctx.lineTo(W / 2, y);
        col.ctx.lineTo(W / 2 + 22, y + 26);
        col.ctx.stroke();
      }
    } else {
      // Crisp painted white/gold motorsport edge lines with wear
      col.ctx.fillStyle = rc.line;
      col.ctx.fillRect(18, 0, 11, H);
      col.ctx.fillRect(W - 29, 0, 11, H);
      // Center dashed lane dividers
      col.ctx.fillStyle = 'rgba(255, 246, 224, 0.52)';
      for (let y = 18; y < H; y += 128) {
        col.ctx.fillRect(W / 2 - 3, y, 6, 54);
      }
    }

    const setup = (c, isColor) => {
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1, 145);
      if (isColor) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    return {
      map: setup(col.cv, true),
      roughnessMap: setup(rough.cv, false),
      bumpMap: setup(bump.cv, false),
    };
  });
}

// 3. Angkor Weathered Sandstone & Bas-Relief Carving PBR Texture
export function getAngkorStoneTextures(cyber = false) {
  return cached(`angkor_stone_${cyber ? 'cyber' : 'classic'}`, () => {
    const W = 512, H = 512;
    const col = makeCanvas(W, H);
    const bump = makeCanvas(W, H);

    col.ctx.fillStyle = cyber ? '#0d1526' : '#7a6c57';
    col.ctx.fillRect(0, 0, W, H);
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, 0, W, H);

    // Ashlar stone blocks + Khmer lotus frieze bands
    const rows = 16;
    const rowH = H / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const cols = r % 4 === 0 ? 16 : 6;
      const bw = W / cols;
      const offset = (r % 2) * (bw * 0.5);

      for (let c = -1; c <= cols; c++) {
        const x = c * bw + offset;
        const n = hash2(c + 13, r + 7);
        if (cyber) {
          const lum = 14 + Math.floor(n * 18);
          col.ctx.fillStyle = `rgb(${lum}, ${lum + 10}, ${lum + 26})`;
        } else {
          const baseR = 112 + Math.floor((n - 0.5) * 34);
          const baseG = 98 + Math.floor((n - 0.5) * 30);
          const baseB = 78 + Math.floor((n - 0.5) * 24);
          col.ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
        }
        col.ctx.fillRect(x + 2, y + 2, bw - 4, rowH - 4);
        bump.ctx.fillStyle = `rgb(${150 + Math.floor(n * 50)},${150 + Math.floor(n * 50)},${150 + Math.floor(n * 50)})`;
        bump.ctx.fillRect(x + 2, y + 2, bw - 4, rowH - 4);

        // Decorative Khmer lotus petal relief on every 4th row
        if (r % 4 === 0) {
          col.ctx.strokeStyle = cyber ? (r % 8 === 0 ? '#00f0ff' : '#ff1f7a') : 'rgba(54, 43, 30, 0.55)';
          col.ctx.lineWidth = cyber ? 2.5 : 2;
          col.ctx.beginPath();
          col.ctx.arc(x + bw * 0.5, y + rowH * 0.65, rowH * 0.32, Math.PI, 0);
          col.ctx.stroke();
        }
      }

      // Moss / weathering streaks on classic sandstone
      if (!cyber && r % 3 === 1) {
        col.ctx.fillStyle = 'rgba(48, 72, 38, 0.28)';
        col.ctx.fillRect(0, y, W, 6);
      }
    }

    const map = new THREE.CanvasTexture(col.cv);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    map.colorSpace = THREE.SRGBColorSpace;
    const bumpMap = new THREE.CanvasTexture(bump.cv);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(2, 2);
    return { map, bumpMap };
  });
}

// 4. Royal Palace Golden Khmer Roof Tile Texture
export function getKhmerRoofTexture() {
  return cached('khmer_roof', () => {
    const { cv, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = '#c99324';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 16) {
      for (let x = 0; x < 256; x += 16) {
        const ox = ((y / 16) % 2) * 8;
        ctx.fillStyle = ((x + y) % 32 === 0) ? '#f0c850' : '#d6a02e';
        ctx.beginPath();
        ctx.arc(x + ox, y + 8, 9, 0, Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#754d0c';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // Royal emerald border band
    ctx.fillStyle = '#186a52';
    ctx.fillRect(0, 224, 256, 32);
    ctx.fillStyle = '#ffd966';
    ctx.fillRect(0, 220, 256, 5);
    const map = new THREE.CanvasTexture(cv);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(3, 3);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  });
}

// 5. Modern Skyscraper / Cyber Megastructure Glass Facade Texture
export function getBuildingFacadeTexture(mode = 'twilight') {
  return cached(`facade_${mode}`, () => {
    const W = 256, H = 512;
    const { cv, ctx } = makeCanvas(W, H);
    ctx.fillStyle = mode === 'cyber' ? '#080e1c' : mode === 'colonial' ? '#ebd69e' : '#1b2434';
    ctx.fillRect(0, 0, W, H);

    if (mode === 'colonial') {
      // French colonial shophouse with arched shutters & terracotta moldings
      ctx.fillStyle = '#d4bc80';
      ctx.fillRect(0, 0, W, 24);
      ctx.fillRect(0, 248, W, 18);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          const wx = 22 + col * 80;
          const wy = 56 + row * 226;
          ctx.fillStyle = '#2d5c4e'; // classic Kampot green shutters
          ctx.fillRect(wx, wy, 52, 130);
          ctx.fillStyle = '#1d3632';
          ctx.fillRect(wx + 8, wy + 10, 36, 110);
          ctx.strokeStyle = '#f5ebd1';
          ctx.lineWidth = 4;
          ctx.strokeRect(wx - 3, wy - 3, 58, 136);
        }
      }
    } else {
      // Glass curtain wall tower with randomized lit office floors
      const cols = 8;
      const rows = 24;
      const cw = W / cols;
      const rh = H / rows;
      for (let r = 0; r < rows; r++) {
        const floorLit = hash2(r, 3) > 0.35;
        for (let c = 0; c < cols; c++) {
          const lit = floorLit && hash2(c * 3, r * 5) > 0.38;
          if (lit) {
            if (mode === 'cyber') {
              const p = hash2(c, r);
              ctx.fillStyle = p > 0.72 ? '#00f0ff' : p > 0.45 ? '#ff2a85' : '#4a88ff';
            } else {
              ctx.fillStyle = hash2(c + 1, r) > 0.5 ? '#ffd68a' : '#ffeed0';
            }
          } else {
            ctx.fillStyle = mode === 'cyber' ? '#0e1930' : '#25324a';
          }
          ctx.fillRect(c * cw + 3, r * rh + 4, cw - 6, rh - 8);
        }
      }
    }
    const map = new THREE.CanvasTexture(cv);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  });
}

// 6. Realistic Alpha-Cutout Palm Frond & Tropical Foliage Cluster Textures
export function getPalmFrondTexture() {
  return cached('palm_frond', () => {
    const { cv, ctx } = makeCanvas(256, 256);
    ctx.clearRect(0, 0, 256, 256);
    // Central rachis stem
    ctx.strokeStyle = '#3f6b29';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(128, 250);
    ctx.quadraticCurveTo(128, 110, 128, 10);
    ctx.stroke();
    // 28 paired serrated palm leaflets
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const y = 235 - t * 210;
      const len = Math.sin(t * Math.PI * 0.92 + 0.15) * 114;
      for (const side of [-1, 1]) {
        ctx.fillStyle = i % 2 === 0 ? '#2b6124' : '#3a7a2e';
        ctx.beginPath();
        ctx.moveTo(128, y);
        ctx.quadraticCurveTo(128 + side * len * 0.55, y - 14, 128 + side * len, y + 12);
        ctx.quadraticCurveTo(128 + side * len * 0.55, y + 6, 128, y + 8);
        ctx.closePath();
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

export function getFoliageClusterTexture() {
  return cached('foliage_cluster', () => {
    const { cv, ctx } = makeCanvas(256, 256);
    ctx.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 110; i++) {
      const a = hash2(i, 1) * Math.PI * 2;
      const r = Math.sqrt(hash2(i, 2)) * 96;
      const x = 128 + Math.cos(a) * r;
      const y = 128 + Math.sin(a) * r;
      const rad = 12 + hash2(i, 3) * 18;
      const shade = hash2(i, 4);
      ctx.fillStyle = shade > 0.65 ? '#3d7330' : shade > 0.3 ? '#295422' : '#1b3a17';
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * 0.62, hash2(i, 5) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

// 7. Ground Grass / Highland / Jungle Texture
export function getGroundTexture(theme) {
  return cached(`ground_${theme}`, () => {
    const { cv, ctx } = makeCanvas(512, 512);
    const palettes = {
      phnompenh: ['#2c3d28', '#384c31', '#222f20'],
      angkor: ['#2f4724', '#3f592d', '#4c4632'],
      cyber: ['#060b16', '#0a1428', '#0d1d38'],
      bokor: ['#233b27', '#324c34', '#404c41'],
      kampot: ['#3d6332', '#52783d', '#6e6a4a'],
    };
    const pal = palettes[theme] || palettes.angkor;
    ctx.fillStyle = pal[0];
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 4500; i++) {
      const x = hash2(i, 11) * 512;
      const y = hash2(i, 17) * 512;
      const r = 3 + hash2(i, 23) * 14;
      ctx.fillStyle = pal[i % 3];
      ctx.globalAlpha = 0.26;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (theme === 'cyber') {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.22)';
      ctx.lineWidth = 2;
      for (let g = 0; g < 512; g += 64) {
        ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, 512); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(512, g); ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(42, 42);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

// 8. Water Ripple Normal/Bump Texture for Mekong River, Angkor Moat & Kampot River
export function getWaterBumpTexture() {
  return cached('water_bump', () => {
    const { cv, ctx } = makeCanvas(256, 256);
    const img = ctx.createImageData(256, 256);
    const d = img.data;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const w =
          Math.sin(x * 0.14 + Math.cos(y * 0.08) * 1.5) * 0.5 +
          Math.sin(y * 0.22 - x * 0.07) * 0.35 +
          Math.cos((x + y) * 0.18) * 0.15;
        const v = Math.floor(128 + w * 95);
        const i = (y * 256 + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 32);
    return tex;
  });
}

// 9. Soft Radial Contact Shadow Texture (grounds cars firmly on asphalt at near-zero GPU cost!)
export function getContactShadowTexture() {
  return cached('contact_shadow', () => {
    const { cv, ctx } = makeCanvas(256, 256);
    ctx.clearRect(0, 0, 256, 256);
    const g = ctx.createRadialGradient(128, 128, 22, 128, 128, 124);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.92)');
    g.addColorStop(0.55, 'rgba(0, 0, 0, 0.65)');
    g.addColorStop(0.85, 'rgba(0, 0, 0, 0.20)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv);
    return tex;
  });
}

// 10. Soft Additive Glow Halo Sprite (for headlights, tail lights, street lamps, cyber beacons)
export function getGlowTexture(hexColor = '#ffffff') {
  return cached(`glow_${hexColor}`, () => {
    const { cv, ctx } = makeCanvas(128, 128);
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, hexColor);
    g.addColorStop(0.6, `${hexColor}44`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

// 11. High-Resolution Procedural HDR-like Equirectangular Sky + Clouds + Atmospheric Sun Scattering (1024x512)
// Used BOTH for the sky dome AND for PMREM environment reflections on car paint!
export function getSkyEquirectTexture(course) {
  return cached(`sky_eq_${course.id}`, () => {
    const W = 1024, H = 512;
    const { cv, ctx } = makeCanvas(W, H);
    const s = course.sky;

    // Rich vertical atmospheric sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.0, s.top);
    grad.addColorStop(0.30, s.mid);
    grad.addColorStop(0.495, s.horizon);
    grad.addColorStop(0.52, s.ground);
    grad.addColorStop(1.0, '#070a10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Horizon atmospheric haze band
    const haze = ctx.createLinearGradient(0, H * 0.36, 0, H * 0.54);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(0.7, course.isCyber ? 'rgba(0, 229, 255, 0.25)' : 'rgba(255, 225, 180, 0.36)');
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, H * 0.36, W, H * 0.18);

    // Sun / Mie scattering corona
    if (!course.isCyber) {
      const sunDir = new THREE.Vector3(...s.sunPos).normalize();
      const u = (Math.atan2(sunDir.z, sunDir.x) / (Math.PI * 2) + 1) % 1;
      const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, sunDir.y))) / Math.PI;
      const sx = u * W;
      const sy = v * H;

      const corona = ctx.createRadialGradient(sx, sy, 4, sx, sy, 210);
      corona.addColorStop(0.0, '#ffffff');
      corona.addColorStop(0.08, s.sunColor);
      corona.addColorStop(0.32, `${s.sunColor}55`);
      corona.addColorStop(1.0, 'rgba(255,255,255,0)');
      ctx.fillStyle = corona;
      ctx.fillRect(0, 0, W, H * 0.55);
    } else {
      // Cyberpunk aurora data ribbons + neon city skyglow
      for (let i = 0; i < 6; i++) {
        const y = 75 + i * 28;
        const g = ctx.createLinearGradient(0, y, W, y + 18);
        g.addColorStop(0, 'rgba(0,240,255,0)');
        g.addColorStop(0.3, i % 2 === 0 ? 'rgba(0,240,255,0.22)' : 'rgba(255,31,122,0.18)');
        g.addColorStop(0.7, i % 2 === 0 ? 'rgba(255,31,122,0.16)' : 'rgba(0,240,255,0.20)');
        g.addColorStop(1, 'rgba(0,240,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, W, 14 + (i % 3) * 8);
      }
    }

    // Layered procedural volumetric-feel clouds (lit underside at sunrise/sunset!)
    const cloudCount = course.theme === 'bokor' ? 75 : course.isCyber ? 35 : 52;
    for (let i = 0; i < cloudCount; i++) {
      const cx = hash2(i, 31) * W;
      const cy = 62 + hash2(i, 37) * 165;
      const rx = 38 + hash2(i, 41) * 95;
      const ry = 8 + hash2(i, 43) * 20;
      const cg = ctx.createRadialGradient(cx, cy - ry * 0.2, 2, cx, cy, rx);
      if (course.isCyber) {
        cg.addColorStop(0, i % 2 === 0 ? 'rgba(0, 195, 255, 0.24)' : 'rgba(180, 30, 120, 0.20)');
        cg.addColorStop(1, 'rgba(10, 16, 36, 0)');
      } else if (course.theme === 'phnompenh' || course.theme === 'angkor') {
        cg.addColorStop(0, 'rgba(255, 224, 178, 0.52)');
        cg.addColorStop(0.55, 'rgba(218, 126, 98, 0.26)');
        cg.addColorStop(1, 'rgba(80, 50, 70, 0)');
      } else {
        cg.addColorStop(0, 'rgba(255, 255, 255, 0.56)');
        cg.addColorStop(0.6, 'rgba(210, 225, 238, 0.22)');
        cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Distant mountain / city silhouette horizon band baked right into sky dome for limitless depth!
    ctx.fillStyle = course.isCyber ? '#070e20' : course.theme === 'phnompenh' ? '#242336' : '#26332c';
    ctx.beginPath();
    ctx.moveTo(0, H * 0.52);
    for (let x = 0; x <= W; x += 8) {
      let h = 10;
      if (course.isCyber) {
        h = 10 + Math.floor(hash2(Math.floor(x / 16), 99) * 34);
      } else {
        h = 8 + Math.sin(x * 0.015) * 12 + Math.sin(x * 0.043) * 6 + Math.cos(x * 0.008) * 10;
      }
      ctx.lineTo(x, H * 0.505 - Math.max(4, h));
    }
    ctx.lineTo(W, H * 0.52);
    ctx.closePath();
    ctx.fill();

    const tex = new THREE.CanvasTexture(cv);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

// 12. Commercial GT Car Livery + Panel Seams + Racing Number Texture (1024x512)
export function getCarLiveryTexture(carSpec, bodyColor, accentColor, numberStr = '07') {
  const key = `livery_${carSpec.id}_${bodyColor}_${accentColor}_${numberStr}`;
  return cached(key, () => {
    const W = 1024, H = 512;
    const { cv, ctx } = makeCanvas(W, H);
    const isCyber = carSpec.bodyStyle === 'cyber';

    // Base metallic paint
    ctx.fillStyle = bodyColor;
    ctx.fillRect(0, 0, W, H);

    // Subtle metallic flake shimmer
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
      ctx.fillRect(hash2(i, 1) * W, hash2(i, 2) * H, 2, 2);
    }

    // Center racing stripe (u around 0.5 corresponds to car centerline top)
    ctx.fillStyle = accentColor;
    ctx.fillRect(W * 0.455, 0, W * 0.09, H);
    ctx.fillStyle = isCyber ? '#ffffff' : 'rgba(255,255,255,0.85)';
    ctx.fillRect(W * 0.445, 0, W * 0.008, H);
    ctx.fillRect(W * 0.547, 0, W * 0.008, H);

    // Side dynamic swoosh livery stripes & correctly oriented door number plates
    // Note: Lofted body UV has U = left(0)->top(0.5)->right(1), V = front(0)->rear(1).
    // Left flank is U ~ 0.14..0.28, Right flank is U ~ 0.72..0.86.
    for (const side of [0, 1]) {
      const sx = side === 0 ? W * 0.16 : W * 0.84;
      const dir = side === 0 ? 1 : -1;
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(sx - dir * 24, H * 0.14);
      ctx.lineTo(sx + dir * 68, H * 0.24);
      ctx.lineTo(sx + dir * 52, H * 0.84);
      ctx.lineTo(sx - dir * 32, H * 0.72);
      ctx.closePath();
      ctx.fill();

      // Motorsport door number plate rotated to sit upright along the car's side flank!
      const nx = side === 0 ? W * 0.21 : W * 0.79;
      const ny = H * 0.50;
      ctx.save();
      ctx.translate(nx, ny);
      ctx.rotate(side === 0 ? -Math.PI / 2 : Math.PI / 2);
      ctx.fillStyle = isCyber ? 'rgba(6, 14, 28, 0.94)' : '#f8f9fb';
      ctx.fillRect(-38, -28, 76, 56);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4;
      ctx.strokeRect(-38, -28, 76, 56);
      ctx.fillStyle = isCyber ? '#00f0ff' : '#11151d';
      ctx.font = '900 34px "Orbitron", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(numberStr, 0, 2);
      // Small sponsor text underneath
      ctx.fillStyle = isCyber ? '#ff2a85' : '#ffffff';
      ctx.font = '800 13px "Orbitron", sans-serif';
      ctx.fillText('KHMER GT', 0, 42);
      ctx.restore();
    }

    // Precision automotive panel lines (hood shut line, door seams, rear deck)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(W * 0.28, H * 0.28); ctx.lineTo(W * 0.72, H * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.08, H * 0.36); ctx.lineTo(W * 0.92, H * 0.36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.08, H * 0.67); ctx.lineTo(W * 0.92, H * 0.67); ctx.stroke();

    // Hood carbon vent grille
    ctx.fillStyle = '#12151c';
    ctx.fillRect(W * 0.41, H * 0.13, W * 0.18, H * 0.08);
    ctx.strokeStyle = isCyber ? '#00f0ff' : 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 2;
    for (let y = H * 0.145; y < H * 0.205; y += 9) {
      ctx.beginPath(); ctx.moveTo(W * 0.42, y); ctx.lineTo(W * 0.58, y); ctx.stroke();
    }

    // Cyber glowing circuit traces on body
    if (isCyber) {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W * 0.32, H * 0.05); ctx.lineTo(W * 0.32, H * 0.95);
      ctx.moveTo(W * 0.68, H * 0.05); ctx.lineTo(W * 0.68, H * 0.95);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
}

// 13. Tire Tread & Sidewall Lettering Texture
export function getTireSidewallTexture() {
  return cached('tire_sidewall', () => {
    const { cv, ctx } = makeCanvas(256, 256);
    ctx.fillStyle = '#181a1f';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#2a2e36';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(128, 128, 114, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(240, 242, 245, 0.72)';
    ctx.lineWidth = 3;
    ctx.setLineDash([28, 22]);
    ctx.beginPath(); ctx.arc(128, 128, 102, 0, Math.PI * 2); ctx.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

// 14. Refined Stadium Grandstand Seating + Distant Crowd Texture (subtle architectural depth, no blocky pixels!)
export function getCrowdTexture() {
  return cached('crowd', () => {
    const { cv, ctx } = makeCanvas(512, 256);
    ctx.fillStyle = '#1b2029';
    ctx.fillRect(0, 0, 512, 256);
    const colors = ['#9c2530', '#c79e46', '#d8dde6', '#2b5294', '#266e5c', '#586273', '#39404d'];
    for (let row = 0; row < 12; row++) {
      const y = row * 21;
      // Concrete tier step shadow
      ctx.fillStyle = '#12161d';
      ctx.fillRect(0, y + 15, 512, 6);
      ctx.fillStyle = '#282f3c';
      ctx.fillRect(0, y, 512, 4);
      for (let x = 4; x < 508; x += 9) {
        if (hash2(x, row) < 0.22) continue;
        ctx.fillStyle = colors[Math.floor(hash2(x + 3, row + 9) * colors.length)];
        ctx.fillRect(x, y + 7, 6, 8);
        ctx.fillStyle = '#cca98e';
        ctx.beginPath();
        ctx.arc(x + 3, y + 5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(3, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}
