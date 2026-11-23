// track/world.js — assembles a course: sky, fog, lights, the road and the course's own scenery
import * as THREE from 'three';
import { Track } from './track.js';
import { makeSky } from './sky.js';
import { makeRng, linearOutTree } from '../engine/util.js';
import * as props from './props.js';

export function buildWorld(course, { shadowSize = 2048 } = {}) {
  const scene = new THREE.Scene();
  const th = course.theme;
  scene.fog = new THREE.Fog(th.fog.color, th.fog.near, th.fog.far);
  scene.environmentIntensity = th.envIntensity ?? 0.6;
  const sky = makeSky(th);
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(th.hemi.sky, th.hemi.ground, th.hemi.intensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(th.sun.color, th.sun.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  const S = 55;
  Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 260 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(...(th.sun.dir || th.sky.sunDir || [0.4, 0.6, -0.5])).normalize();

  const track = new Track(course);
  scene.add(track.buildMeshes(course.road));

  const updaters = [], hazards = [];
  const ctx = {
    THREE, scene, track, props, course,
    rng: makeRng(course.seed || 1),
    add: (o) => { scene.add(o); return o; },
    onUpdate: (fn) => updaters.push(fn),
    // things the race steps and karts can run into (trains): see track/rail.js
    addHazard: (h) => { hazards.push(h); return h; },
  };
  course.build(ctx);
  linearOutTree(scene);

  const focus = new THREE.Vector3();
  const lr = new THREE.Vector3().crossVectors(sunDir, new THREE.Vector3(0, 1, 0)).normalize();
  const lu = new THREE.Vector3().crossVectors(lr, sunDir).normalize();
  const texel = (2 * S) / shadowSize;
  return {
    scene, track, sky, sun, hemi, hazards,
    update(dt, t, camera, target) {
      sky.position.copy(camera.position);
      sky.userData.update(dt, t);
      focus.copy(target || camera.position);
      const a = Math.round(focus.dot(lr) / texel) * texel, b = Math.round(focus.dot(lu) / texel) * texel, c = focus.dot(sunDir);
      focus.copy(lr).multiplyScalar(a).addScaledVector(lu, b).addScaledVector(sunDir, c);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 120);
      for (const fn of updaters) fn(dt, t, camera);
    },
  };
}
