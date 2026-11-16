// Sky, sun, ambient light, fog and rain for a scene, from its setup (time / season / weather).
import * as THREE from 'three';

const TIMES = {
  morning: { top: '#8fc4ea', bottom: '#f6e6cf', sun: '#fff1d6', sunI: 2.4, hemiSky: '#cfe6ff', hemiGround: '#b8a58a', hemiI: 1.1, elev: 22, az: -60, fog: '#e9e2d6', exposure: 1.0 },
  noon: { top: '#5fa8e6', bottom: '#d9eefb', sun: '#ffffff', sunI: 2.9, hemiSky: '#d8ecff', hemiGround: '#a8a090', hemiI: 1.2, elev: 58, az: -30, fog: '#dce9f2', exposure: 1.0 },
  evening: { top: '#4d6aa6', bottom: '#f6b47c', sun: '#ffc68a', sunI: 2.0, hemiSky: '#f3c9a8', hemiGround: '#6a5a50', hemiI: 0.9, elev: 9, az: 70, fog: '#e8c2a2', exposure: 1.05 },
  night: { top: '#081226', bottom: '#1f2e4d', sun: '#9fb4ff', sunI: 0.35, hemiSky: '#3a4a78', hemiGround: '#1a1a22', hemiI: 0.55, elev: 40, az: 30, fog: '#152038', exposure: 1.15 },
};

function skyMaterial(top, bottom, night) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) }, night: { value: night ? 1 : 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float y = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(bottom, top, smoothstep(0.42, 1.0, y));
        if (night > 0.5 && vP.y > 0.05) { vec3 q = floor(vP * 380.0); float s = step(0.9975, h(q)); c += vec3(s) * 0.8; }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/**
 * @param {THREE.Scene} scene
 * @param {object} o { time, season, weather, indoor, center: Vector3, radius }
 * @returns {{ update(dt:number):void, dispose():void, exposure:number }}
 */
export function makeEnvironment(scene, o = {}) {
  const T = { ...(TIMES[o.time] || TIMES.noon) };
  const rain = o.weather === 'rain';
  const cloudy = o.weather === 'cloudy' || rain;
  if (cloudy) {
    T.top = rain ? '#7d8a99' : '#9fb0c2'; T.bottom = rain ? '#b9c0c8' : '#d7dde3';
    T.sunI *= rain ? 0.35 : 0.55; T.hemiI *= 1.1; T.fog = rain ? '#aab3bc' : '#cfd6dd';
    if (o.time === 'night') { T.top = '#0c1424'; T.bottom = '#1c2638'; }
  }
  const group = new THREE.Group();
  group.name = 'environment';
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), skyMaterial(T.top, T.bottom, o.time === 'night' && !cloudy));
  sky.renderOrder = -10;
  group.add(sky);

  const hemi = new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemiI * (o.indoor ? 0.85 : 1));
  group.add(hemi);

  const sun = new THREE.DirectionalLight(T.sun, T.sunI * (o.indoor ? 0.55 : 1));
  const el = THREE.MathUtils.degToRad(o.indoor ? 65 : T.elev);
  const az = THREE.MathUtils.degToRad(T.az);
  const c = o.center || new THREE.Vector3();
  sun.position.set(c.x + Math.cos(el) * Math.sin(az) * 20, c.y + Math.sin(el) * 20, c.z + Math.cos(el) * Math.cos(az) * 20);
  sun.target.position.copy(c);
  sun.castShadow = true;
  const r = o.radius || 9;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 60 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  group.add(sun, sun.target);

  if (!o.indoor) scene.fog = new THREE.Fog(T.fog, 35, 170);
  else scene.fog = null;

  let drops = null;
  if (rain && !o.indoor) {
    const n = 2600;
    const pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const x = c.x + (Math.random() - 0.5) * 30; const z = c.z + (Math.random() - 0.5) * 30; const y = Math.random() * 12;
      pos.set([x, y, z, x + 0.02, y - 0.35, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    drops = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.35 }));
    drops.frustumCulled = false;
    group.add(drops);
  }
  scene.add(group);

  return {
    exposure: T.exposure,
    sun,
    update(dt) {
      if (!drops) return;
      const p = drops.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 6) {
        p[i + 1] -= dt * 9; p[i + 4] -= dt * 9;
        if (p[i + 4] < 0) { p[i + 1] += 12; p[i + 4] += 12; }
      }
      drops.geometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      scene.fog = null;
      group.traverse((x) => { x.geometry?.dispose?.(); });
    },
  };
}
