// world/sky.js — day/night and weather look: physical sky (three/addons Sky), sun + moon lights with a
// shadow box that follows the player, stars, a cloud layer whose cover follows the weather, fog, lightning.
import * as THREE from 'three';
import { Sky as SkyShader } from 'three/addons/objects/Sky.js';
import { clamp, lerp, smoothstep } from '../core/rng.js';

const cloudVert = /* glsl */`
varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const cloudFrag = /* glsl */`
uniform float uTime; uniform float uCover; uniform vec3 uLit; uniform vec3 uShade; uniform vec2 uWind; uniform float uDark;
varying vec3 vW;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec2 p = vW.xz * 0.004 + uWind * uTime;
  float n = fbm(p) * 0.75 + fbm(p * 2.7 + 11.0) * 0.25;
  float c = smoothstep(1.0 - uCover * 0.95 - 0.1, 1.05 - uCover * 0.55, n);
  float d = length(vW.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(900.0, 1700.0, d);
  vec3 col = mix(uLit, uShade, smoothstep(0.3, 1.0, c) * (0.4 + uDark * 0.6));
  gl_FragColor = vec4(col, c * fade * 0.95);
  #include <colorspace_fragment>
}`;

export class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    const sky = this.sky = new SkyShader();
    sky.scale.setScalar(4000);
    scene.add(sky);
    const u = sky.material.uniforms;
    u.turbidity.value = 4; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;

    this.hemi = new THREE.HemisphereLight('#bfe4ff', '#6b5a3a', 0.9);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff1d8', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    scene.add(sun); scene.add(sun.target);
    this.moon = new THREE.DirectionalLight('#9fb6ff', 0.0);
    scene.add(this.moon); scene.add(this.moon.target);

    // stars
    const n = 1600, pos = new Float32Array(n * 3), sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 1800; pos[i * 3 + 1] = Math.cos(ph) * 1800; pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 1800;
      sz[i] = Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -1;
    scene.add(this.stars);
    // moon disc
    const mc = document.createElement('canvas'); mc.width = mc.height = 128;
    const g = mc.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,240,1)'); grd.addColorStop(0.45, 'rgba(240,240,220,1)'); grd.addColorStop(0.5, 'rgba(200,210,255,0.35)'); grd.addColorStop(1, 'rgba(200,210,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(mc), transparent: true, depthWrite: false, fog: false }));
    this.moonSprite.scale.setScalar(160);
    scene.add(this.moonSprite);

    // clouds
    this.cloudU = {
      uTime: { value: 0 }, uCover: { value: 0.3 }, uLit: { value: new THREE.Color('#ffffff') }, uShade: { value: new THREE.Color('#8a97a8') },
      uWind: { value: new THREE.Vector2(0.004, 0.002) }, uDark: { value: 0 },
    };
    const cg = new THREE.PlaneGeometry(4000, 4000, 1, 1); cg.rotateX(Math.PI / 2);
    this.clouds = new THREE.Mesh(cg, new THREE.ShaderMaterial({ uniforms: this.cloudU, vertexShader: cloudVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.clouds.position.y = 160;
    this.clouds.renderOrder = 0;
    scene.add(this.clouds);

    scene.fog = new THREE.FogExp2('#bfe3f2', 0.0028);
    this.flash = 0;
    this.env = {
      sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), sky: new THREE.Color(), horizon: new THREE.Color(), night: 0, light: 1,
      time: 0, tide: 0, wave: 1, rain: 0,
    };
  }

  /** lightning flash (0…1 decays) */
  strike(power = 1) { this.flash = Math.max(this.flash, power); }

  /**
   * hours: 0…24 time of day. w: { cloud 0…1, rain 0…1, fog 0…1, wind 0…1, storm 0…1 }. focus: Vector3 (player).
   * Returns env for the ocean and other systems.
   */
  update(dt, hours, w, focus, time) {
    const env = this.env;
    // sun path: rises 6:00 east (+x), sets 18:00 west, tilted to the south (+z)
    const a = ((hours - 6) / 12) * Math.PI;
    const sunY = Math.sin(a);
    env.sunDir.set(Math.cos(a), sunY, 0.35).normalize();
    const day = smoothstep(-0.12, 0.25, sunY);
    const dusk = smoothstep(0.35, 0.0, Math.abs(sunY)) * smoothstep(-0.25, 0.0, sunY);
    env.night = 1 - day;
    const cloud = clamp(w.cloud ?? 0.2), rain = clamp(w.rain ?? 0), fog = clamp(w.fog ?? 0), storm = clamp(w.storm ?? 0);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(env.sunDir).multiplyScalar(1000);
    u.turbidity.value = lerp(3.5, 14, cloud);
    u.rayleigh.value = lerp(1.2, 0.5, cloud) + dusk * 1.5;
    u.mieCoefficient.value = lerp(0.004, 0.02, cloud);

    // colours
    const dayHorizon = new THREE.Color('#cfe8f2'), duskHorizon = new THREE.Color('#f2a66b'), nightHorizon = new THREE.Color('#0e1a2e');
    const overcast = new THREE.Color('#8e99a4'), stormC = new THREE.Color('#4a535d');
    env.horizon.copy(nightHorizon).lerp(dayHorizon, day).lerp(duskHorizon, dusk * 0.7);
    env.horizon.lerp(overcast.clone().multiplyScalar(lerp(0.18, 1, day)), cloud * 0.75).lerp(stormC.clone().multiplyScalar(lerp(0.15, 1, day)), storm * 0.8);
    env.sky.copy(new THREE.Color('#0a1222')).lerp(new THREE.Color('#4f9be0'), day).lerp(env.horizon, cloud * 0.6);
    env.sunColor.copy(new THREE.Color('#ffd2a0')).lerp(new THREE.Color('#fff4e2'), smoothstep(0.05, 0.5, sunY));

    // lights
    const sunVis = day * (1 - cloud * 0.72) * (1 - storm * 0.5);
    this.sun.intensity = 2.8 * sunVis;
    this.sun.color.copy(env.sunColor);
    this.sun.castShadow = sunVis > 0.12;
    const moonDir = env.sunDir.clone().negate(); moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.25; moonDir.normalize();
    this.moon.intensity = 0.6 * env.night * (1 - cloud * 0.7);
    this.hemi.intensity = lerp(0.24, 1.05, day) * (1 - storm * 0.35) + this.flash * 3;
    this.hemi.color.copy(env.sky).lerp(new THREE.Color('#ffffff'), 0.35);
    this.hemi.groundColor.set('#5b4a32').multiplyScalar(lerp(0.3, 1, day));
    env.light = clamp(sunVis + this.hemi.intensity * 0.4);
    if (focus) {
      this.sun.position.copy(focus).addScaledVector(env.sunDir, 120);
      this.sun.target.position.copy(focus);
      this.moon.position.copy(focus).addScaledVector(moonDir, 120);
      this.moon.target.position.copy(focus);
      this.moonSprite.position.copy(focus).addScaledVector(moonDir, 1500);
      this.stars.position.copy(focus);
      this.clouds.position.x = focus.x; this.clouds.position.z = focus.z;
      this.sky.position.copy(focus);
    }
    this.moonSprite.material.opacity = env.night * (1 - cloud);
    this.starMat.opacity = env.night * (1 - cloud * 1.1) * 0.9;

    // clouds
    const cu = this.cloudU;
    cu.uTime.value = time;
    cu.uCover.value = clamp(0.15 + cloud * 0.85);
    cu.uDark.value = clamp(cloud * 0.6 + storm * 0.6);
    cu.uLit.value.copy(new THREE.Color('#ffffff')).lerp(new THREE.Color('#ffc59a'), dusk * 0.8).multiplyScalar(lerp(0.12, 1, day));
    cu.uShade.value.copy(new THREE.Color('#7d8796')).lerp(new THREE.Color('#3e4550'), storm).multiplyScalar(lerp(0.1, 1, day));
    const wind = (w.wind ?? 0.3);
    cu.uWind.value.set(0.003 + wind * 0.01, 0.0015 + wind * 0.004);

    // fog
    const fogCol = env.horizon.clone();
    if (rain > 0) fogCol.lerp(new THREE.Color('#7d8790').multiplyScalar(lerp(0.15, 1, day)), rain * 0.6);
    this.scene.fog.color.copy(fogCol);
    this.scene.fog.density = 0.0022 + fog * 0.018 + rain * 0.006 + env.night * 0.0015;
    this.renderer.setClearColor(fogCol);

    // lightning decay
    this.flash = Math.max(0, this.flash - dt * 4);
    env.wave = 0.6 + wind * 1.4 + storm * 1.2;
    env.rain = rain;
    env.time = time;
    return env;
  }
}
