import * as THREE from 'three';
import { Sky } from './sky.js';
import { Terrain } from './terrain.js';
import { Water } from './water.js';
import { Particles } from './particles.js';
import { Platform, Lotus, Constellations } from './garden.js';
import { Scenery } from './scenery.js';
import { makeNoiseTexture, srgb, lerp, smooth } from '../util.js';

// One night = one session: dusk -> blue hour -> aurora night -> pre-dawn -> sunrise.
// The coming dawn is the in-world cue that today's training is done, so the player can lose
// track of time without overdoing it.

const KEYS = [
  { p: 0.00, zen: 0x1a2550, hor: 0xe89a7a, glow: 0xff8f5e, g: 1.0, gdir: [-0.9, -0.45], star: 0.15, aur: 0.0, deep: 0x0b1226, rock: 0x141633, rim: 0xc07a8a, mist: 0.55, fire: 0.3 },
  { p: 0.18, zen: 0x0d1640, hor: 0x46508f, glow: 0x9c6fb0, g: 0.55, gdir: [-0.9, -0.45], star: 0.65, aur: 0.15, deep: 0x070d22, rock: 0x0b0f27, rim: 0x6c78b8, mist: 0.5, fire: 0.8 },
  { p: 0.45, zen: 0x040920, hor: 0x16294c, glow: 0x2a8f7a, g: 0.25, gdir: [-0.3, -0.95], star: 1.0, aur: 1.0, deep: 0x040816, rock: 0x060a1a, rim: 0x3a6a90, mist: 0.42, fire: 1.0 },
  { p: 0.72, zen: 0x060d2a, hor: 0x23345e, glow: 0x5b5aa8, g: 0.3, gdir: [0.6, -0.8], star: 0.9, aur: 0.65, deep: 0x050a1b, rock: 0x080c20, rim: 0x5868a8, mist: 0.45, fire: 0.9 },
  { p: 0.90, zen: 0x1a2a5e, hor: 0x8a6f9a, glow: 0xe59aa0, g: 0.7, gdir: [0.9, -0.45], star: 0.35, aur: 0.15, deep: 0x0c1430, rock: 0x161a3a, rim: 0xc98aa0, mist: 0.6, fire: 0.5 },
  { p: 1.00, zen: 0x3d64a8, hor: 0xffc69a, glow: 0xffc890, g: 1.2, gdir: [0.9, -0.45], star: 0.02, aur: 0.0, deep: 0x1a2a4a, rock: 0x2a2e50, rim: 0xffb890, mist: 0.75, fire: 0.1 },
];

function mixHex(a, b, t) {
  const A = srgb(a), B = srgb(b);
  return A.lerp(B, t);
}

export class Environment {
  constructor(app) {
    this.app = app;
    const noise = makeNoiseTexture(256);
    this.noise = noise;
    this.group = new THREE.Group();
    const ppd = app.view.ppd;
    this.sky = new Sky(noise, ppd);
    const moonAz = Math.atan2(this.sky.moonDir.x, -this.sky.moonDir.z);
    this.terrain = new Terrain(moonAz);
    this.water = new Water(noise, this.sky.moonDir);
    this.particles = new Particles(ppd);
    this.platform = new Platform();
    this.lotus = new Lotus(64);
    this.constellations = new Constellations();
    this.scenery = new Scenery(noise, this.sky.moonDir, ppd);
    this.group.add(this.sky.group, this.sky.worldGroup, this.terrain.group, this.water.mesh,
      this.particles.group, this.platform.mesh, this.lotus.group, this.constellations.group,
      this.scenery.group, this.scenery.sky, this.scenery.motes);
    this.auroraBase = 0;
    this.fever = 0; this.feverTarget = 0;
    this.breath = 0;                 // 0..1, set by the breathing chapter
    this.phase = 0.3;
    this.veilColor = new THREE.Color();
    this.setPhase(this.phase);
  }

  setPhase(p) {
    this.phase = p;
    let i = 0;
    while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = smooth(Math.min(1, Math.max(0, (p - a.p) / (b.p - a.p))));
    const u = this.sky.uniforms;
    u.uZenith.value.copy(mixHex(a.zen, b.zen, t));
    u.uHorizon.value.copy(mixHex(a.hor, b.hor, t));
    u.uGlowColor.value.copy(mixHex(a.glow, b.glow, t));
    u.uGlow.value = lerp(a.g, b.g, t);
    u.uGlowDir.value.set(lerp(a.gdir[0], b.gdir[0], t), 0, lerp(a.gdir[1], b.gdir[1], t)).normalize();
    u.uMilky.value = lerp(a.star, b.star, t);
    u.uMoonGlow.value = 0.4 + 0.6 * lerp(a.star, b.star, t);
    this.sky.stars.alpha = lerp(a.star, b.star, t);
    this.auroraBase = lerp(a.aur, b.aur, t);
    this.water.uniforms.uDeep.value.copy(mixHex(a.deep, b.deep, t));
    this.water.uniforms.uHorizon.value.copy(u.uHorizon.value);
    this.water.uniforms.uSpec.value = 0.4 + 0.6 * lerp(a.star, b.star, t);
    this.terrain.uniforms.uHorizon.value.copy(u.uHorizon.value);
    this.terrain.uniforms.uRock.value.copy(mixHex(a.rock, b.rock, t));
    this.terrain.uniforms.uRim.value.copy(mixHex(a.rim, b.rim, t));
    this.terrain.uniforms.uMist.value = lerp(a.mist, b.mist, t);
    this.particles.fireflyAlpha = lerp(a.fire, b.fire, t);
    this.scenery.setPalette(u.uHorizon.value, this.terrain.uniforms.uRock.value, this.terrain.uniforms.uRim.value, u.uZenith.value);
    // average scene colour, used by the dichoptic veil so it lowers contrast, not brightness
    const z = u.uZenith.value, h = u.uHorizon.value;
    this.veilColor.setRGB((z.x + h.x) * 0.5, (z.y + h.y) * 0.5, (z.z + h.z) * 0.5, THREE.SRGBColorSpace);
  }

  /** Starfall: meteors pour down and the aurora swells while a long combo lasts. */
  setFever(on) { this.feverTarget = on ? 1 : 0; this.scenery.setFever(on); }

  setPpd(ppd) {
    this.sky.stars.setPpd(ppd);
    this.particles.setPpd(ppd);
  }

  update(t, dt, head) {
    this.sky.update(t, head);
    this.terrain.update(t);
    this.water.update(t);
    this.particles.update(t);
    this.platform.update(t, dt);
    this.lotus.update(t, dt, this.app.view.ppd);
    this.constellations.update(t, this.app.view.ppd, head);
    this.fever += (this.feverTarget - this.fever) * Math.min(1, dt * 1.5);
    this.sky.aurora.intensity = Math.min(1.6, this.auroraBase * (1 + 0.7 * this.fever) + 0.35 * this.fever + 0.18 * this.breath);
    this.scenery.update(t, dt, head, this.app.view.ppd, this.breath);
  }
}
