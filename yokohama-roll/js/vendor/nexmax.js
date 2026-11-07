// NexMax (ネクマックス) procedural character, bundled for ハマころ！ — DO NOT EDIT;
// regenerate with tools/build-nexmax.mjs (npm run build:nexmax).
// Source: origin/claude/ai-employee-3d-visualization-bgkso0 @ d133bb073ee9d1efe53a8395f00f108745f081f4 (2026-11-05T12:50:32+00:00)
//         ai-company/client/src/world/{characters.ts,nexmax/anim.ts,nexmax/body.ts,nexmax/geom.ts,nexmax/head.ts,nexmax/materials.ts,nexmax/nexmaxModel.ts,nexmax/production.ts}
//         (ported from tomy1031/nexmax_chronicle). Patches applied: nexmax/materials.ts
// Bundled with esbuild; external: "three" only (built and checked against three 0.170.0).


// nexmax/nexmaxModel.ts
import * as THREE6 from "three";

// nexmax/body.ts
import * as THREE4 from "three";

// nexmax/geom.ts
import * as THREE from "three";

// node_modules/three/examples/jsm/utils/BufferGeometryUtils.js
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  TriangleFanDrawMode,
  TriangleStripDrawMode,
  TrianglesDrawMode,
  Vector3
} from "three";
function mergeGeometries(geometries, useGroups = false) {
  const isIndexed = geometries[0].index !== null;
  const attributesUsed = new Set(Object.keys(geometries[0].attributes));
  const morphAttributesUsed = new Set(Object.keys(geometries[0].morphAttributes));
  const attributes = {};
  const morphAttributes = {};
  const morphTargetsRelative = geometries[0].morphTargetsRelative;
  const mergedGeometry = new BufferGeometry();
  let offset = 0;
  for (let i = 0; i < geometries.length; ++i) {
    const geometry = geometries[i];
    let attributesCount = 0;
    if (isIndexed !== (geometry.index !== null)) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them.");
      return null;
    }
    for (const name in geometry.attributes) {
      if (!attributesUsed.has(name)) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + '. All geometries must have compatible attributes; make sure "' + name + '" attribute exists among all geometries, or in none of them.');
        return null;
      }
      if (attributes[name] === void 0) attributes[name] = [];
      attributes[name].push(geometry.attributes[name]);
      attributesCount++;
    }
    if (attributesCount !== attributesUsed.size) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". Make sure all geometries have the same number of attributes.");
      return null;
    }
    if (morphTargetsRelative !== geometry.morphTargetsRelative) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". .morphTargetsRelative must be consistent throughout all geometries.");
      return null;
    }
    for (const name in geometry.morphAttributes) {
      if (!morphAttributesUsed.has(name)) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ".  .morphAttributes must be consistent throughout all geometries.");
        return null;
      }
      if (morphAttributes[name] === void 0) morphAttributes[name] = [];
      morphAttributes[name].push(geometry.morphAttributes[name]);
    }
    if (useGroups) {
      let count;
      if (isIndexed) {
        count = geometry.index.count;
      } else if (geometry.attributes.position !== void 0) {
        count = geometry.attributes.position.count;
      } else {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index " + i + ". The geometry must have either an index or a position attribute");
        return null;
      }
      mergedGeometry.addGroup(offset, count, i);
      offset += count;
    }
  }
  if (isIndexed) {
    let indexOffset = 0;
    const mergedIndex = [];
    for (let i = 0; i < geometries.length; ++i) {
      const index = geometries[i].index;
      for (let j = 0; j < index.count; ++j) {
        mergedIndex.push(index.getX(j) + indexOffset);
      }
      indexOffset += geometries[i].attributes.position.count;
    }
    mergedGeometry.setIndex(mergedIndex);
  }
  for (const name in attributes) {
    const mergedAttribute = mergeAttributes(attributes[name]);
    if (!mergedAttribute) {
      console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " attribute.");
      return null;
    }
    mergedGeometry.setAttribute(name, mergedAttribute);
  }
  for (const name in morphAttributes) {
    const numMorphTargets = morphAttributes[name][0].length;
    if (numMorphTargets === 0) break;
    mergedGeometry.morphAttributes = mergedGeometry.morphAttributes || {};
    mergedGeometry.morphAttributes[name] = [];
    for (let i = 0; i < numMorphTargets; ++i) {
      const morphAttributesToMerge = [];
      for (let j = 0; j < morphAttributes[name].length; ++j) {
        morphAttributesToMerge.push(morphAttributes[name][j][i]);
      }
      const mergedMorphAttribute = mergeAttributes(morphAttributesToMerge);
      if (!mergedMorphAttribute) {
        console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the " + name + " morphAttribute.");
        return null;
      }
      mergedGeometry.morphAttributes[name].push(mergedMorphAttribute);
    }
  }
  return mergedGeometry;
}
function mergeAttributes(attributes) {
  let TypedArray;
  let itemSize;
  let normalized;
  let gpuType = -1;
  let arrayLength = 0;
  for (let i = 0; i < attributes.length; ++i) {
    const attribute = attributes[i];
    if (TypedArray === void 0) TypedArray = attribute.array.constructor;
    if (TypedArray !== attribute.array.constructor) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes.");
      return null;
    }
    if (itemSize === void 0) itemSize = attribute.itemSize;
    if (itemSize !== attribute.itemSize) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes.");
      return null;
    }
    if (normalized === void 0) normalized = attribute.normalized;
    if (normalized !== attribute.normalized) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes.");
      return null;
    }
    if (gpuType === -1) gpuType = attribute.gpuType;
    if (gpuType !== attribute.gpuType) {
      console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes.");
      return null;
    }
    arrayLength += attribute.count * itemSize;
  }
  const array = new TypedArray(arrayLength);
  const result = new BufferAttribute(array, itemSize, normalized);
  let offset = 0;
  for (let i = 0; i < attributes.length; ++i) {
    const attribute = attributes[i];
    if (attribute.isInterleavedBufferAttribute) {
      const tupleOffset = offset / itemSize;
      for (let j = 0, l = attribute.count; j < l; j++) {
        for (let c = 0; c < itemSize; c++) {
          const value = attribute.getComponent(j, c);
          result.setComponent(j + tupleOffset, c, value);
        }
      }
    } else {
      array.set(attribute.array, offset);
    }
    offset += attribute.count * itemSize;
  }
  if (gpuType !== void 0) {
    result.gpuType = gpuType;
  }
  return result;
}
function mergeVertices(geometry, tolerance = 1e-4) {
  tolerance = Math.max(tolerance, Number.EPSILON);
  const hashToIndex = {};
  const indices = geometry.getIndex();
  const positions = geometry.getAttribute("position");
  const vertexCount = indices ? indices.count : positions.count;
  let nextIndex = 0;
  const attributeNames = Object.keys(geometry.attributes);
  const tmpAttributes = {};
  const tmpMorphAttributes = {};
  const newIndices = [];
  const getters = ["getX", "getY", "getZ", "getW"];
  const setters = ["setX", "setY", "setZ", "setW"];
  for (let i = 0, l = attributeNames.length; i < l; i++) {
    const name = attributeNames[i];
    const attr = geometry.attributes[name];
    tmpAttributes[name] = new attr.constructor(
      new attr.array.constructor(attr.count * attr.itemSize),
      attr.itemSize,
      attr.normalized
    );
    const morphAttributes = geometry.morphAttributes[name];
    if (morphAttributes) {
      if (!tmpMorphAttributes[name]) tmpMorphAttributes[name] = [];
      morphAttributes.forEach((morphAttr, i2) => {
        const array = new morphAttr.array.constructor(morphAttr.count * morphAttr.itemSize);
        tmpMorphAttributes[name][i2] = new morphAttr.constructor(array, morphAttr.itemSize, morphAttr.normalized);
      });
    }
  }
  const halfTolerance = tolerance * 0.5;
  const exponent = Math.log10(1 / tolerance);
  const hashMultiplier = Math.pow(10, exponent);
  const hashAdditive = halfTolerance * hashMultiplier;
  for (let i = 0; i < vertexCount; i++) {
    const index = indices ? indices.getX(i) : i;
    let hash = "";
    for (let j = 0, l = attributeNames.length; j < l; j++) {
      const name = attributeNames[j];
      const attribute = geometry.getAttribute(name);
      const itemSize = attribute.itemSize;
      for (let k = 0; k < itemSize; k++) {
        hash += `${~~(attribute[getters[k]](index) * hashMultiplier + hashAdditive)},`;
      }
    }
    if (hash in hashToIndex) {
      newIndices.push(hashToIndex[hash]);
    } else {
      for (let j = 0, l = attributeNames.length; j < l; j++) {
        const name = attributeNames[j];
        const attribute = geometry.getAttribute(name);
        const morphAttributes = geometry.morphAttributes[name];
        const itemSize = attribute.itemSize;
        const newArray = tmpAttributes[name];
        const newMorphArrays = tmpMorphAttributes[name];
        for (let k = 0; k < itemSize; k++) {
          const getterFunc = getters[k];
          const setterFunc = setters[k];
          newArray[setterFunc](nextIndex, attribute[getterFunc](index));
          if (morphAttributes) {
            for (let m = 0, ml = morphAttributes.length; m < ml; m++) {
              newMorphArrays[m][setterFunc](nextIndex, morphAttributes[m][getterFunc](index));
            }
          }
        }
      }
      hashToIndex[hash] = nextIndex;
      newIndices.push(nextIndex);
      nextIndex++;
    }
  }
  const result = geometry.clone();
  for (const name in geometry.attributes) {
    const tmpAttribute = tmpAttributes[name];
    result.setAttribute(name, new tmpAttribute.constructor(
      tmpAttribute.array.slice(0, nextIndex * tmpAttribute.itemSize),
      tmpAttribute.itemSize,
      tmpAttribute.normalized
    ));
    if (!(name in tmpMorphAttributes)) continue;
    for (let j = 0; j < tmpMorphAttributes[name].length; j++) {
      const tmpMorphAttribute = tmpMorphAttributes[name][j];
      result.morphAttributes[name][j] = new tmpMorphAttribute.constructor(
        tmpMorphAttribute.array.slice(0, nextIndex * tmpMorphAttribute.itemSize),
        tmpMorphAttribute.itemSize,
        tmpMorphAttribute.normalized
      );
    }
  }
  result.setIndex(newIndices);
  return result;
}

// nexmax/geom.ts
var _a = new THREE.Vector3();
var _b = new THREE.Vector3();
var _c = new THREE.Vector3();
var _n = new THREE.Vector3();
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function spow(x, p) {
  return Math.sign(x) * Math.pow(Math.abs(x), p);
}
function fixWinding(g) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const idx = g.index;
  if (!idx || !nor) return g;
  const arr = idx.array;
  for (let i = 0; i < arr.length; i += 3) {
    const i0 = arr[i];
    const i1 = arr[i + 1];
    const i2 = arr[i + 2];
    _a.fromBufferAttribute(pos, i0);
    _b.fromBufferAttribute(pos, i1).sub(_a);
    _c.fromBufferAttribute(pos, i2).sub(_a);
    _b.cross(_c);
    if (_b.lengthSq() < 1e-20) continue;
    _n.fromBufferAttribute(nor, i0);
    _a.fromBufferAttribute(nor, i1);
    _n.add(_a);
    _a.fromBufferAttribute(nor, i2);
    _n.add(_a);
    if (_b.dot(_n) < 0) {
      arr[i + 1] = i2;
      arr[i + 2] = i1;
    }
  }
  idx.needsUpdate = true;
  return g;
}
function finalize(g, color = "#ffffff") {
  if (!g.index) {
    const n2 = g.attributes.position.count;
    const ix = new Uint32Array(n2);
    for (let i = 0; i < n2; i++) ix[i] = i;
    g.setIndex(new THREE.BufferAttribute(ix, 1));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) paint(g, color);
  for (const k of Object.keys(g.attributes)) {
    if (k !== "position" && k !== "normal" && k !== "uv" && k !== "color" && k !== "aOutline") g.deleteAttribute(k);
  }
  return g;
}
function paint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}
function flatUV(g, u, v) {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    arr[i * 2] = u;
    arr[i * 2 + 1] = v;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(arr, 2));
  return g;
}
function smoothNormals(g) {
  const p = new THREE.BufferGeometry();
  p.setAttribute("position", g.attributes.position.clone());
  if (g.index) p.setIndex(g.index.clone());
  const m = mergeVertices(p, 1e-5);
  m.computeVertexNormals();
  return fixWinding(m);
}
function merge(list) {
  const anyHull = list.some((g) => !!g.attributes.aOutline);
  const prepared = list.map((g) => {
    finalize(g);
    if (anyHull && !g.attributes.aOutline) g.setAttribute("aOutline", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    return g;
  });
  const m = mergeGeometries(prepared, false);
  if (!m) throw new Error("[nexmax] mergeGeometries failed");
  return m;
}
function withHull(g) {
  finalize(g);
  const n = g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv", "color"]) {
    const a = g.attributes[name];
    const arr = new Float32Array(a.count * a.itemSize * 2);
    arr.set(a.array, 0);
    arr.set(a.array, a.count * a.itemSize);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  const ol = new Float32Array(n * 2);
  ol.fill(1, n);
  out.setAttribute("aOutline", new THREE.BufferAttribute(ol, 1));
  const src = g.index.array;
  const ix = new Uint32Array(src.length * 2);
  for (let i = 0; i < src.length; i += 3) {
    ix[i] = src[i];
    ix[i + 1] = src[i + 1];
    ix[i + 2] = src[i + 2];
    const j = src.length + i;
    ix[j] = src[i] + n;
    ix[j + 1] = src[i + 2] + n;
    ix[j + 2] = src[i + 1] + n;
  }
  out.setIndex(new THREE.BufferAttribute(ix, 1));
  return out;
}
function lathe(profile, seg, phiStart = 0) {
  const n = profile.length;
  const pos = [];
  const nor = [];
  const uv = [];
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const [, y] of profile) {
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  }
  const prof2n = profile.map((_, i) => {
    const p0 = profile[Math.max(0, i - 1)];
    const p1 = profile[Math.min(n - 1, i + 1)];
    let dr = p1[0] - p0[0];
    let dy = p1[1] - p0[1];
    const l = Math.hypot(dr, dy) || 1;
    dr /= l;
    dy /= l;
    return [-dy, dr];
  });
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i];
    const [nr, ny] = prof2n[i];
    for (let j = 0; j <= seg; j++) {
      const phi = phiStart + j / seg * Math.PI * 2;
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      pos.push(r * s, y, r * c);
      nor.push(nr * s, ny, nr * c);
      uv.push(j / seg, (y - ymin) / (ymax - ymin || 1));
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j;
      const b = (i + 1) * (seg + 1) + j;
      if (profile[i][0] > 1e-6) idx.push(a, b, a + 1);
      if (profile[i + 1][0] > 1e-6) idx.push(b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return fixWinding(g);
}
function beadProfile(rTop, rBot, len, p = 2.4, n = 12, bulge = 0) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const th = Math.PI * i / n;
    const y = len / 2 * spow(Math.cos(th), 2 / p);
    const rr = Math.pow(Math.abs(Math.sin(th)), 2 / p);
    const t = (1 - y / (len / 2)) / 2;
    const R = lerp(rTop, rBot, t) * (1 + bulge * Math.sin(Math.PI * t));
    out.push([R * rr, y]);
  }
  out[0][0] = 0;
  out[n][0] = 0;
  return out;
}
function ball(r, seg = 16, rings = 10, sy = 1) {
  const prof = [];
  for (let i = 0; i <= rings; i++) {
    const th = Math.PI * i / rings;
    prof.push([Math.sin(th) * r, Math.cos(th) * r * sy]);
  }
  prof[0][0] = 0;
  prof[rings][0] = 0;
  return lathe(prof, seg);
}
function scaleGeo(g, sx, sy, sz) {
  const m = new THREE.Matrix4().makeScale(sx, sy, sz);
  g.applyMatrix4(m);
  return g;
}
function place(g, x, y, z, rx = 0, ry = 0, rz = 0, order = "XYZ") {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, order)),
    new THREE.Vector3(1, 1, 1)
  );
  g.applyMatrix4(m);
  return g;
}
function blobF(s, x, y, z) {
  const r = s.r ?? 2;
  const up = y >= 0;
  const t = up ? s.tTop ?? 2 : s.tBot ?? 2;
  const b = up ? s.bTop : s.bBot;
  const c = z <= 0 ? s.cFront : s.cBack ?? s.cFront;
  const h = Math.pow(Math.abs(x / s.a), r) + Math.pow(Math.abs(z / c), r);
  return Math.pow(h, t / r) + Math.pow(Math.abs(y / b), t);
}
function blobRay(s, dx, dy, dz) {
  let lo = 0;
  let hi = Math.max(s.a, s.bTop, s.bBot, s.cFront, s.cBack ?? 0) * 1.5;
  for (let k = 0; k < 28; k++) {
    const m = (lo + hi) / 2;
    if (blobF(s, dx * m, dy * m, dz * m) > 1) hi = m;
    else lo = m;
  }
  return (lo + hi) / 2;
}
function blob(s, wSeg, hSeg, deform) {
  const sph = new THREE.SphereGeometry(1, wSeg, hSeg);
  const pos = sph.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = blobRay(s, v.x, v.y, v.z);
    v.multiplyScalar(d);
    if (deform) deform(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return smoothNormals(sph);
}
function blobFrontHit(s, x, y, out, normal, back = false) {
  if (blobF(s, x, y, 0) >= 1) return false;
  let lo = 0;
  let hi = (back ? s.cBack ?? s.cFront : s.cFront) * 1.0001;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (blobF(s, x, y, back ? m : -m) > 1) hi = m;
    else lo = m;
  }
  const z = back ? (lo + hi) / 2 : -(lo + hi) / 2;
  out.set(x, y, z);
  const e = 1e-4;
  normal.set(
    blobF(s, x + e, y, z) - blobF(s, x - e, y, z),
    blobF(s, x, y + e, z) - blobF(s, x, y - e, z),
    blobF(s, x, y, z + e) - blobF(s, x, y, z - e)
  ).normalize();
  return true;
}
function projectPatch(spec) {
  const { outline, center, rings, offset, surface } = spec;
  const N = outline.length;
  const pos = [];
  const tmpP = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  const push = (x, y, h) => {
    if (!surface(x, y, tmpP, tmpN)) {
      tmpP.set(x, y, 0);
      tmpN.set(0, 0, -1);
    }
    pos.push(tmpP.x + tmpN.x * h, tmpP.y + tmpN.y * h, tmpP.z + tmpN.z * h);
  };
  const ringStart = [];
  if (!spec.ringOnly) push(center[0], center[1], offset(0, Infinity, 1));
  for (let i = 0; i < rings.length; i++) {
    const s = rings[i];
    if (!spec.ringOnly && s === 0) continue;
    ringStart.push(pos.length / 3);
    for (let j = 0; j < N; j++) {
      const dx = outline[j][0] - center[0];
      const dy = outline[j][1] - center[1];
      const R = Math.hypot(dx, dy);
      push(center[0] + dx * s, center[1] + dy * s, offset(s, (1 - s) * R, R));
    }
  }
  const idx = [];
  if (!spec.ringOnly && ringStart.length) {
    const r0 = ringStart[0];
    for (let j = 0; j < N; j++) idx.push(0, r0 + j, r0 + (j + 1) % N);
  }
  for (let k = 0; k < ringStart.length - 1; k++) {
    const a0 = ringStart[k];
    const b0 = ringStart[k + 1];
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      idx.push(a0 + j, b0 + j, b0 + j1);
      idx.push(a0 + j, b0 + j1, a0 + j1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  orientOutward(g, center, surface);
  return g;
}
function orientOutward(g, center, surface) {
  const p = new THREE.Vector3();
  const sn = new THREE.Vector3();
  if (!surface(center[0], center[1], p, sn)) sn.set(0, 0, -1);
  const nor = g.attributes.normal;
  let dot = 0;
  for (let i = 0; i < nor.count; i++) dot += nor.getX(i) * sn.x + nor.getY(i) * sn.y + nor.getZ(i) * sn.z;
  if (dot < 0) {
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  }
  fixWinding(g);
}
function superEllipse(cx, cy, rx, ryTop, ryBot, nTop, nBot, count, startAngle = 0) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = startAngle + i / count * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const up = s >= 0;
    const n = up ? nTop : nBot;
    const ry = up ? ryTop : ryBot;
    const r = Math.pow(Math.pow(Math.abs(c / rx), n) + Math.pow(Math.abs(s / ry), n), -1 / n);
    out.push([cx + c * r, cy + s * r]);
  }
  return out;
}
function inflate(outline, center, w) {
  return outline.map(([x, y]) => {
    const dx = x - center[0];
    const dy = y - center[1];
    const l = Math.hypot(dx, dy) || 1;
    return [x + dx / l * w, y + dy / l * w];
  });
}
function strokeTube(pts2, surface, h, radius, flatten = 0.55, radial = 8) {
  const P = [];
  const Nn = [];
  for (const [x, y] of pts2) {
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    if (!surface(x, y, p, n)) n.set(0, 0, -1);
    P.push(p.addScaledVector(n, h));
    Nn.push(n);
  }
  const M = P.length;
  const pos = [];
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i < M; i++) {
    T.copy(P[Math.min(M - 1, i + 1)]).sub(P[Math.max(0, i - 1)]).normalize();
    B.crossVectors(T, Nn[i]).normalize();
    const u = i / (M - 1);
    const e = Math.min(u, 1 - u) * (M - 1);
    const taper = e >= 1.5 ? 1 : Math.sqrt(Math.max(0, 1 - Math.pow(1 - e / 1.5, 2)));
    const r = radius * Math.max(0.05, taper);
    for (let k = 0; k < radial; k++) {
      const th = k / radial * Math.PI * 2;
      const cx = Math.cos(th) * r;
      const cy = Math.sin(th) * r * flatten;
      pos.push(P[i].x + B.x * cx + Nn[i].x * cy, P[i].y + B.y * cx + Nn[i].y * cy, P[i].z + B.z * cx + Nn[i].z * cy);
    }
  }
  const idx = [];
  for (let i = 0; i < M - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * radial + k;
      const b = i * radial + (k + 1) % radial;
      const c2 = (i + 1) * radial + k;
      const d = (i + 1) * radial + (k + 1) % radial;
      idx.push(a, c2, b, b, c2, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < M; i++) {
    for (let k = 0; k < radial; k++) {
      const vi = i * radial + k;
      v.fromBufferAttribute(g.attributes.position, vi);
      c.copy(v).sub(P[i]);
      const nn = new THREE.Vector3().fromBufferAttribute(nor, vi);
      if (nn.dot(c) < 0) nor.setXYZ(vi, -nn.x, -nn.y, -nn.z);
    }
  }
  return fixWinding(g);
}
function facet(g) {
  const f = g.index ? g.toNonIndexed() : g;
  f.deleteAttribute("normal");
  f.computeVertexNormals();
  return f;
}

// nexmax/head.ts
import * as THREE3 from "three";

// nexmax/materials.ts
import * as THREE2 from "three";
var NX_COLORS = {
  body: "#66b2f0",
  plate: "#f6f6f4",
  eye: "#141416",
  brow: "#202228",
  mouth: "#fb7a52",
  mouthDark: "#c2412b",
  mouthLine: "#3a1c16",
  plateLine: "#4f6f98",
  logoDark: "#045ea1",
  logoLight: "#1496d6",
  logoRight: "#0361a4",
  outline: "#16223a",
  claw: "#dfeaf2"
};
var OUTLINE = {
  width: { value: 21e-4 },
  minWorld: { value: 26e-4 },
  minPx: { value: 1.6 },
  viewportH: { value: 720 },
  color: { value: new THREE2.Color(NX_COLORS.outline) }
};
function setOutlineViewport(heightPx) {
  OUTLINE.viewportH.value = Math.max(1, heightPx);
}
var OUTLINE_WIDTH_GLSL = (
  /* glsl */
  `
float nxOutlineWidth(float viewZ, float minWorld) {
  float frac = max(uOutlineWidth, uOutlineMinPx / max(uOutlineViewH, 1.0));
  return max(minWorld, frac * 2.0 * viewZ / projectionMatrix[1][1]);
}
`
);
var SELF_LIGHT = { value: 0.2 };
function withOutlineShader(mat, key) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = OUTLINE.width;
    shader.uniforms.uOutlineMin = OUTLINE.minWorld;
    shader.uniforms.uOutlineMinPx = OUTLINE.minPx;
    shader.uniforms.uOutlineViewH = OUTLINE.viewportH;
    shader.uniforms.uOutlineColor = OUTLINE.color;
    shader.uniforms.uSelfLight = SELF_LIGHT;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nattribute float aOutline;\nvarying float vOutline;\nuniform float uOutlineWidth;\nuniform float uOutlineMin;\nuniform float uOutlineMinPx;\nuniform float uOutlineViewH;\n" + OUTLINE_WIDTH_GLSL
    ).replace(
      "#include <project_vertex>",
      `#include <project_vertex>
  vOutline = aOutline;
  if (aOutline > 0.5) {
    vec3 nV = normalize(normalMatrix * objectNormal);
    // 画面上でほぼ一定の太さ（距離 × 画角で換算）。近いときは最小の太さ、低い解像度でも最小の画素数を保つ
    float wv = nxOutlineWidth(-mvPosition.z, uOutlineMin);
    mvPosition.xyz += nV * wv;
    gl_Position = projectionMatrix * mvPosition;
  }`
    );
    if (!shader.vertexShader.includes("#include <project_vertex>") || !shader.fragmentShader.includes("#include <emissivemap_fragment>"))
      console.warn("[nexmax] outline shader hooks not found in this three.js build (" + THREE2.REVISION + ")");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vOutline;\nuniform vec3 uOutlineColor;\nuniform float uSelfLight;").replace("void main() {", "void main() {\n  if (vOutline > 0.5) { gl_FragColor = vec4(uOutlineColor, 1.0); return; }").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * uSelfLight;");
  };
  mat.customProgramCacheKey = () => "nxOutline-" + key;
  return mat;
}
function createHullDepthMaterial() {
  const m = new THREE2.MeshDepthMaterial();
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute float aOutline;").replace("#include <project_vertex>", "#include <project_vertex>\n  if (aOutline > 0.5) gl_Position = vec4(0.0, 0.0, -10.0, 1.0);");
  };
  m.customProgramCacheKey = () => "nxHullDepth";
  return m;
}
function vinyl(color, map = null) {
  return new THREE2.MeshPhysicalMaterial({
    color,
    map,
    roughness: 0.62,
    metalness: 0,
    sheen: 0.25,
    sheenRoughness: 0.75,
    sheenColor: new THREE2.Color("#cfeaff"),
    clearcoat: 0.08,
    clearcoatRoughness: 0.6,
    vertexColors: true
  });
}
function makeTorsoTexture(spec) {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = NX_COLORS.body;
  ctx.fillRect(0, 0, W, H);
  const x0 = (spec.logoU - spec.logoW / 2) * W;
  const y0 = (1 - spec.logoV - spec.logoH / 2) * H;
  const w = spec.logoW * W;
  const h = spec.logoH * H;
  const poly = (pts, col) => {
    ctx.beginPath();
    pts.forEach(([u, v], i) => {
      const x = x0 + u * w;
      const y = y0 + v * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  };
  poly(
    [
      [0, 0.4108],
      [0, 1],
      [0.525, 1]
    ],
    NX_COLORS.logoDark
  );
  poly(
    [
      [1, 0],
      [1, 1],
      [0.95, 1],
      [0.5375, 0.5212]
    ],
    NX_COLORS.logoRight
  );
  poly(
    [
      [0.1825, 0.1218],
      [0.95, 1],
      [0.525, 1],
      [0.1825, 0.6147]
    ],
    NX_COLORS.logoLight
  );
  const t = new THREE2.CanvasTexture(c);
  t.colorSpace = THREE2.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE2.RepeatWrapping;
  return t;
}
function createNexmaxMaterials(torsoTex) {
  const body = withOutlineShader(vinyl("#ffffff"), "body");
  const torso = withOutlineShader(vinyl("#ffffff", torsoTex), "torso");
  const plate = new THREE2.MeshPhysicalMaterial({
    color: NX_COLORS.plate,
    // 見本の顔プレートは日陰でも白く見える：ほんの少しだけ自己発光
    emissive: new THREE2.Color("#ffffff"),
    emissiveIntensity: 0.2,
    roughness: 0.5,
    sheen: 0.2,
    sheenColor: new THREE2.Color("#ffffff"),
    clearcoat: 0.2,
    clearcoatRoughness: 0.4
  });
  const eyes = new THREE2.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.08
  });
  const features = new THREE2.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  const ore = new THREE2.MeshBasicMaterial({ vertexColors: true });
  const ring = new THREE2.MeshBasicMaterial({ vertexColors: true });
  const claw = new THREE2.MeshStandardMaterial({ color: NX_COLORS.claw, roughness: 0.32, metalness: 0.55 });
  const hullDepth = createHullDepthMaterial();
  return {
    body,
    torso,
    plate,
    eyes,
    features,
    ore,
    ring,
    claw,
    hullDepth,
    dispose() {
      for (const m of [body, torso, plate, eyes, features, ore, ring, claw, hullDepth]) m.dispose();
      torsoTex.dispose();
    }
  };
}

// nexmax/head.ts
var PX = 1.2 / 731;
var fx = (X) => (333 - X) * PX;
var fy = (Y) => (848 - Y) * PX;
var HEAD_CENTER = new THREE3.Vector3(0, fy(272.5), 0);
var HEAD_SPEC = {
  a: 183 * PX,
  bTop: 155.5 * PX,
  bBot: 156 * PX,
  cFront: 0.243,
  cBack: 0.252,
  r: 2.3,
  tTop: 2.2,
  tBot: 3
};
var HEAD_PIVOT_Y = 0.7;
var PLATE_T = 75e-4;
var PLATE_BEVEL = 0.011;
var EXPRESSIONS = ["happy", "determined", "worried", "surprised"];
var headSurface = (x, y, out, n) => {
  if (!blobFrontHit(HEAD_SPEC, x - HEAD_CENTER.x, y - HEAD_CENTER.y, out, n)) return false;
  out.add(HEAD_CENTER);
  return true;
};
function plateTop(h) {
  return (x, y, out, n) => {
    if (!headSurface(x, y, out, n)) return false;
    out.addScaledVector(n, PLATE_T + h);
    return true;
  };
}
function resample(pts, count) {
  const L = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = L[L.length - 1];
  const out = [];
  let k = 0;
  for (let i = 0; i < count; i++) {
    const d = i / count * total;
    while (L[k + 1] < d) k++;
    const t = (d - L[k]) / (L[k + 1] - L[k] || 1);
    const a = pts[k];
    const b = pts[(k + 1) % pts.length];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
var PLATE_CENTER = [0, fy(296)];
function plateOutline(count = 112) {
  const [cx, cy] = PLATE_CENTER;
  const dense = superEllipse(cx, cy, 157.5 * PX, 96 * PX, 94 * PX, 4, 3.2, 1600);
  const notchDepth = 26 * PX;
  const notchW = 35.8 * PX;
  for (const p of dense) {
    if (p[1] > cy) {
      const w = Math.exp(-(((p[0] - cx) / notchW) ** 2));
      const nearTop = Math.min(1, Math.max(0, (p[1] - cy) / (96 * PX * 0.7)));
      p[1] -= notchDepth * w * nearTop;
    }
  }
  return resample(dense, count);
}
var EAR_PROFILE = (() => {
  const pts = [
    [0, 0.113],
    [0.028, 0.111],
    [0.045, 0.104],
    [0.05, 0.098],
    [0.0545, 0.0945],
    [0.0595, 0.0965]
  ];
  const cx = 0.06;
  const cy = 0.064;
  const R = 0.035;
  for (let i = 0; i <= 5; i++) {
    const th = i / 5 * (Math.PI / 2);
    pts.push([cx + Math.sin(th) * R, cy + Math.cos(th) * R]);
  }
  pts.push([0.0948, 0.055], [0.093, 0.038], [0.088, 0.02], [0.079, 6e-3], [0.066, 0], [0, 0]);
  return pts;
})();
var EAR_POS = { x: 0.262, y: fy(293), z: 0.042 };
function buildHelmet() {
  const shell = blob(HEAD_SPEC, 36, 26);
  shell.translate(HEAD_CENTER.x, HEAD_CENTER.y, HEAD_CENTER.z);
  const parts = [shell];
  for (const side of [1, -1]) {
    const ear = lathe(EAR_PROFILE, 18);
    place(ear, side * EAR_POS.x, EAR_POS.y, EAR_POS.z, 0, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    parts.push(ear);
  }
  for (const g of parts) paint(g, NX_COLORS.body);
  return merge(parts);
}
function buildPlate() {
  const outline = plateOutline(96);
  const rings = [0, 0.3, 0.55, 0.75, 0.88, 0.94, 0.968, 0.982, 0.992, 0.997, 1];
  const g = projectPatch({
    outline,
    center: PLATE_CENTER,
    rings,
    surface: headSurface,
    offset: (_s, edge) => {
      if (edge >= PLATE_BEVEL) return PLATE_T;
      const u = edge / PLATE_BEVEL;
      return -3e-3 + (PLATE_T + 3e-3) * Math.sqrt(1 - (1 - u) * (1 - u));
    }
  });
  return finalize(g, "#ffffff");
}
function plateBorder(width, color) {
  const inner = plateOutline(96);
  const outer = inflate(inner, PLATE_CENTER, width);
  const P = new THREE3.Vector3();
  const N = new THREE3.Vector3();
  const pos = [];
  const pushPt = (x, y, h) => {
    if (!headSurface(x, y, P, N)) {
      P.set(x, y, 0);
      N.set(0, 0, -1);
    }
    pos.push(P.x + N.x * h, P.y + N.y * h, P.z + N.z * h);
  };
  const n = inner.length;
  for (let i = 0; i < n; i++) {
    const ix = inner[i][0] + (inner[i][0] - PLATE_CENTER[0]) * -0.01;
    const iy = inner[i][1] + (inner[i][1] - PLATE_CENTER[1]) * -0.01;
    pushPt(ix, iy, 12e-4);
    pushPt(outer[i][0], outer[i][1], 12e-4);
  }
  const idx = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = (i + 1) % n * 2;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const g = new THREE3.BufferGeometry();
  g.setAttribute("position", new THREE3.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  for (let i = 0; i < nor.count; i++) {
    const p = new THREE3.Vector3().fromBufferAttribute(g.attributes.position, i).sub(HEAD_CENTER);
    const nn = new THREE3.Vector3().fromBufferAttribute(nor, i);
    if (nn.dot(p) < 0) nor.setXYZ(i, -nn.x, -nn.y, -nn.z);
  }
  const idxArr = g.index.array;
  for (let i = 0; i < idxArr.length; i += 3) {
    const a = new THREE3.Vector3().fromBufferAttribute(g.attributes.position, idxArr[i]);
    const b = new THREE3.Vector3().fromBufferAttribute(g.attributes.position, idxArr[i + 1]).sub(a);
    const c = new THREE3.Vector3().fromBufferAttribute(g.attributes.position, idxArr[i + 2]).sub(a);
    const fn = b.cross(c);
    const vn = new THREE3.Vector3().fromBufferAttribute(nor, idxArr[i]);
    if (fn.dot(vn) < 0) {
      const t = idxArr[i + 1];
      idxArr[i + 1] = idxArr[i + 2];
      idxArr[i + 2] = t;
    }
  }
  return paint(g, color);
}
var EYE_X = 61 * PX;
var EYE_Y = fy(300);
var EYE_SHAPES = {
  // cut: 目の上を直線で切る（v = cutA + cutB·u、u は顔の内側へ向かう距離）。cutA が大きければ切らない
  happy: { rx: 25.5 * PX, ry: 26.5 * PX, cutA: 1, cutB: 0, dy: 0 },
  determined: { rx: 25 * PX, ry: 25 * PX, cutA: 0.016, cutB: -0.42, dy: -3e-3 },
  worried: { rx: 24 * PX, ry: 25 * PX, cutA: 0.022, cutB: 0.32, dy: -3e-3 },
  surprised: { rx: 29 * PX, ry: 32 * PX, cutA: 1, cutB: 0, dy: 4e-3 }
};
function eyeOutline(side, s) {
  const cx = side * EYE_X;
  const cy = EYE_Y + s.dy;
  const pts = superEllipse(cx, cy, s.rx, s.ry, s.ry, 2, 2, 400);
  for (const p of pts) {
    const u = (cx - p[0]) * side;
    const cut = cy + s.cutA + s.cutB * u;
    if (p[1] > cut) p[1] = cut;
  }
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p[0];
    my += p[1];
  }
  return { outline: resample(pts, 40), center: [mx / pts.length, my / pts.length] };
}
function buildEyes(expr) {
  const s = EYE_SHAPES[expr];
  const parts = [];
  for (const side of [1, -1]) {
    const { outline, center } = eyeOutline(side, s);
    const eye = projectPatch({
      outline,
      center,
      rings: [0, 0.45, 0.75, 0.92, 1],
      surface: plateTop(0),
      offset: (u) => -8e-4 + 42e-4 * Math.sqrt(Math.max(0, 1 - u * u))
    });
    parts.push(paint(eye, NX_COLORS.eye));
    const hr = s.rx * 0.14;
    const hx = center[0] + side * -s.rx * 0.34;
    const hy = center[1] + s.ry * 0.4;
    const hl = projectPatch({
      outline: superEllipse(hx, hy, hr, hr * 1.1, hr * 1.1, 2, 2, 14),
      center: [hx, hy],
      rings: [0, 1],
      surface: plateTop(0),
      offset: () => 39e-4
    });
    parts.push(paint(hl, "#c9d6e4"));
  }
  return merge(parts);
}
var EYE_CENTER_Y = EYE_Y;
var BROW_PX = [
  [272, 174],
  [258, 170.5],
  [244, 173.5],
  [233, 179],
  [227, 185]
];
var BROW_SHAPES = {
  happy: { rot: 0, dy: 0, arch: 1, dx: 0 },
  // 内側を下げる（きりっと）
  determined: { rot: -0.42, dy: -6e-3, arch: 0.35, dx: -4e-3 },
  // 内側を上げる（八の字）
  worried: { rot: 0.52, dy: 9e-3, arch: 0.3, dx: 2e-3 },
  surprised: { rot: 0.05, dy: 0.02, arch: 1.25, dx: 0 }
};
function browPoints(side, s) {
  const pts = BROW_PX.map(([X, Y]) => [fx(X), fy(Y)]);
  const c = pts[1];
  const a = pts[0];
  const b = pts[pts.length - 1];
  const out = [];
  const curve = new THREE3.SplineCurve(pts.map(([x, y]) => new THREE3.Vector2(x, y)));
  const dense = curve.getPoints(18);
  for (const p of dense) {
    const t = Math.max(0, Math.min(1, (p.x - a[0]) / (b[0] - a[0])));
    const chordY = a[1] + (b[1] - a[1]) * t;
    let x = p.x;
    let y = chordY + (p.y - chordY) * s.arch;
    const dx = x - c[0];
    const dy = y - c[1];
    const cr = Math.cos(s.rot);
    const sr = Math.sin(s.rot);
    x = c[0] + dx * cr + dy * sr;
    y = c[1] - dx * sr + dy * cr;
    out.push([side * (x + s.dx), y + s.dy]);
  }
  return out;
}
function buildBrows(expr) {
  const s = BROW_SHAPES[expr];
  const parts = [1, -1].map((side) => paint(strokeTube(browPoints(side, s), headSurface, 28e-4, 62e-4, 0.5, 8), NX_COLORS.brow));
  return merge(parts);
}
var MOUTH_TOP = fy(349);
var MOUTH_SHAPES = {
  happy: { rx: 22.5 * PX, ryTop: 3 * PX, ryBot: 22 * PX, nTop: 7, nBot: 2.2, cy: MOUTH_TOP - 2 * PX, dark: NX_COLORS.mouthDark, light: NX_COLORS.mouth },
  determined: { rx: 23 * PX, ryTop: 7 * PX, ryBot: 9.5 * PX, nTop: 3.5, nBot: 3, cy: MOUTH_TOP - 8 * PX, dark: "#8f2a1f", light: "#c9483a", teeth: true },
  worried: { rx: 14 * PX, ryTop: 8 * PX, ryBot: 2.5 * PX, nTop: 2.2, nBot: 6, cy: MOUTH_TOP - 12 * PX, dark: NX_COLORS.mouthDark, light: NX_COLORS.mouth },
  surprised: { rx: 10.5 * PX, ryTop: 12 * PX, ryBot: 13 * PX, nTop: 2, nBot: 2, cy: MOUTH_TOP - 14 * PX, dark: NX_COLORS.mouthDark, light: NX_COLORS.mouth }
};
function buildMouth(expr) {
  const s = MOUTH_SHAPES[expr];
  const outline = resample(superEllipse(0, s.cy, s.rx, s.ryTop, s.ryBot, s.nTop, s.nBot, 600), 48);
  const center = [0, s.cy + (s.ryTop - s.ryBot) / 2];
  const border = projectPatch({
    outline: inflate(outline, center, 26e-4),
    center,
    rings: [0, 0.6, 1],
    surface: plateTop(0),
    offset: () => 6e-4
  });
  paint(border, NX_COLORS.mouthLine);
  const fill = projectPatch({
    outline,
    center,
    rings: [0, 0.35, 0.6, 0.8, 0.92, 1],
    surface: plateTop(0),
    offset: () => 12e-4
  });
  const pos = fill.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const cDark = new THREE3.Color(s.dark);
  const cLight = new THREE3.Color(s.light);
  const cTeeth = new THREE3.Color("#fbfbf8");
  const top = s.cy + s.ryTop;
  const c = new THREE3.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (s.teeth) {
      c.copy(y > s.cy - 5e-4 ? cTeeth : cDark);
    } else {
      const t = Math.min(1, Math.max(0, (top - y) / 95e-4));
      c.copy(cDark).lerp(cLight, t * t * (3 - 2 * t));
    }
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  fill.setAttribute("color", new THREE3.BufferAttribute(col, 3));
  return merge([border, fill]);
}
function buildFeatures(expr, plateLine) {
  const parts = [buildBrows(expr), buildMouth(expr)];
  if (plateLine) parts.push(plateBorder(26e-4, NX_COLORS.plateLine));
  return merge(parts);
}

// nexmax/body.ts
var J = {
  hips: 0.42,
  torsoPivot: 0.42,
  shoulder: { x: 114 * PX, y: fy(477) },
  upperLen: 0.1,
  lowerLen: 0.143,
  hip: { x: 0.077, y: 0.41 },
  thighLen: 0.156,
  shinLen: 0.129,
  ankleY: 0.125
};
var TORSO_Z = 0.865;
var TORSO_PX = [
  [440, 0],
  [440, 40],
  [440.5, 55],
  [441.5, 64],
  [443.5, 71],
  [447, 77],
  [452, 81],
  [460, 85],
  [472, 88],
  [488, 89.5],
  [505, 89.5],
  [522, 87.5],
  [538, 83.5],
  [553, 78],
  [566, 71.5],
  [577, 63.5],
  [586, 54],
  [593, 43],
  [598, 30],
  [600.5, 15],
  [601, 0]
];
var TORSO_PROFILE = TORSO_PX.map(([Y, r]) => [r * PX, fy(Y)]);
var TORSO_TOP = TORSO_PROFILE[0][1];
var TORSO_BOTTOM = TORSO_PROFILE[TORSO_PROFILE.length - 1][1];
function torsoR(y) {
  const p = TORSO_PROFILE;
  if (y >= p[1][1]) return p[1][0];
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i];
    const b = p[i + 1];
    if (y <= a[1] && y >= b[1]) {
      const t = (a[1] - y) / (a[1] - b[1] || 1);
      return lerp(a[0], b[0], t);
    }
  }
  return 0;
}
var torsoBack = (x, y, out, n) => {
  const r = torsoR(y);
  if (Math.abs(x) >= r) return false;
  const z = TORSO_Z * Math.sqrt(r * r - x * x);
  const e = 2e-3;
  const dr = (torsoR(y + e) - torsoR(y - e)) / (2 * e);
  out.set(x, y, z);
  n.set(x, -r * dr, z / (TORSO_Z * TORSO_Z)).normalize();
  return true;
};
function torsoLogoUV() {
  const yc = fy(500);
  const rFront = torsoR(yc);
  const H = TORSO_TOP - TORSO_BOTTOM;
  return {
    u: 0.25,
    v: (yc - TORSO_BOTTOM) / H,
    w: 60 * PX / (rFront * Math.PI * 2),
    h: 56 * PX / H
  };
}
var ORE_CENTER = [0, fy(490)];
var ORE_R = 36 * PX;
var ORE_RIM_R = 41 * PX;
function buildTorso() {
  const torso = lathe(TORSO_PROFILE, 28, Math.PI / 2);
  scaleGeo(torso, 1, 1, TORSO_Z);
  paint(torso, "#ffffff");
  const neck = lathe(
    [
      [0, 0.716],
      [0.044, 0.716],
      [0.05, 0.71],
      [0.053, 0.698],
      [0.053, 0.672],
      [0.05, 0.66],
      [0, 0.66]
    ],
    20
  );
  paint(flatUV(neck, 0.5, 0.95), "#ffffff");
  const rim = rimRing();
  paint(flatUV(rim, 0.6, 0.6), "#ffffff");
  const g = merge([torso, neck, rim]);
  g.translate(0, -J.torsoPivot, 0);
  return g;
}
function rimRing() {
  const seg = 36;
  const radial = 6;
  const tube = 78e-4;
  const P = new THREE4.Vector3();
  const N = new THREE4.Vector3();
  const pos = [];
  const nor = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2;
    const cx = ORE_CENTER[0] + Math.cos(a) * ORE_RIM_R;
    const cy = ORE_CENTER[1] + Math.sin(a) * ORE_RIM_R;
    torsoBack(cx, cy, P, N);
    const R = new THREE4.Vector3(Math.cos(a), Math.sin(a), 0);
    R.addScaledVector(N, -R.dot(N)).normalize();
    const C = P.clone().addScaledVector(N, tube * 0.35);
    for (let k = 0; k <= radial; k++) {
      const th = k / radial * Math.PI * 2;
      const dir = R.clone().multiplyScalar(Math.cos(th)).addScaledVector(N, Math.sin(th));
      pos.push(C.x + dir.x * tube, C.y + dir.y * tube * 1, C.z + dir.z * tube);
      nor.push(dir.x, dir.y, dir.z);
    }
  }
  const idx = [];
  for (let i = 0; i < seg; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k;
      const b = (i + 1) * (radial + 1) + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE4.BufferGeometry();
  g.setAttribute("position", new THREE4.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE4.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  const arr = g.index.array;
  const va = new THREE4.Vector3();
  const vb = new THREE4.Vector3();
  const vc = new THREE4.Vector3();
  const vn = new THREE4.Vector3();
  for (let i = 0; i < arr.length; i += 3) {
    va.fromBufferAttribute(g.attributes.position, arr[i]);
    vb.fromBufferAttribute(g.attributes.position, arr[i + 1]).sub(va);
    vc.fromBufferAttribute(g.attributes.position, arr[i + 2]).sub(va);
    vn.fromBufferAttribute(g.attributes.normal, arr[i]);
    if (vb.cross(vc).dot(vn) < 0) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
  }
  return g;
}
function buildOre() {
  const parts = [];
  const disc = projectPatch({
    outline: Array.from({ length: 40 }, (_, i) => {
      const a = i / 40 * Math.PI * 2;
      return [ORE_CENTER[0] + Math.cos(a) * ORE_R, ORE_CENTER[1] + Math.sin(a) * ORE_R];
    }),
    center: ORE_CENTER,
    rings: [0, 0.3, 0.6, 0.85, 1],
    surface: torsoBack,
    offset: () => 16e-4
  });
  {
    const pos = disc.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const edge = new THREE4.Color("#2a62c4");
    const mid = new THREE4.Color("#4a8fe6");
    const glow = new THREE4.Color("#c4f4ff");
    const c = new THREE4.Color();
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - ORE_CENTER[0];
      const dy = pos.getY(i) - (ORE_CENTER[1] - ORE_R * 0.55);
      const d = Math.hypot(dx, dy * 1.3) / ORE_R;
      const r = Math.hypot(pos.getX(i) - ORE_CENTER[0], pos.getY(i) - ORE_CENTER[1]) / ORE_R;
      c.copy(mid).lerp(edge, Math.min(1, Math.max(0, (r - 0.55) / 0.45)));
      c.lerp(glow, Math.max(0, 1 - d / 0.55) * 0.85);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    disc.setAttribute("color", new THREE4.BufferAttribute(col, 3));
  }
  parts.push(disc);
  const P = new THREE4.Vector3();
  const N = new THREE4.Vector3();
  torsoBack(ORE_CENTER[0], ORE_CENTER[1], P, N);
  const frame = new THREE4.Matrix4();
  {
    const z = N.clone();
    const x = new THREE4.Vector3(1, 0, 0).addScaledVector(z, -z.x).normalize();
    const y = new THREE4.Vector3().crossVectors(z, x);
    frame.makeBasis(x, y, z).setPosition(P.clone().addScaledVector(N, 18e-4));
  }
  const crystals = [
    // x, y, 長さ, 太さ, 傾き
    [0, -0.026, 0.066, 0.0125, 0],
    [-0.017, -0.024, 0.046, 0.0105, 0.42],
    [0.017, -0.024, 0.046, 0.0105, -0.42],
    [-0.031, -0.031, 0.022, 75e-4, 0.95],
    [0.031, -0.031, 0.022, 75e-4, -0.95],
    [-9e-3, -0.033, 0.016, 6e-3, 1.25],
    [9e-3, -0.033, 0.016, 6e-3, -1.25]
  ];
  const light = new THREE4.Vector3(-0.35, 0.65, 0.68).normalize();
  const cDeep = new THREE4.Color("#2f8fe8");
  const cLit = new THREE4.Color("#f4fdff");
  const cBase = new THREE4.Color("#bdf3ff");
  for (const [x, y, L, w, tilt] of crystals) {
    const g = facet(
      lathe(
        [
          [0, L],
          [w, L * 0.64],
          [w * 0.9, L * 0.06],
          [0, -L * 0.04]
        ],
        6,
        Math.PI / 6
      )
    );
    scaleGeo(g, 1, 1, 0.5);
    place(g, x, y, 0, 0, 0, tilt);
    g.applyMatrix4(frame);
    const nor = g.attributes.normal;
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE4.Color();
    const nn = new THREE4.Vector3();
    const local = new THREE4.Vector3();
    const inv = frame.clone().invert();
    for (let i = 0; i < pos.count; i++) {
      nn.fromBufferAttribute(nor, i);
      nn.transformDirection(inv);
      const lit = Math.min(1, Math.max(0, 0.45 + 0.75 * nn.dot(light)));
      c.copy(cDeep).lerp(cLit, lit);
      local.fromBufferAttribute(pos, i).applyMatrix4(inv);
      const base = Math.max(0, 1 - (local.y + 0.034) / 0.03);
      c.lerp(cBase, base * 0.6);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE4.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE4.BufferAttribute(new Float32Array(pos.count * 2), 2));
    parts.push(g);
  }
  const ore = merge(parts);
  ore.translate(0, -J.torsoPivot, 0);
  return ore;
}
function buildUpperArm() {
  const sh = ball(29 * PX, 16, 8);
  const bead = lathe(beadProfile(0.032, 0.03, 0.06, 2.6, 8), 16);
  bead.translate(0, -0.066, 0);
  for (const g of [sh, bead]) paint(g, NX_COLORS.body);
  return merge([sh, bead]);
}
function buildForearm(right) {
  const parts = [];
  const elbow = ball(0.029, 14, 7);
  parts.push(elbow);
  let ring = null;
  const muzzle = new THREE4.Vector3();
  if (right) {
    const fore = lathe(
      [
        [0, -2e-3],
        [0.026, -5e-3],
        [0.037, -0.012],
        [0.045, -0.028],
        [0.0515, -0.055],
        [0.0555, -0.085],
        [0.057, -0.106],
        [0.0562, -0.114],
        [0.0505, -0.1165],
        [0.0505, -0.1295],
        [0.0548, -0.132],
        [0.0555, -0.139],
        [0.0525, -0.1445],
        [0.044, -0.147],
        [0, -0.147]
      ],
      18
    );
    parts.push(fore);
    muzzle.set(0, -0.147, 0);
    const tor = new THREE4.TorusGeometry(0.0522, 6e-3, 8, 30);
    tor.rotateX(Math.PI / 2);
    tor.scale(1, 1.25, 1);
    tor.translate(0, -0.123, 0);
    const pos = tor.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const core = new THREE4.Color("#62e4ff");
    const edge = new THREE4.Color("#0a7ee0");
    const c = new THREE4.Color();
    const nor = tor.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const outward = (nor.getX(i) * pos.getX(i) + nor.getZ(i) * pos.getZ(i)) / Math.hypot(pos.getX(i), pos.getZ(i));
      const t = Math.min(1, Math.max(0, outward));
      c.copy(edge).lerp(core, t * t);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    tor.setAttribute("color", new THREE4.BufferAttribute(col, 3));
    ring = tor;
  } else {
    const fore = lathe(beadProfile(0.047, 0.05, 0.132, 2.8, 11, 0.12), 16);
    fore.translate(0, -0.071, 0);
    parts.push(fore);
    const cuff = lathe(beadProfile(0.036, 0.036, 0.024, 3, 6), 16);
    cuff.translate(0, -0.14, 0);
    parts.push(cuff);
  }
  for (const g of parts) if (!g.attributes.color) paint(g, NX_COLORS.body);
  return { geo: merge(parts), ring, muzzle };
}
function buildHand(left, fist = 0) {
  const knuckle = -0.064;
  const mitten = blob({ a: 0.03, bTop: 0.064, bBot: 0.074, cFront: 0.057, cBack: 0.053, r: 2.6, tTop: 2.4, tBot: 2.1 }, 18, 14, (v) => {
    v.y -= 0.064;
    const f = Math.min(1, Math.max(0, (knuckle - v.y) / 0.025));
    let w = 0;
    for (const zg of [-0.0172, 0.0172]) w += Math.exp(-(((v.z - zg) / 56e-4) ** 2));
    v.x *= 1 - 0.2 * w * f;
    if (v.y < -0.1) v.y += 0.012 * w * Math.min(1, (-0.1 - v.y) / 0.025);
    v.x *= 1 - 0.18 * f;
    if (v.y < knuckle) {
      const d = knuckle - v.y;
      const ang = -(0.55 + fist * 1.2) * Math.min(1, d / 0.07) * (d / 0.07);
      const px = v.x + 4e-3;
      const py = d;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      v.x = px * c + py * s - 4e-3;
      v.y = knuckle - (-px * s + py * c);
    }
  });
  const thumb = lathe(beadProfile(0.024, 0.021, 0.07, 2.3, 7), 10);
  thumb.translate(0, -0.035, 0);
  place(thumb, -0.01, -0.036, -0.036, 0.62, 0, -0.38, "YXZ");
  const parts = [mitten, thumb].map((g2) => paint(g2, NX_COLORS.body));
  const g = merge(parts);
  if (left) {
    g.applyMatrix4(new THREE4.Matrix4().makeScale(-1, 1, 1));
    const arr = g.index.array;
    for (let i = 0; i < arr.length; i += 3) {
      const t = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = t;
    }
  }
  return g;
}
function buildThigh() {
  const hip = ball(0.034, 14, 7, 0.85);
  const th = lathe(beadProfile(0.047, 0.051, 0.115, 2.5, 10, 0.12), 16);
  th.translate(0, -0.08, 0);
  return merge([hip, th].map((g) => paint(g, NX_COLORS.body)));
}
function buildShin() {
  const knee = lathe(beadProfile(0.035, 0.035, 0.04, 2.8, 6), 14);
  const sh = lathe(beadProfile(0.05, 0.066, 0.13, 3, 10, 0.06), 16);
  sh.translate(0, -0.076, 0);
  return merge([knee, sh].map((g) => paint(g, NX_COLORS.body)));
}
function buildFoot() {
  const f = blob({ a: 0.108, bTop: 0.118, bBot: 0.018, cFront: 0.152, cBack: 0.122, r: 2.2, tTop: 2.15, tBot: 2.4 }, 22, 12);
  f.translate(0, -J.ankleY + 0.018, -0.02);
  return paint(f, NX_COLORS.body);
}
function buildClawHub() {
  const g = lathe(
    [
      // 射出口の中へ続く軸（伸びたときにすき間が見えないように）
      [0, 0.034],
      [55e-4, 0.034],
      [55e-4, 6e-3],
      [9e-3, 4e-3],
      [0.0125, 0],
      [0.0135, -0.012],
      [0.012, -0.018],
      [6e-3, -0.021],
      [0, -0.021]
    ],
    14
  );
  return g;
}
function buildClawProng() {
  const L = 0.036;
  const g = lathe(beadProfile(52e-4, 26e-4, L, 2.2, 10), 8);
  g.translate(0, -L / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, -pos.getY(i) / L));
    pos.setX(i, pos.getX(i) + 6e-3 * Math.sin(t * Math.PI * 0.6) - 0.012 * t * t * t);
  }
  g.computeVertexNormals();
  return g;
}

// nexmax/anim.ts
var PARAM_KEYS = [
  "bodyY",
  "bodyZ",
  "bodyPitch",
  "bodyRoll",
  "pivotX",
  "pivotY",
  "squash",
  "hipsY",
  "hipsX",
  "hipsPitch",
  "hipsRoll",
  "hipsYaw",
  "torsoPitch",
  "torsoRoll",
  "torsoYaw",
  "headPitch",
  "headRoll",
  "headYaw",
  "rShX",
  "rShY",
  "rShZ",
  "rEl",
  "rHandX",
  "rHandZ",
  "lShX",
  "lShY",
  "lShZ",
  "lEl",
  "lHandX",
  "lHandZ",
  "rHipX",
  "rHipY",
  "rHipZ",
  "rKnee",
  "rAnk",
  "lHipX",
  "lHipY",
  "lHipZ",
  "lKnee",
  "lAnk",
  /** 右腕を狙い（setAim）へ向ける重み */
  "aim",
  /** 狙いの方向を体の外側へずらす量（大きな頭に腕が隠れないように） */
  "aimSide",
  /** 頭を狙いへ向ける重み */
  "look",
  /** 左手を右の前腕に添える重み */
  "brace",
  /** 手を握る（0..1） */
  "fist"
];
function zeroParams() {
  const p = {};
  for (const k of PARAM_KEYS) p[k] = 0;
  p.squash = 1;
  return p;
}
function clearParams(p) {
  for (const k of PARAM_KEYS) p[k] = 0;
  p.squash = 1;
  return p;
}
function addWeighted(out, p, w) {
  for (const k of PARAM_KEYS) out[k] += p[k] * w;
}
var ALL_POSES = ["idle", "walk", "run", "dash", "jump", "fall", "land", "swing", "pulled", "fire", "hold", "crank", "wave", "punch", "punchL", "hurt", "sit"];
var SLOTS = ["ground", "dash", "jump", "fall", "land", "swing", "pulled", "fire", "hold", "crank", "wave", "punch", "punchL", "hurt", "sit"];
function slotOf(p) {
  return p === "idle" || p === "walk" || p === "run" ? "ground" : p;
}
var SLOT_TAU = {
  ground: 0.16,
  dash: 0.14,
  jump: 0.07,
  fall: 0.2,
  land: 0.035,
  swing: 0.14,
  pulled: 0.1,
  fire: 0.06,
  hold: 0.12,
  crank: 0.2,
  wave: 0.2,
  punch: 0.035,
  punchL: 0.035,
  hurt: 0.04,
  sit: 0.22
};
var clamp = (x, a, b) => x < a ? a : x > b ? b : x;
var smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
var TAU = Math.PI * 2;
var L1 = J.thighLen;
var L2 = J.shinLen;
var LMAX = L1 + L2;
function legIK(p, side, z, y, footPitch, tilt) {
  let d = Math.hypot(z, y);
  d = clamp(d, 0.06, LMAX - 5e-4);
  const cosK = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const knee = Math.PI - Math.acos(cosK);
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const toTarget = Math.atan2(-z, -y);
  const hip = toTarget + Math.acos(cosA);
  const hipKey = side === "r" ? "rHipX" : "lHipX";
  const kneeKey = side === "r" ? "rKnee" : "lKnee";
  const ankKey = side === "r" ? "rAnk" : "lAnk";
  p[hipKey] = hip - tilt;
  p[kneeKey] = knee;
  p[ankKey] = -(hip - knee) + footPitch;
}
var HIP_Y = J.hip.y;
var ANKLE_Y = J.ankleY;
function standIK(p, zl, yl, pl, zr, yr, pr, tilt = 0) {
  const hipAbs = HIP_Y + p.hipsY + p.bodyY;
  legIK(p, "l", zl, (ANKLE_Y + yl - hipAbs) / Math.cos(p.lHipZ), pl, tilt);
  legIK(p, "r", zr, (ANKLE_Y + yr - hipAbs) / Math.cos(p.rHipZ), pr, tilt);
}
function gait(u, halfStride, liftH, stanceFrac) {
  if (u < stanceFrac) {
    const k2 = u / stanceFrac;
    return { z: -halfStride + 2 * halfStride * k2, lift: 0, pitch: 0.18 * Math.pow(1 - k2, 4) - 0.32 * Math.pow(k2, 5), stance: true, k: k2 };
  }
  const k = (u - stanceFrac) / (1 - stanceFrac);
  const e = k * k * (3 - 2 * k);
  return {
    z: halfStride - 2 * halfStride * e,
    lift: liftH * Math.pow(Math.sin(Math.PI * k), 0.85),
    pitch: -0.4 * Math.pow(1 - k, 2) + 0.22 * Math.pow(k, 3),
    stance: false,
    k
  };
}
function strideFreq(speed) {
  return clamp(1.45 + 0.5 * speed, 1.6, 4.6);
}
function evalGround(p, c, dashStyle = false) {
  clearParams(p);
  const s = c.speed;
  const walkW = smooth(0.12, 1.1, s);
  const runW = dashStyle ? 1 : smooth(3.7, 5, s);
  const breath = Math.sin(c.t * TAU * 0.32);
  const idleW = 1 - walkW;
  const sway = Math.sin(c.t * 0.83);
  p.hipsX = idleW * 6e-3 * sway;
  p.hipsRoll = idleW * 0.02 * sway;
  p.torsoRoll = idleW * -0.025 * sway;
  p.torsoPitch = idleW * 0.018 * breath;
  p.headYaw = idleW * c.lookYaw;
  p.headPitch = idleW * (c.lookPitch + 0.025 * Math.sin(c.t * 1.1));
  p.headRoll = idleW * (0.05 * Math.sin(c.t * 0.47) + c.lookYaw * 0.18);
  p.hipsY = idleW * (-7e-3 + 28e-4 * breath);
  p.rShZ = lerp2(0.3, 0.56, idleW) + idleW * 0.015 * breath;
  p.lShZ = lerp2(0.3, 0.56, idleW) + idleW * 0.015 * breath;
  p.rShX = 0.05;
  p.lShX = 0.05;
  p.rShY = lerp2(0.35, 1.25, idleW);
  p.lShY = lerp2(0.35, 1.25, idleW);
  p.rEl = lerp2(0.24, 0.07, idleW) + idleW * 0.02 * breath;
  p.lEl = lerp2(0.24, 0.07, idleW) + idleW * 0.02 * breath;
  p.rHandZ = idleW * -0.12;
  p.lHandZ = idleW * -0.12;
  p.rHipZ = 0.16;
  p.lHipZ = 0.16;
  p.rHipY = 0.08;
  p.lHipY = 0.08;
  p.fist = 0.1;
  const f = strideFreq(s);
  const stanceFrac = lerp2(0.6, 0.36, runW);
  const half = Math.min(dashStyle ? 0.19 : lerp2(0.15, 0.19, runW), s * stanceFrac / f / 2 + 0.01) * walkW;
  const lift = (lerp2(0.055, 0.1, runW) + (dashStyle ? 0.02 : 0)) * walkW;
  const gl = gait(c.phase % 1, half, lift, stanceFrac);
  const gr = gait((c.phase + 0.5) % 1, half, lift, stanceFrac);
  const ext = LMAX * lerp2(0.975, 0.9, runW);
  const zSt = gl.stance ? gl.z : gr.stance ? gr.z : 0;
  const flight = !gl.stance && !gr.stance;
  const hipH = Math.sqrt(Math.max(0.01, ext * ext - zSt * zSt));
  let hy = hipH - (HIP_Y - ANKLE_Y);
  if (flight) hy += 0.022 * runW;
  p.hipsY = lerp2(p.hipsY, hy, walkW);
  const fwdL = half > 1e-4 ? -gl.z / half : 0;
  const fwdR = half > 1e-4 ? -gr.z / half : 0;
  p.hipsYaw = 0.13 * walkW * (gl.z - gr.z) / Math.max(half, 1e-3) * 0.5;
  p.torsoYaw = -p.hipsYaw * 1.7;
  p.hipsRoll += walkW * 0.035 * (gl.stance ? -1 : 1) * Math.sin(Math.PI * (gl.stance ? gl.k : gr.k));
  p.torsoRoll += -p.hipsRoll * 0.6;
  const lean = walkW * (0.06 + 0.24 * runW) + (dashStyle ? 0.36 : 0);
  p.torsoPitch -= lean;
  p.bodyPitch = -(dashStyle ? 0.14 : 0.08 * runW) * walkW;
  p.headPitch += lean * 0.7 + walkW * 0.035 * Math.sin(c.phase * TAU * 2) + (dashStyle ? 0.12 : 0);
  p.headYaw += -p.torsoYaw * 0.6;
  p.headRoll += walkW * 0.03 * Math.sin(c.phase * TAU);
  const armAmp = lerp2(0.55, 0.95, runW) * walkW;
  if (dashStyle) {
    p.rShX = lerp2(p.rShX, -1.05 + 0.12 * fwdL, walkW);
    p.lShX = lerp2(p.lShX, -1.05 + 0.12 * fwdR, walkW);
    p.rShZ = lerp2(p.rShZ, 0.32, walkW);
    p.lShZ = lerp2(p.lShZ, 0.32, walkW);
    p.rEl = lerp2(p.rEl, 0.25, walkW);
    p.lEl = lerp2(p.lEl, 0.25, walkW);
    p.rShY = 0.5;
    p.lShY = 0.5;
  } else {
    p.rShX += armAmp * fwdL;
    p.lShX += armAmp * fwdR;
    p.rEl += walkW * (0.12 + 1 * runW) + walkW * 0.12 * Math.max(0, fwdL);
    p.lEl += walkW * (0.12 + 1 * runW) + walkW * 0.12 * Math.max(0, fwdR);
    p.rShZ -= walkW * 0.1;
    p.lShZ -= walkW * 0.1;
  }
  p.fist = lerp2(p.fist, 0.5, runW);
  p.rHipZ = lerp2(p.rHipZ, 0.05, walkW);
  p.lHipZ = lerp2(p.lHipZ, 0.05, walkW);
  p.rHipY = lerp2(p.rHipY, 0.03, walkW);
  p.lHipY = lerp2(p.lHipY, 0.03, walkW);
  p.squash = 1 + walkW * (0.012 + 0.02 * runW) * Math.cos(c.phase * TAU * 2);
  standIK(p, gl.z, gl.lift, gl.pitch * walkW, gr.z, gr.lift, gr.pitch * walkW, p.hipsPitch + p.bodyPitch);
}
function lerp2(a, b, t) {
  return a + (b - a) * t;
}
function evalJump(p, c) {
  clearParams(p);
  const t = c.pt;
  const stretch = smooth(0, 0.07, t) * Math.exp(-Math.max(0, t - 0.07) * 4.5);
  p.squash = 1 - 0.09 * (1 - smooth(0, 0.06, t)) + 0.13 * stretch;
  const up = smooth(0, 0.12, t);
  p.rShX = lerp2(0.3, 2.3, up);
  p.lShX = lerp2(0.3, 2.1, up);
  p.rShZ = lerp2(0.35, 0.85, up);
  p.lShZ = lerp2(0.35, 0.95, up);
  p.rEl = 0.3;
  p.lEl = 0.4;
  p.rShY = -0.3;
  p.lShY = -0.3;
  p.torsoPitch = 0.08 * up;
  p.headPitch = 0.18 * up;
  p.hipsY = -0.01;
  p.lHipX = 1 * up;
  p.lKnee = 1.45 * up;
  p.lAnk = -0.3;
  p.rHipX = -0.18;
  p.rKnee = 0.35 + 0.2 * up;
  p.rAnk = -0.45;
  p.rHipZ = 0.04;
  p.lHipZ = 0.06;
  p.fist = 0.3;
}
function evalFall(p, c) {
  clearParams(p);
  const t = c.t;
  const flail = Math.sin(t * 8.5);
  p.squash = 1.02;
  p.rShZ = 1.25 + 0.15 * flail;
  p.lShZ = 1.25 - 0.15 * flail;
  p.rShX = 0.45 + 0.15 * Math.sin(t * 7.3);
  p.lShX = 0.45 - 0.15 * Math.sin(t * 7.3);
  p.rEl = 0.55;
  p.lEl = 0.55;
  p.rShY = -0.5;
  p.lShY = -0.5;
  p.torsoPitch = -0.12;
  p.headPitch = -0.12;
  p.rHipX = 0.3 + 0.25 * Math.sin(t * 6.2);
  p.lHipX = 0.3 - 0.25 * Math.sin(t * 6.2);
  p.rKnee = 0.55 + 0.25 * Math.sin(t * 6.2 + 1);
  p.lKnee = 0.55 - 0.25 * Math.sin(t * 6.2 + 1);
  p.rAnk = -0.35;
  p.lAnk = -0.35;
  p.rHipZ = 0.1;
  p.lHipZ = 0.1;
  p.fist = 0;
}
function evalLand(p, c) {
  clearParams(p);
  const t = c.pt;
  const k = Math.exp(-t * 9);
  p.squash = 1 - 0.24 * k * Math.cos(t * 13);
  p.hipsY = -0.075 * k - 5e-3;
  p.torsoPitch = -0.22 * k;
  p.headPitch = 0.14 * k;
  p.rShX = 0.55 * k + 0.05;
  p.lShX = 0.55 * k + 0.05;
  p.rShZ = 0.3 + 0.55 * k;
  p.lShZ = 0.3 + 0.55 * k;
  p.rEl = 0.3 + 0.3 * k;
  p.lEl = 0.3 + 0.3 * k;
  p.rShY = -0.15;
  p.lShY = -0.15;
  p.rHipZ = 0.07;
  p.lHipZ = 0.07;
  p.rHipY = 0.08;
  p.lHipY = 0.08;
  standIK(p, -0.015, 0, 0, 0.015, 0, 0);
}
function evalSwing(p, c) {
  clearParams(p);
  const v = clamp(c.swingVel, -3, 3);
  p.aim = c.hasAim ? 0.92 : 0;
  p.aimSide = 0.75;
  p.pivotX = 0.42;
  p.pivotY = 1;
  p.bodyPitch = c.swing;
  p.bodyRoll = 0.3;
  p.squash = 1.04;
  p.rShX = 2.6;
  p.rShZ = 1;
  p.rEl = 0.05;
  p.lShZ = 0.95;
  p.lShX = 0.35 + v * 0.12;
  p.lEl = 0.45;
  p.torsoPitch = -v * 0.07;
  p.torsoRoll = 0.04;
  p.headPitch = 0.1 - v * 0.06;
  p.headRoll = 0.1;
  const trail = clamp(-v * 0.3, -0.75, 0.75);
  const kick = Math.sin(c.t * 3.1) * 0.12;
  p.rHipX = 0.18 + trail + kick;
  p.lHipX = 0.32 + trail - kick;
  p.rKnee = 0.45 + Math.abs(trail) * 0.4 + kick;
  p.lKnee = 0.65 + Math.abs(trail) * 0.4 - kick;
  p.rAnk = -0.4;
  p.lAnk = -0.4;
  p.rHipZ = 0.12;
  p.lHipZ = 0.06;
  p.fist = 0.8;
}
function evalPulled(p, c) {
  clearParams(p);
  p.aim = c.hasAim ? 1 : 0;
  p.aimSide = 0.18;
  p.look = c.hasAim ? 0.8 : 0;
  p.pivotY = 0.95;
  p.bodyPitch = -0.5;
  p.squash = 1.08;
  p.rShX = Math.PI / 2 + 0.3;
  p.rEl = 0.05;
  p.lShX = -0.85;
  p.lShZ = 0.35;
  p.lEl = 0.35;
  p.lShY = 0.4;
  p.torsoPitch = 0.1;
  p.headPitch = 0.3;
  const flutter = Math.sin(c.t * 14) * 0.06;
  p.rHipX = -0.55 + flutter;
  p.lHipX = -0.35 - flutter;
  p.rKnee = 0.55 - flutter;
  p.lKnee = 0.85 + flutter;
  p.rAnk = -0.6;
  p.lAnk = -0.6;
  p.rHipZ = 0.08;
  p.lHipZ = 0.08;
  p.fist = 0.8;
}
function evalFire(p, c) {
  clearParams(p);
  const t = c.pt;
  const punch = smooth(0, 0.075, t);
  const recoil = smooth(0.06, 0.1, t) * Math.exp(-Math.max(0, t - 0.1) * 7);
  p.aim = c.hasAim ? punch : 0;
  p.aimSide = 0.3;
  p.look = c.hasAim ? 1 : 0;
  p.rShX = lerp2(0.6, Math.PI / 2, punch);
  p.rShZ = 0.12;
  p.rEl = lerp2(1.2, 0, punch) + 0.35 * recoil;
  p.torsoYaw = -0.08 + 0.1 * recoil;
  p.torsoPitch = -0.04 + 0.12 * recoil;
  p.bodyPitch = 0.05 * recoil;
  p.squash = 1 - 0.04 * recoil;
  p.headPitch = 0.05;
  p.lShX = -0.55;
  p.lShZ = 0.4;
  p.lEl = 0.7;
  p.lShY = 0.2;
  p.hipsY = -0.025;
  p.hipsYaw = -0.04;
  p.rHipZ = 0.06;
  p.lHipZ = 0.06;
  p.fist = 0.6;
  standIK(p, -0.075, 0, 0.05, 0.065, 0, -0.05);
}
function evalHold(p, c) {
  clearParams(p);
  const t = c.t;
  const shake = Math.sin(t * 37) * 0.012 + Math.sin(t * 23.3) * 8e-3;
  p.aim = c.hasAim ? 1 : 0;
  p.aimSide = 0.3;
  p.look = c.hasAim ? 0.9 : 0;
  p.brace = 1;
  p.rShX = Math.PI / 2;
  p.rShZ = 0.1;
  p.lShX = 1.25;
  p.lShZ = -0.35;
  p.lEl = 0.9;
  p.torsoYaw = -0.1 + shake;
  p.torsoPitch = 0.1 + shake * 0.6;
  p.torsoRoll = shake;
  p.bodyPitch = 0.14;
  p.hipsY = -0.045 + Math.abs(shake) * 0.3;
  p.hipsYaw = -0.05;
  p.headPitch = -0.04;
  p.headRoll = 0.06 + shake;
  p.rHipZ = 0.08;
  p.lHipZ = 0.08;
  p.fist = 0.8;
  standIK(p, -0.1, 0, 0.12, 0.06, 0, -0.08, p.bodyPitch);
}
function evalCrank(p, c) {
  clearParams(p);
  const a = c.t * TAU * 0.75;
  p.rShX = 1.25 + 0.3 * Math.sin(a);
  p.lShX = 1.25 + 0.3 * Math.sin(a);
  p.rShZ = -0.15;
  p.lShZ = -0.15;
  p.rEl = 0.55 - 0.35 * Math.cos(a);
  p.lEl = 0.55 - 0.35 * Math.cos(a);
  p.torsoPitch = -0.22 - 0.05 * Math.cos(a);
  p.torsoYaw = 0.05 * Math.sin(a);
  p.headPitch = 0.12;
  p.hipsY = -0.04;
  p.fist = 0.9;
  standIK(p, -0.07, 0, 0, 0.06, 0, 0);
}
function evalWave(p, c) {
  clearParams(p);
  const t = c.t;
  const breath = Math.sin(t * TAU * 0.32);
  p.rShZ = 2.45;
  p.rShX = -0.2;
  p.rShY = -1.2;
  p.rEl = 0.55 + 0.4 * Math.sin(t * 8);
  p.rHandZ = 0.15 * Math.sin(t * 8 - 0.6);
  p.lShZ = 0.3;
  p.lShX = 0.05;
  p.lEl = 0.25;
  p.torsoRoll = -0.04 + 0.03 * Math.sin(t * 2);
  p.headRoll = 0.12 + 0.05 * Math.sin(t * 2 + 0.5);
  p.headPitch = 0.06;
  p.hipsY = -7e-3 + 2e-3 * breath;
  p.rHipZ = 0.055;
  p.lHipZ = 0.055;
  p.fist = 0;
  standIK(p, 0, 0, 0, 0, 0, 0);
}
function evalPunch(p, c, left = false) {
  clearParams(p);
  const t = c.pt;
  const wind = smooth(0, 0.06, t);
  const hit = smooth(0.05, 0.12, t);
  const back = smooth(0.22, 0.45, t);
  const k = hit * (1 - back * 0.7);
  const shX = lerp2(lerp2(0.45, -0.25, wind), Math.PI / 2 - 0.08, k);
  const el = lerp2(lerp2(1, 1.7, wind), 0.06, k);
  if (!left) {
    p.rShX = shX;
    p.rShZ = 0.14;
    p.rEl = el;
    p.lShX = 0.55;
    p.lShZ = 0.3;
    p.lEl = 1.35;
  } else {
    p.lShX = shX;
    p.lShZ = 0.14;
    p.lEl = el;
    p.rShX = 0.55;
    p.rShZ = 0.3;
    p.rEl = 1.35;
  }
  const twist = (left ? 1 : -1) * lerp2(-0.2 * wind, 0.38, k);
  p.torsoYaw = twist;
  p.hipsYaw = twist * 0.35;
  p.torsoPitch = 0.1 * k;
  p.bodyPitch = 0.07 * k;
  p.headPitch = 0.04;
  p.hipsY = -0.035;
  p.rHipZ = 0.08;
  p.lHipZ = 0.08;
  p.fist = 1;
  if (left) standIK(p, -0.08, 0, 0.04, 0.1, 0, -0.04);
  else standIK(p, 0.1, 0, -0.04, -0.08, 0, 0.04);
}
function evalHurt(p, c) {
  clearParams(p);
  const k = Math.exp(-c.pt * 3.2);
  p.torsoPitch = -0.6 * k;
  p.bodyPitch = -0.28 * k;
  p.headPitch = -0.45 * k;
  p.rShX = 0.9 * k + 0.3;
  p.rShZ = 1 * k + 0.2;
  p.rEl = 0.6;
  p.lShX = 0.9 * k + 0.3;
  p.lShZ = 1 * k + 0.2;
  p.lEl = 0.6;
  p.hipsY = -0.04;
  p.rHipZ = 0.08;
  p.lHipZ = 0.08;
  p.squash = 1 - 0.06 * k;
  standIK(p, 0.06, 0, 0, -0.04, 0, 0);
}
function evalSlot(slot, p, c) {
  switch (slot) {
    case "ground":
      return evalGround(p, c, false);
    case "dash":
      return evalGround(p, c, true);
    case "jump":
      return evalJump(p, c);
    case "fall":
      return evalFall(p, c);
    case "land":
      return evalLand(p, c);
    case "swing":
      return evalSwing(p, c);
    case "pulled":
      return evalPulled(p, c);
    case "fire":
      return evalFire(p, c);
    case "hold":
      return evalHold(p, c);
    case "crank":
      return evalCrank(p, c);
    case "wave":
      return evalWave(p, c);
    case "punch":
      return evalPunch(p, c, false);
    case "punchL":
      return evalPunch(p, c, true);
    case "hurt":
      return evalHurt(p, c);
    case "sit":
      return evalSit(p, c);
  }
}
function evalSit(p, c) {
  clearParams(p);
  const breath = Math.sin(c.t * TAU * 0.26);
  p.bodyY = -(HIP_Y - 0.07);
  p.torsoPitch = -0.16 - 0.012 * breath;
  p.headPitch = 0.2 + 0.02 * Math.sin(c.t * 0.5);
  p.headRoll = 0.03 * Math.sin(c.t * 0.37);
  p.rShX = 0.62;
  p.lShX = 0.62;
  p.rShZ = 0.22;
  p.lShZ = 0.22;
  p.rShY = 0.2;
  p.lShY = 0.2;
  p.rEl = 0.55;
  p.lEl = 0.55;
  p.rHandZ = -0.1;
  p.lHandZ = -0.1;
  p.rHipZ = 0.1;
  p.lHipZ = 0.1;
  p.fist = 0.15;
  legIK(p, "l", -L1 * 0.97, -L2 * 0.92, 0.1, 0);
  legIK(p, "r", -L1 * 0.97, -L2 * 0.92, 0.1, 0);
}

// nexmax/production.ts
import * as THREE5 from "three";
var PROD_COLORS = {
  white: "#eef2f7",
  blue: "#2c6fe2",
  navy: "#1d3f86",
  dark: "#2b3545",
  visor: "#101826",
  led: "#7ff2ff",
  ledCore: "#e8ffff",
  hatch: "#c9d3df",
  hatchSlot: "#36404f"
};
var PROD_PROPORTIONS = {
  head: 0.9,
  torso: new THREE5.Vector3(0.94, 1.03, 0.94),
  leg: 1.08
};
var HIP_HEIGHT = 0.41;
var PROD_LIFT = HIP_HEIGHT * (PROD_PROPORTIONS.leg - 1);
var _c2 = new THREE5.Color();
var _ref = new THREE5.Color();
function recolorBody(g, color) {
  const col = g.attributes.color;
  if (!col) return paint(g, typeof color === "function" ? PROD_COLORS.white : color);
  _ref.set(NX_COLORS.body);
  const pos = g.attributes.position;
  const p = new THREE5.Vector3();
  const fixed = typeof color === "function" ? null : new THREE5.Color(color);
  for (let i = 0; i < col.count; i++) {
    const dr = col.getX(i) - _ref.r;
    const dg = col.getY(i) - _ref.g;
    const db = col.getZ(i) - _ref.b;
    if (dr * dr + dg * dg + db * db > 1e-4) continue;
    if (fixed) _c2.copy(fixed);
    else {
      p.fromBufferAttribute(pos, i);
      _c2.set(color(p));
    }
    col.setXYZ(i, _c2.r, _c2.g, _c2.b);
  }
  col.needsUpdate = true;
  return g;
}
function paintProductionHelmet(g) {
  return recolorBody(g, (p) => Math.abs(p.x) > 0.252 ? PROD_COLORS.blue : PROD_COLORS.white);
}
function buildAntenna() {
  const topY = HEAD_CENTER.y + HEAD_SPEC.bTop;
  const baseX = 0.07;
  const baseY = topY - 0.012;
  const tilt = -0.2;
  const base = ball(0.032, 14, 8, 0.55);
  base.translate(baseX, baseY, 0.02);
  paint(base, PROD_COLORS.blue);
  const collar = lathe(beadProfile(0.012, 0.014, 0.024, 2.4, 6), 10);
  const rodLen = 0.15;
  const rod = lathe(
    [
      [0, rodLen],
      [52e-4, rodLen],
      [58e-4, rodLen * 0.5],
      [66e-4, 0],
      [0, 0]
    ],
    8
  );
  const m = new THREE5.Matrix4().compose(new THREE5.Vector3(baseX, baseY + 0.012, 0.02), new THREE5.Quaternion().setFromEuler(new THREE5.Euler(0.12, 0, tilt)), new THREE5.Vector3(1, 1, 1));
  collar.translate(0, 8e-3, 0);
  collar.applyMatrix4(m);
  rod.applyMatrix4(m);
  paint(collar, PROD_COLORS.dark);
  paint(rod, "#dfe6ee");
  const tipPos = new THREE5.Vector3(0, rodLen + 0.012, 0).applyMatrix4(m);
  const tip = ball(0.017, 12, 8);
  const tc = new THREE5.Color(PROD_COLORS.led);
  const core = new THREE5.Color(PROD_COLORS.ledCore);
  const pos = tip.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, pos.getY(i) / 0.017);
    _c2.copy(tc).lerp(core, k * 0.7);
    col[i * 3] = _c2.r;
    col[i * 3 + 1] = _c2.g;
    col[i * 3 + 2] = _c2.b;
  }
  tip.setAttribute("color", new THREE5.BufferAttribute(col, 3));
  tip.translate(tipPos.x, tipPos.y, tipPos.z);
  const body = merge([base, collar, rod]);
  body.translate(0, -HEAD_PIVOT_Y, 0);
  tip.translate(0, -HEAD_PIVOT_Y, 0);
  tipPos.y -= HEAD_PIVOT_Y;
  return { body, tip: merge([tip]), tipPos };
}
var plateTop2 = (h) => (x, y, out, n) => {
  if (!headSurface(x, y, out, n)) return false;
  out.addScaledVector(n, 75e-4 + h);
  return true;
};
function buildLedEyes() {
  const parts = [];
  const EX = 58 * PX;
  const EY = fy(300);
  const rx = 13 * PX;
  const ry = 27 * PX;
  const edge = new THREE5.Color(PROD_COLORS.led);
  const core = new THREE5.Color(PROD_COLORS.ledCore);
  for (const side of [1, -1]) {
    const cx = side * EX;
    const outline = superEllipse(cx, EY, rx, ry, ry, 3.2, 3.2, 40);
    const eye = projectPatch({
      outline,
      center: [cx, EY],
      rings: [0, 0.4, 0.75, 1],
      surface: plateTop2(0),
      offset: (u) => 12e-4 + 16e-4 * Math.sqrt(Math.max(0, 1 - u * u))
    });
    const pos = eye.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot((pos.getX(i) - cx) / rx, (pos.getY(i) - EY) / ry);
      _c2.copy(core).lerp(edge, Math.min(1, d * 1.15));
      col[i * 3] = _c2.r;
      col[i * 3 + 1] = _c2.g;
      col[i * 3 + 2] = _c2.b;
    }
    eye.setAttribute("color", new THREE5.BufferAttribute(col, 3));
    parts.push(eye);
  }
  return merge(parts);
}
function buildHatch() {
  const [cx, cy] = ORE_CENTER;
  const outline = Array.from({ length: 36 }, (_, i) => {
    const a = i / 36 * Math.PI * 2;
    return [cx + Math.cos(a) * ORE_R * 0.96, cy + Math.sin(a) * ORE_R * 0.96];
  });
  const disc = projectPatch({
    outline,
    center: ORE_CENTER,
    rings: [0, 0.35, 0.7, 0.9, 1],
    surface: torsoBack,
    offset: (s) => 12e-4 + 16e-4 * (1 - s * s)
  });
  const pos = disc.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const base = new THREE5.Color(PROD_COLORS.hatch);
  const slot = new THREE5.Color(PROD_COLORS.hatchSlot);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - cx;
    const y = pos.getY(i) - cy;
    const inSlot = Math.abs(x) < ORE_R * 0.55 && [-0.38, 0, 0.38].some((k) => Math.abs(y - k * ORE_R) < ORE_R * 0.09);
    _c2.copy(inSlot ? slot : base);
    col[i * 3] = _c2.r;
    col[i * 3 + 1] = _c2.g;
    col[i * 3 + 2] = _c2.b;
  }
  disc.setAttribute("color", new THREE5.BufferAttribute(col, 3));
  disc.setAttribute("uv", new THREE5.BufferAttribute(new Float32Array(pos.count * 2), 2));
  return merge([disc]);
}
function makeProductionTorsoTexture(spec, serial = 86) {
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = PROD_COLORS.white;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = PROD_COLORS.blue;
  for (const u of [0, 0.5, 1]) {
    const x = u * W;
    const w2 = 0.16 * W;
    ctx.beginPath();
    ctx.roundRect(x - w2 / 2, H * 0.12, w2, H * 0.62, 60);
    ctx.fill();
  }
  ctx.fillStyle = PROD_COLORS.navy;
  ctx.fillRect(0, H * 0.83, W, H * 0.06);
  ctx.strokeStyle = "rgba(70,86,110,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.08);
  ctx.lineTo(W, H * 0.08);
  ctx.stroke();
  const x0 = (spec.logoU - spec.logoW / 2) * W;
  const y0 = (1 - spec.logoV - spec.logoH / 2) * H - H * 0.02;
  const w = spec.logoW * W * 0.85;
  const h = spec.logoH * H * 0.85;
  const poly = (pts, col) => {
    ctx.beginPath();
    pts.forEach(([u, v], i) => {
      const x = x0 + w * 0.08 + u * w;
      const y = y0 + v * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  };
  poly([[0, 0.41], [0, 1], [0.525, 1]], PROD_COLORS.navy);
  poly([[1, 0], [1, 1], [0.95, 1], [0.5375, 0.52]], PROD_COLORS.navy);
  poly([[0.18, 0.12], [0.95, 1], [0.525, 1], [0.18, 0.61]], PROD_COLORS.blue);
  ctx.fillStyle = PROD_COLORS.navy;
  ctx.font = `800 ${Math.round(H * 0.07)}px "M PLUS Rounded 1c", "Hiragino Sans", "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`NX-${String(serial).padStart(3, "0")}`, spec.logoU * W, y0 + h + H * 0.09);
  ctx.fillStyle = PROD_COLORS.blue;
  ctx.fillRect(0.75 * W - W * 0.05, H * 0.1, W * 0.1, H * 0.035);
  const t = new THREE5.CanvasTexture(c);
  t.colorSpace = THREE5.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE5.RepeatWrapping;
  return t;
}
function createProductionMaterials() {
  const visor = new THREE5.MeshPhysicalMaterial({
    color: PROD_COLORS.visor,
    roughness: 0.16,
    metalness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    emissive: new THREE5.Color("#0b2850"),
    emissiveIntensity: 0.45,
    envMapIntensity: 1.3
  });
  const led = new THREE5.MeshBasicMaterial({ vertexColors: true, color: new THREE5.Color(2.4, 2.4, 2.4) });
  const tip = new THREE5.MeshBasicMaterial({ vertexColors: true, color: new THREE5.Color(2, 2, 2) });
  const hatch = new THREE5.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.3 });
  return {
    visor,
    led,
    tip,
    hatch,
    dispose() {
      for (const m of [visor, led, tip, hatch]) m.dispose();
    }
  };
}

// nexmax/nexmaxModel.ts
var NATURAL_HEIGHT = 1.2;
var TWIST_LIMIT = 0.35;
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function group(parent, x, y, z, name, order = "XYZ") {
  const g = new THREE6.Group();
  g.name = name;
  g.position.set(x, y, z);
  g.rotation.order = order;
  parent.add(g);
  return g;
}
function solid(parent, geo, mat, mats, hull, name) {
  const m = new THREE6.Mesh(hull ? withHull(geo) : geo, mat);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  if (hull) m.customDepthMaterial = mats.hullDepth;
  parent.add(m);
  return m;
}
function createNexmax(height = 1.2, opts = {}) {
  const variant = opts.variant ?? "protagonist";
  const prod = variant === "production";
  const logo = torsoLogoUV();
  const logoSpec = { logoU: logo.u, logoV: logo.v, logoW: logo.w, logoH: logo.h };
  const torsoTex = prod ? makeProductionTorsoTexture(logoSpec, opts.serial ?? 86) : makeTorsoTexture(logoSpec);
  const mats = createNexmaxMaterials(torsoTex);
  const pm = prod ? createProductionMaterials() : null;
  const tone = (g, color) => prod ? recolorBody(g, color) : g;
  const root = new THREE6.Group();
  root.name = prod ? "nexmax-production" : "nexmax";
  const scaler = new THREE6.Group();
  scaler.name = "nexmax-scale";
  scaler.scale.setScalar(height / NATURAL_HEIGHT);
  if (prod) scaler.position.y = PROD_LIFT * (height / NATURAL_HEIGHT);
  root.add(scaler);
  const body = group(scaler, 0, 0, 0, "body");
  const hips = group(body, 0, J.hips, 0, "hips", "YXZ");
  const torso = group(hips, 0, J.torsoPivot - J.hips, 0, "torso", "YXZ");
  solid(torso, buildTorso(), mats.torso, mats, true, "torso");
  const ore = prod ? solid(torso, buildHatch(), pm.hatch, mats, false, "hatch") : solid(torso, buildOre(), mats.ore, mats, false, "ore");
  ore.castShadow = false;
  if (prod) torso.scale.copy(PROD_PROPORTIONS.torso);
  const head = group(torso, 0, HEAD_PIVOT_Y - J.torsoPivot, 0, "head", "YXZ");
  const helmetBase = buildHelmet();
  if (prod) paintProductionHelmet(helmetBase);
  helmetBase.translate(0, -HEAD_PIVOT_Y, 0);
  let antennaTip = null;
  if (prod) {
    head.scale.setScalar(PROD_PROPORTIONS.head);
    const ant = buildAntenna();
    solid(head, mergeParts([helmetBase, ant.body]), mats.body, mats, true, "helmet");
    antennaTip = solid(head, ant.tip, pm.tip, mats, false, "antennaTip");
    antennaTip.castShadow = false;
  } else solid(head, helmetBase, mats.body, mats, true, "helmet");
  const plateGeo = buildPlate();
  plateGeo.translate(0, -HEAD_PIVOT_Y, 0);
  const plate = solid(head, plateGeo, prod ? pm.visor : mats.plate, mats, false, "plate");
  plate.castShadow = false;
  const eyePivot = group(head, 0, EYE_CENTER_Y - HEAD_PIVOT_Y, 0, "eyes");
  const eyeGeos = {};
  const featGeos = {};
  const led = prod ? buildLedEyes().translate(0, -EYE_CENTER_Y, 0) : null;
  for (const e of EXPRESSIONS) {
    eyeGeos[e] = led ?? buildEyes(e).translate(0, -EYE_CENTER_Y, 0);
    featGeos[e] = buildFeatures(e, true).translate(0, -HEAD_PIVOT_Y, 0);
  }
  const eyes = solid(eyePivot, eyeGeos.happy, prod ? pm.led : mats.eyes, mats, false, "eyeballs");
  eyes.castShadow = false;
  const features = solid(head, featGeos.happy, mats.features, mats, false, "features");
  features.castShadow = false;
  if (prod) features.visible = false;
  const shY = J.shoulder.y - J.torsoPivot;
  const shR = group(torso, J.shoulder.x, shY, 0, "shoulderR", "XZY");
  const shL = group(torso, -J.shoulder.x, shY, 0, "shoulderL", "XZY");
  const upperGeo = tone(buildUpperArm(), PROD_COLORS.blue);
  solid(shR, upperGeo, mats.body, mats, true, "upperArmR");
  solid(shL, upperGeo.clone(), mats.body, mats, true, "upperArmL");
  const elR = group(shR, 0, -J.upperLen, 0, "elbowR");
  const elL = group(shL, 0, -J.upperLen, 0, "elbowL");
  const foreR = buildForearm(!prod);
  const foreL = buildForearm(false);
  solid(elR, tone(foreR.geo, PROD_COLORS.white), mats.body, mats, true, "forearmR");
  solid(elL, tone(foreL.geo, PROD_COLORS.white), mats.body, mats, true, "forearmL");
  if (foreR.ring) {
    const ring = solid(elR, foreR.ring, mats.ring, mats, false, "clawRing");
    ring.castShadow = false;
  }
  const wrR = group(elR, 0, -J.lowerLen, 0, "wristR");
  const wrL = group(elL, 0, -J.lowerLen, 0, "wristL");
  const handGeo = {
    rOpen: withHull(tone(buildHand(false, 0), PROD_COLORS.blue)),
    rFist: withHull(tone(buildHand(false, 1), PROD_COLORS.blue)),
    lOpen: withHull(tone(buildHand(true, 0), PROD_COLORS.blue)),
    lFist: withHull(tone(buildHand(true, 1), PROD_COLORS.blue))
  };
  const handR = solid(wrR, handGeo.rOpen, mats.body, mats, false, "handR");
  handR.customDepthMaterial = mats.hullDepth;
  const handL = solid(wrL, handGeo.lOpen, mats.body, mats, false, "handL");
  handL.customDepthMaterial = mats.hullDepth;
  const muzzle = new THREE6.Object3D();
  muzzle.name = "nmclawMuzzle";
  muzzle.position.set(0, fistFrontY(handGeo.rFist) - 4e-3, 0);
  wrR.add(muzzle);
  const claw = new THREE6.Group();
  claw.name = "nmclawHead";
  muzzle.add(claw);
  const hub = new THREE6.Mesh(buildClawHub(), mats.claw);
  hub.castShadow = true;
  claw.add(hub);
  const prongs = new THREE6.InstancedMesh(buildClawProng(), mats.claw, 3);
  prongs.castShadow = true;
  prongs.frustumCulled = false;
  claw.add(prongs);
  claw.visible = false;
  const hipYl = J.hip.y - J.hips;
  const hipR = group(hips, J.hip.x, hipYl, 0, "hipR", "ZXY");
  const hipL = group(hips, -J.hip.x, hipYl, 0, "hipL", "ZXY");
  const thighGeo = tone(buildThigh(), PROD_COLORS.white);
  solid(hipR, thighGeo, mats.body, mats, true, "thighR");
  solid(hipL, thighGeo.clone(), mats.body, mats, true, "thighL");
  if (prod) {
    hipR.scale.set(1, PROD_PROPORTIONS.leg, 1);
    hipL.scale.set(1, PROD_PROPORTIONS.leg, 1);
  }
  const knR = group(hipR, 0, -J.thighLen, 0, "kneeR");
  const knL = group(hipL, 0, -J.thighLen, 0, "kneeL");
  const shinGeo = tone(buildShin(), PROD_COLORS.blue);
  solid(knR, shinGeo, mats.body, mats, true, "shinR");
  solid(knL, shinGeo.clone(), mats.body, mats, true, "shinL");
  const anR = group(knR, 0, -J.shinLen, 0, "ankleR");
  const anL = group(knL, 0, -J.shinLen, 0, "ankleL");
  const footGeo = tone(buildFoot(), PROD_COLORS.white);
  solid(anR, footGeo, mats.body, mats, true, "footR");
  solid(anL, footGeo.clone(), mats.body, mats, true, "footL");
  const parts = {
    body,
    hips,
    torso,
    head,
    eyePivot,
    eyes,
    features,
    shR,
    shL,
    elR,
    elL,
    wrR,
    wrL,
    handR,
    handL,
    hipR,
    hipL,
    knR,
    knL,
    anR,
    anL,
    muzzle,
    claw,
    prongs
  };
  const extra = { variant, antennaTip, pm };
  return animate(root, parts, mats, height, { eyeGeos, featGeos, handGeo }, extra);
}
function fistFrontY(g) {
  const pos = g.attributes.position;
  let minAll = 0;
  let minAxis = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y < minAll) minAll = y;
    if (Math.hypot(x, z) < 0.018 && y < minAxis) minAxis = y;
  }
  return minAxis === Infinity ? minAll : minAxis;
}
function mergeParts(list) {
  return merge(list);
}
function armBasis(dir, out) {
  const y = _v1.copy(dir).negate();
  const x = _v2.set(1, 2 * dir.x, 0);
  x.addScaledVector(y, -x.dot(y));
  if (x.lengthSq() < 1e-8) x.set(0, 0, 1).addScaledVector(y, -y.z);
  x.normalize();
  const z = _v3.crossVectors(x, y);
  _m.makeBasis(x, y, z);
  return out.setFromRotationMatrix(_m);
}
var _v1 = new THREE6.Vector3();
var _v2 = new THREE6.Vector3();
var _v3 = new THREE6.Vector3();
var _m = new THREE6.Matrix4();
function animate(root, P, mats, height, G, X) {
  const rand = rng(1031);
  let pose = "idle";
  let activeSlot = "ground";
  const weights = {};
  const slotStart = {};
  const slotParams = {};
  for (const s of SLOTS) {
    weights[s] = s === "ground" ? 1 : 0;
    slotStart[s] = 0;
    slotParams[s] = zeroParams();
  }
  const blended = zeroParams();
  const ctx = { t: 0, pt: 0, speed: 0, phase: 0, swing: 0, swingVel: 0, hasAim: false, lookYaw: 0, lookPitch: 0 };
  let t = rand() * 10;
  let speedS = 0;
  let swingIn = 0;
  let swingS = 0;
  let swingVel = 0;
  let aim = null;
  let lookTimer = 1.5;
  let lookYawT = 0;
  let lookPitchT = 0;
  let blinkIn = 1.2 + rand() * 2;
  let blinkT = -1;
  let doubleBlink = false;
  let baseExpr = "happy";
  let shownExpr = "happy";
  let clawOpenT = 0;
  let clawExtT = 0;
  let clawOpen = 0;
  let clawExt = 0;
  let lastProngOpen = -1;
  let oreLevel = 1;
  let fistR = false;
  let fistL = false;
  const tmp = new THREE6.Vector3();
  const tmp2 = new THREE6.Vector3();
  const qa = new THREE6.Quaternion();
  const qb = new THREE6.Quaternion();
  const pm = new THREE6.Matrix4();
  const pl = new THREE6.Matrix4();
  const pe = new THREE6.Euler();
  const pq = new THREE6.Quaternion();
  const pp = new THREE6.Vector3();
  const ps = new THREE6.Vector3();
  const pivot = new THREE6.Vector3();
  const prod = X.variant === "production";
  const character = {
    name: "nexmax",
    variant: X.variant,
    root,
    placeholder: false,
    height,
    handAnchor: P.muzzle,
    clawHead: P.claw,
    autoExpression: true,
    setPose(p) {
      const next = ALL_POSES.includes(p) ? p : "idle";
      if (next === pose) return;
      pose = next;
      const s = slotOf(next);
      if (s !== activeSlot) {
        activeSlot = s;
        slotStart[s] = t;
      }
    },
    setAim(target) {
      if (target) {
        if (!aim) aim = new THREE6.Vector3();
        aim.copy(target);
      } else aim = null;
    },
    setClaw(open, extended) {
      clawOpenT = Math.min(1, Math.max(0, Number(open)));
      clawExtT = Math.min(1, Math.max(0, Number(extended)));
    },
    setOreGlow(v) {
      oreLevel = Math.max(0, v);
    },
    setSwing(a) {
      swingIn = a;
    },
    setExpression(e) {
      if (EXPRESSIONS.includes(e)) baseExpr = e;
    },
    stats() {
      let calls = 0;
      let tris = 0;
      root.traverseVisible((o) => {
        const m = o;
        if (!m.isMesh) return;
        calls++;
        const g = m.geometry;
        const n = g.index ? g.index.count : g.attributes.position.count;
        tris += n / 3 * (m.isInstancedMesh ? m.count : 1);
      });
      return { drawCalls: calls, triangles: Math.round(tris) };
    },
    dispose() {
      root.traverse((o) => {
        const m = o;
        if (m.isMesh) m.geometry.dispose();
      });
      for (const g of [...Object.values(G.eyeGeos), ...Object.values(G.featGeos), ...Object.values(G.handGeo)]) g.dispose();
      mats.dispose();
      X.pm?.dispose();
      root.removeFromParent();
    },
    update(dtIn, moveSpeed) {
      const dt = Math.min(0.1, Math.max(0, dtIn));
      t += dt;
      const k = (tau2) => 1 - Math.exp(-dt / tau2);
      let eff = Math.max(0, moveSpeed);
      if (pose === "walk" && eff < 0.3) eff = 2.2;
      if (pose === "run") eff = Math.max(eff, 5.2);
      if (pose === "dash") eff = Math.max(eff, 6.4);
      speedS += (eff - speedS) * k(0.12);
      ctx.phase = (ctx.phase + strideFreq(speedS) * dt) % 1;
      const prevSwing = swingS;
      swingS += (swingIn - swingS) * k(0.03);
      const sv = dt > 0 ? (swingS - prevSwing) / dt : 0;
      swingVel += (sv - swingVel) * k(0.12);
      lookTimer -= dt;
      if (lookTimer <= 0) {
        lookTimer = 1.8 + rand() * 2.8;
        if (rand() < 0.35) {
          lookYawT = 0;
          lookPitchT = 0;
        } else {
          lookYawT = (rand() * 2 - 1) * 0.5;
          lookPitchT = (rand() * 2 - 1) * 0.1 + 0.02;
        }
      }
      ctx.lookYaw += (lookYawT - ctx.lookYaw) * k(0.3);
      ctx.lookPitch += (lookPitchT - ctx.lookPitch) * k(0.3);
      let sum = 0;
      const tau = SLOT_TAU[activeSlot];
      for (const s of SLOTS) {
        const target = s === activeSlot ? 1 : 0;
        weights[s] += (target - weights[s]) * k(tau);
        if (weights[s] < 1e-3 && s !== activeSlot) weights[s] = 0;
        sum += weights[s];
      }
      ctx.t = t;
      ctx.speed = speedS;
      ctx.swing = swingS;
      ctx.swingVel = swingVel;
      ctx.hasAim = !!aim;
      clearParams(blended);
      blended.squash = 0;
      for (const s of SLOTS) {
        const w = weights[s] / (sum || 1);
        if (w <= 0) continue;
        ctx.pt = t - slotStart[s];
        evalSlot(s, slotParams[s], ctx);
        addWeighted(blended, slotParams[s], w);
      }
      apply(blended);
      updateFace(dt);
      clawOpen += (clawOpenT - clawOpen) * k(0.05);
      clawExt += (clawExtT - clawExt) * k(0.05);
      updateClaw();
      const pulse = 0.84 + 0.16 * Math.sin(t * 2.3);
      mats.ore.color.setScalar(0.32 + 0.82 * oreLevel * pulse);
      mats.ring.color.setScalar(1.3 + 0.35 * clawExt + 0.08 * Math.sin(t * 3.1));
      if (prod && X.pm) {
        const ph = t * 0.8 % 1;
        const blink = ph < 0.08 || ph > 0.16 && ph < 0.24 ? 3.2 : 1;
        X.pm.tip.color.setScalar(blink);
        X.pm.led.color.setScalar(2.2 + 0.25 * Math.sin(t * 1.7));
      }
      if (!fistR && blended.fist > 0.58) fistR = true;
      else if (fistR && blended.fist < 0.42) fistR = false;
      const fl = blended.fist * (1 - blended.brace);
      if (!fistL && fl > 0.58) fistL = true;
      else if (fistL && fl < 0.42) fistL = false;
      P.handR.geometry = fistR ? G.handGeo.rFist : G.handGeo.rOpen;
      P.handL.geometry = fistL ? G.handGeo.lFist : G.handGeo.lOpen;
      root.updateMatrixWorld(true);
    }
  };
  function apply(p) {
    const s = Math.max(0.6, p.squash);
    const side = 1 / Math.sqrt(s);
    P.body.rotation.set(p.bodyPitch, 0, p.bodyRoll);
    P.body.scale.set(side, s, side);
    pivot.set(p.pivotX, p.pivotY, 0);
    tmp.set(p.pivotX * side, p.pivotY * s, 0).applyEuler(P.body.rotation);
    P.body.position.set(0, p.bodyY, p.bodyZ).add(pivot).sub(tmp);
    P.hips.position.set(p.hipsX, J.hips + p.hipsY, 0);
    P.hips.rotation.set(p.hipsPitch, p.hipsYaw, p.hipsRoll);
    let torsoYaw = p.torsoYaw;
    if (aim && p.aim > 1e-3) {
      root.updateMatrixWorld(true);
      tmp.copy(aim);
      P.hips.worldToLocal(tmp);
      const yaw = Math.atan2(-tmp.x, -tmp.z);
      const horiz = Math.hypot(tmp.x, tmp.z);
      const flat = Math.min(1, Math.max(0, horiz / (Math.abs(tmp.y - 0.6) + 0.3) - 0.3));
      torsoYaw += Math.max(-TWIST_LIMIT, Math.min(TWIST_LIMIT, yaw * 0.5)) * p.aim * flat;
      const total = p.hipsYaw + torsoYaw;
      const clamped = Math.max(-TWIST_LIMIT, Math.min(TWIST_LIMIT, total));
      torsoYaw += (clamped - total) * Math.min(1, p.aim);
    }
    P.torso.rotation.set(p.torsoPitch, torsoYaw, p.torsoRoll);
    P.head.rotation.set(p.headPitch, p.headYaw, p.headRoll);
    P.shR.rotation.set(p.rShX, p.rShY, p.rShZ);
    P.shL.rotation.set(p.lShX, -p.lShY, -p.lShZ);
    P.elR.rotation.set(Math.max(0, p.rEl), 0, 0);
    P.elL.rotation.set(Math.max(0, p.lEl), 0, 0);
    P.wrR.rotation.set(p.rHandX, 0, p.rHandZ);
    P.wrL.rotation.set(p.lHandX, 0, -p.lHandZ);
    P.hipR.rotation.set(p.rHipX, -p.rHipY, p.rHipZ);
    P.hipL.rotation.set(p.lHipX, p.lHipY, -p.lHipZ);
    P.knR.rotation.set(-Math.max(0, p.rKnee), 0, 0);
    P.knL.rotation.set(-Math.max(0, p.lKnee), 0, 0);
    P.anR.rotation.set(p.rAnk, 0, -p.rHipZ - p.hipsRoll);
    P.anL.rotation.set(p.lAnk, 0, p.lHipZ - p.hipsRoll);
    if (aim && (p.aim > 1e-3 || p.look > 1e-3)) {
      root.updateMatrixWorld(true);
      if (p.look > 1e-3) {
        tmp.copy(aim);
        P.torso.worldToLocal(tmp).sub(P.head.position);
        tmp.y -= 0.25;
        const yaw = Math.max(-0.9, Math.min(0.9, Math.atan2(-tmp.x, -tmp.z)));
        const pitch = Math.max(-0.5, Math.min(0.6, Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z))));
        P.head.rotation.set(
          THREE6.MathUtils.lerp(p.headPitch, pitch * 0.7, p.look),
          THREE6.MathUtils.lerp(p.headYaw, yaw * 0.8, p.look),
          p.headRoll
        );
      }
      if (p.aim > 1e-3) {
        tmp.copy(aim);
        P.torso.worldToLocal(tmp).sub(P.shR.position);
        if (tmp.lengthSq() > 1e-6) {
          tmp.normalize();
          const steep = THREE6.MathUtils.smoothstep(tmp.y, 0.55, 0.92);
          tmp.x += p.aimSide * steep;
          tmp.normalize();
          armBasis(tmp, qa);
          P.shR.quaternion.slerp(qa, p.aim);
          P.elR.rotation.x *= 1 - p.aim;
          P.wrR.rotation.x *= 1 - p.aim;
          P.wrR.rotation.z *= 1 - p.aim;
        }
      }
    }
    if (p.brace > 1e-3) {
      root.updateMatrixWorld(true);
      tmp2.set(0, -0.085, 0);
      P.elR.localToWorld(tmp2);
      P.torso.worldToLocal(tmp2).sub(P.shL.position);
      const D = tmp2.length();
      if (D > 1e-4) {
        const Lu = J.upperLen;
        const Ll = J.lowerLen + 0.05;
        const d = Math.min(D, Lu + Ll - 1e-3);
        const beta = Math.PI - Math.acos(Math.max(-1, Math.min(1, (Lu * Lu + Ll * Ll - d * d) / (2 * Lu * Ll))));
        const gamma = Math.acos(Math.max(-1, Math.min(1, (Lu * Lu + d * d - Ll * Ll) / (2 * Lu * d))));
        tmp2.divideScalar(D);
        armBasis(tmp2, qa);
        qb.setFromAxisAngle(_v1.set(1, 0, 0), -gamma);
        qa.multiply(qb);
        P.shL.quaternion.slerp(qa, p.brace);
        P.elL.rotation.x = THREE6.MathUtils.lerp(P.elL.rotation.x, beta, p.brace);
      }
    }
  }
  function updateFace(dt) {
    let want = baseExpr;
    if (character.autoExpression) {
      if (pose === "fall" && t - slotStart.fall > 0.35) want = "surprised";
      if (pose === "hurt") want = "surprised";
    }
    blinkIn -= dt;
    if (blinkT < 0 && (blinkIn <= 0 || want !== shownExpr)) {
      blinkT = 0;
      blinkIn = 2 + rand() * 3.2;
      doubleBlink = rand() < 0.18;
    }
    let open = 1;
    if (blinkT >= 0) {
      blinkT += dt;
      const dur = 0.16;
      const x = blinkT / dur;
      if (x < 0.3) open = 1 - x / 0.3;
      else if (x < 0.45) {
        open = 0;
        if (want !== shownExpr) {
          shownExpr = want;
          P.eyes.geometry = G.eyeGeos[shownExpr];
          P.features.geometry = G.featGeos[shownExpr];
        }
      } else if (x < 1) open = (x - 0.45) / 0.55;
      else {
        open = 1;
        blinkT = -1;
        if (doubleBlink) {
          doubleBlink = false;
          blinkIn = 0.12;
        }
      }
    }
    P.eyePivot.scale.y = 0.08 + 0.92 * open;
  }
  function updateClaw() {
    const ext = clawExt;
    P.claw.visible = ext > 0.02;
    if (!P.claw.visible) return;
    P.claw.position.set(0, -4e-3 - 0.032 * ext, 0);
    P.claw.scale.setScalar((0.35 + 0.65 * ext) * 1.35);
    const open = clawOpen;
    if (Math.abs(open - lastProngOpen) < 1e-3) return;
    lastProngOpen = open;
    const ang = THREE6.MathUtils.lerp(0.1, 0.85, open);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2 + Math.PI / 2;
      pm.makeRotationY(a);
      pe.set(0, 0, ang);
      pq.setFromEuler(pe);
      pp.set(0.0105, -0.012, 0);
      ps.set(1, 1, 1);
      pl.compose(pp, pq, ps);
      pm.multiply(pl);
      P.prongs.setMatrixAt(i, pm);
    }
    P.prongs.instanceMatrix.needsUpdate = true;
  }
  character.update(0, 0);
  return character;
}
export {
  J as NEXMAX_JOINTS,
  ALL_POSES as NEXMAX_POSES,
  NX_COLORS,
  OUTLINE,
  SELF_LIGHT,
  createNexmax,
  setOutlineViewport
};
