// js/chapters/hub.js — the opening space: you stand on a platform in "the bulk", and a large tesseract turns
// slowly in front of you in a double rotation (XY and ZW at once), the motion that has no axis.
import { Chapter } from './base.js';
import { Wire } from './draw4.js';
import { hypercube, identity, rotate } from '../math4.js';

export class Hub extends Chapter {
  constructor(app) {
    super(app, { id: 'hub', title: 'ANAKATA', tag: 'math' });
    this.cube = hypercube(4);
    this.wire = new Wire({ maxEdges: 40, maxVerts: 20, radius: 0.016, bead: 0.032, glow: 0.35 });
    this.wire.group.position.set(0.25, 1.75, -3.2);
    this.root.add(this.wire.group);
    this.R = identity(4);
    this.steps = [{ title: '', text: '' }];
    this.view = { pos: [0, 1.55, 0.6], yaw: 0, pitch: 0.02 };
  }

  update(dt) {
    rotate(this.R, 4, 0, 1, dt * 0.13);
    rotate(this.R, 4, 2, 3, dt * 0.21);
    rotate(this.R, 4, 1, 3, dt * 0.05);
    const v = this.cube.verts.map((p) => {
      const o = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) o[i] += this.R[i * 4 + k] * p[k];
      return o;
    });
    this.wire.draw(v, this.cube.edges, { n: 4, d: 3.2, scale: 0.42, wMax: 1.6 });
  }
}
