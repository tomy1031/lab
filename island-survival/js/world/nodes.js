// world/nodes.js — registry of interactable things in the world (plants, rocks, animals' carcasses, dropped
// items, structures …) with a spatial hash for fast "what is near / in front of me" queries.
//
// A node: { id, kind, x, y, z, r, alive, mesh?, index? (InstancedMesh slot), object3d?, data: {} }
// Instanced nodes are hidden by scaling their instance matrix to zero and restored from node.matrix.
import * as THREE from 'three';

const CELL = 8;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class NodeRegistry {
  constructor() {
    this.cells = new Map();
    this.all = new Map();
    this.nextId = 1;
  }

  key(x, z) { return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; }

  add(node) {
    node.id = node.id || this.nextId++;
    if (node.alive === undefined) node.alive = true;
    node.data = node.data || {};
    this.all.set(node.id, node);
    const k = this.key(node.x, node.z);
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = new Set()));
    c.add(node);
    node._cell = k;
    return node;
  }

  remove(node) {
    this.all.delete(node.id);
    this.cells.get(node._cell)?.delete(node);
    if (node.object3d?.parent) node.object3d.parent.remove(node.object3d);
  }

  move(node, x, z) {
    const k = this.key(x, z);
    node.x = x; node.z = z;
    if (k !== node._cell) {
      this.cells.get(node._cell)?.delete(node);
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, (c = new Set()));
      c.add(node);
      node._cell = k;
    }
  }

  /** nodes within radius r of (x, z) */
  query(x, z, r, filter = null) {
    const out = [];
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL);
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const c = this.cells.get(`${i},${j}`);
        if (!c) continue;
        for (const n of c) {
          if (!n.alive && !n.showDead) continue;
          const d = Math.hypot(n.x - x, n.z - z) - (n.r || 0);
          if (d <= r && (!filter || filter(n))) out.push(n);
        }
      }
    }
    return out;
  }

  /**
   * The node the player is looking at: within reach, inside a cone in front, best score = angle + distance.
   * pos: Vector3 eye, dir: Vector3 forward (normalised)
   */
  pick(pos, dir, reach = 2.8, filter = null) {
    const cands = this.query(pos.x, pos.z, reach + 2, filter);
    let best = null, bestScore = Infinity;
    const fx = dir.x, fz = dir.z, fl = Math.hypot(fx, fz) || 1;
    for (const n of cands) {
      const dx = n.x - pos.x, dz = n.z - pos.z;
      const d = Math.hypot(dx, dz);
      const reachN = reach + (n.r || 0) * 0.8;
      if (d > reachN) continue;
      // vertical: things far below/above are not reachable
      const dy = (n.y + (n.pickY ?? 0.5)) - pos.y;
      if (Math.abs(dy) > 3.2) continue;
      const cos = d < 0.6 ? 1 : (dx * fx + dz * fz) / (d * fl);
      if (cos < 0.55) continue;
      const score = d * 0.6 + (1 - cos) * 6 - (n.priority || 0);
      if (score < bestScore) { bestScore = score; best = n; }
    }
    return best;
  }

  hide(node) {
    node.alive = false;
    if (node.mesh && node.index !== undefined) {
      node.mesh.setMatrixAt(node.index, ZERO);
      node.mesh.instanceMatrix.needsUpdate = true;
    }
    if (node.object3d) node.object3d.visible = false;
  }

  show(node) {
    node.alive = true;
    if (node.mesh && node.index !== undefined && node.matrix) {
      node.mesh.setMatrixAt(node.index, node.matrix);
      node.mesh.instanceMatrix.needsUpdate = true;
    }
    if (node.object3d) node.object3d.visible = true;
  }

  /** shrink an instanced node (e.g. a bush after picking berries) */
  setScale(node, s) {
    if (!(node.mesh && node.index !== undefined && node.matrix)) return;
    const m = node.matrix.clone();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(p, q, sc);
    sc.multiplyScalar(s);
    m.compose(p, q, sc);
    node.mesh.setMatrixAt(node.index, m);
    node.mesh.instanceMatrix.needsUpdate = true;
  }

  byKind(kind) {
    const out = [];
    for (const n of this.all.values()) if (n.kind === kind) out.push(n);
    return out;
  }

  /** collision circles near a point (trees, boulders, structures) for the player controller */
  solids(x, z, r = 3) {
    return this.query(x, z, r, (n) => n.solid);
  }
}
