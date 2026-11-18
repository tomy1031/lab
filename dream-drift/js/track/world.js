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

  const updaters = [];
  const ctx = {
    THREE, scene, track, props, course,
    rng: makeRng(course.seed || 1),
    add: (o) => { scene.add(o); return o; },
    onUpdate: (fn) => updaters.push(fn),
  };
  course.build(ctx);
  linearOutTree(scene);

  const focus = new THREE.Vector3();
  return {
    scene, track, sky, sun, hemi,
    update(dt, t, camera, target) {
      sky.position.copy(camera.position);
      sky.userData.update(dt, t);
      focus.copy(target || camera.position);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 120);
      for (const fn of updaters) fn(dt, t, camera);
    },
  };
}
