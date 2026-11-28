// world/world.js — builds and updates the whole environment: terrain, sea + fresh water, sky, plants.
import * as THREE from 'three';
import { Terrain, LAYOUT } from './terrain.js';
import { Ocean } from './ocean.js';
import { SkySystem } from './sky.js';
import { Flora } from './flora.js';
import { NodeRegistry } from './nodes.js';

export class World {
  constructor(renderer, { seed = 7, quality } = {}) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.seed = seed;
    const q = renderer.q;
    this.terrain = new Terrain(seed);
    this.scene.add(this.terrain.buildMesh(q.terrainSeg));
    this.nodes = new NodeRegistry();
    this.ocean = new Ocean(this.terrain);
    this.ocean.addTo(this.scene);
    this.sky = new SkySystem(this.scene, renderer.r);
    this.sky.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.flora = new Flora(this.scene, this.terrain, this.nodes, seed, quality || q.flora);
    this.flora.build();
    this.layout = LAYOUT;
    this.seaLevel = 0;
  }

  /** hours: time of day; weather: { cloud, rain, fog, wind, storm }; tide in metres */
  update(dt, { hours, weather, tide, time }, focus, camera) {
    this.seaLevel = tide;
    const env = this.sky.update(dt, hours, weather, focus, time);
    env.tide = tide;
    this.ocean.update(env, camera);
    this.flora.update(time, weather.wind ?? 0.3, focus);
    this.env = env;
    return env;
  }
}
