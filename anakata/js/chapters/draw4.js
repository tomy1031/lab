// js/chapters/draw4.js — draw an n-dimensional wire figure in our 3D space: every vertex is projected with
// perspective along the extra axes (its "shadow"), edges become thick tubes, and the colour of each vertex
// tells its 4th coordinate (blue = kata, orange = ana), so the hidden direction is still visible.
import * as THREE from 'three';
import { Tubes, Beads } from '../tubes.js';
import { project, wColor } from '../math4.js';

export class Wire {
  constructor({ maxEdges = 200, maxVerts = 64, radius = 0.006, bead = 0.012, opacity = 1, fog = false, glow = 0.2 } = {}) {
    this.group = new THREE.Group();
    this.tubes = new Tubes(maxEdges, { opacity, fog, glow });
    this.beads = new Beads(maxVerts);
    this.group.add(this.tubes.mesh, this.beads.mesh);
    this.radius = radius;
    this.bead = bead;
    this.p = [];
  }

  // verts: rotated n-D coordinates; edges [[a,b]…]; opts: { n, d (light distance), scale, wMax,
  // edgeColor(i) → [r,g,b] | null (override), edgeWidth(i) → factor, vertexOn(i) → bool }
  draw(verts, edges, { n, d = 4, scale = 0.1, wMax = 2, edgeColor, edgeWidth, beadScale = 1, colorAxis = 3 } = {}) {
    const P = this.p;
    P.length = verts.length;
    for (let i = 0; i < verts.length; i++) {
      const q = project(verts[i], n, d, P[i] || [0, 0, 0, 1]);
      P[i] = q;
    }
    const col = verts.map((v) => (n > colorAxis ? wColor(v[colorAxis] / wMax) : [0.92, 0.94, 1]));
    const t = this.tubes.begin();
    for (let e = 0; e < edges.length; e++) {
      const [a, b] = edges[e];
      const A = P[a], B = P[b];
      const override = edgeColor && edgeColor(e);
      const k = edgeWidth ? edgeWidth(e) : 1;
      t.push(
        [A[0] * scale, A[1] * scale, A[2] * scale], [B[0] * scale, B[1] * scale, B[2] * scale],
        override || col[a], override || col[b],
        this.radius * k * Math.pow(A[3], 0.7), this.radius * k * Math.pow(B[3], 0.7),
      );
    }
    t.end();
    const bd = this.beads.begin();
    for (let i = 0; i < P.length; i++) bd.push([P[i][0] * scale, P[i][1] * scale, P[i][2] * scale], this.bead * beadScale * Math.pow(P[i][3], 0.7), col[i]);
    bd.end();
  }
}
