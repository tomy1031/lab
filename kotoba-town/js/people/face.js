// Painted face for the procedural townspeople.
// A thin patch hugs the front of the head; its fragment shader draws the eyes (white, iris with
// gradient, pupil, catch-lights, lashes, lid crease), brows, nose shading, mouth (closed smile or open
// with teeth and tongue), blush, a beard or moustache, and — for older people — smile lines.
// Everything is drawn from distance fields in a front view of the face (units of the head radius R),
// so it stays sharp in VR at any distance, and blinking, gaze, lip-sync and expressions are uniforms.
// It is a MeshStandardMaterial underneath, so it is lit exactly like the rest of the head.
import * as THREE from 'three';

/** Skin glows a little from within (a cheap stand-in for soft fill light); shared with person.js so the patch matches the head. */
export const SKIN_GLOW = 0.16;

// patch on the head ellipsoid (SphereGeometry angles; +z is the front)
const PHI = 2.3;          // horizontal span (rad)
const THETA0 = 0.9;       // from the top of the head (rad)
const THETA = 1.75;       // vertical span (rad)

/** Head ellipsoid (x, y, z) — round, a little wider than tall like a friendly cartoon face. */
export const HEAD_SCALE = [0.95, 1.0, 0.98];

// front-view layout in units of R (x to the person's left, y up from the head centre)
export const FACE = {
  eye: [0.34, -0.08], eyeSize: [0.16, 0.185],
  brow: [0.35, 0.2],
  nose: [0, -0.3],
  mouth: [0, -0.5],
  blush: [0.53, -0.33],
};

/**
 * Resting expressions (look.expression). smile: mouth curve (1 = the default soft smile, < 0 turns the
 * corners down); brow: + lowers the inner ends (stern), - lifts them (kind/worried); lid: upper lids rest
 * lower (calm, sleepy, stern); open: the mouth rests a little open (a cheerful grin); cheek: smiling
 * cheeks push the lower lids up; blush: blush strength; browY: brows up/down (R units); gazeY: eyes look
 * down/up; headX/headZ: a small resting head pitch/tilt (radians) the body applies.
 */
export const EXPRESSIONS = {
  neutral: { smile: 1, brow: 0, lid: 0, open: 0, cheek: 0, blush: 1, browY: 0, gazeY: 0, headX: 0, headZ: 0 },
  smile: { smile: 1.3, brow: -0.15, lid: 0.04, open: 0, cheek: 0.4, blush: 1.15, browY: 0.008, gazeY: 0, headX: 0, headZ: 0.03 },
  cheerful: { smile: 1.45, brow: -0.2, lid: 0, open: 0.34, cheek: 0.55, blush: 1.3, browY: 0.022, gazeY: 0, headX: -0.02, headZ: -0.04 },
  gentle: { smile: 1.25, brow: -0.45, lid: 0.2, open: 0, cheek: 0.5, blush: 1.15, browY: 0.004, gazeY: -0.02, headX: 0.02, headZ: 0.05 },
  calm: { smile: 0.95, brow: -0.25, lid: 0.15, open: 0, cheek: 0.2, blush: 0.9, browY: 0, gazeY: 0, headX: 0, headZ: 0 },
  serious: { smile: 0.25, brow: 0.25, lid: 0.12, open: 0, cheek: 0, blush: 0.55, browY: -0.012, gazeY: 0, headX: -0.01, headZ: 0 },
  stern: { smile: -0.45, brow: 0.75, lid: 0.12, open: 0, cheek: 0, blush: 0.25, browY: -0.045, gazeY: 0, headX: -0.03, headZ: 0 },
  shy: { smile: 0.8, brow: -0.55, lid: 0.14, open: 0, cheek: 0.25, blush: 1.9, browY: 0.012, gazeY: -0.09, headX: 0.07, headZ: 0.06 },
};
export function expressionOf(look) { return EXPRESSIONS[look?.expression] || EXPRESSIONS.neutral; }

const f = (n) => Number(n).toFixed(4);

const GLSL = /* glsl */ `
uniform vec3 uSkin;
uniform vec3 uIris;
uniform vec3 uLash;
uniform vec3 uBrowC;
uniform vec3 uLip;
uniform vec4 uState;   // x blink 0..1, y squint (laugh) 0..1, z mouth open 0..1, w brow raise (R units)
uniform vec2 uGaze;    // iris offset in eye units
uniform vec4 uStyle;   // x feminine 0..1, y age 0..1, z blush 0..1, w brow weight
uniform vec2 uBeard;   // x moustache 0..1, y beard 0..1
uniform vec4 uMood;    // resting expression: x smile curve, y brow tilt (+ stern), z lid droop, w mouth rest open
uniform vec2 uMood2;   // x cheek raise, y brow offset (R units)
varying vec2 vFaceUv;
float gEye;            // where the eye is (for gloss)
vec3 gEm;              // emissive (catch-lights)

float aa(float d) { float w = fwidth(d) * 0.8 + 1e-5; return 1.0 - smoothstep(-w, w, d); }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

vec3 faceColor() {
  gEye = 0.0; gEm = vec3(0.0);
  float az = (vFaceUv.x - 0.5) * ${f(PHI)};
  float el = 1.5707963 - (${f(THETA0)} + (1.0 - vFaceUv.y) * ${f(THETA)});
  // front view of the head ellipsoid, units of R
  vec2 P = vec2(${f(HEAD_SCALE[0])} * sin(az) * cos(el), ${f(HEAD_SCALE[1])} * sin(el));
  float side = P.x < 0.0 ? -1.0 : 1.0;
  vec3 col = uSkin;
  float fem = uStyle.x, age = uStyle.y;

  // ---- blush (soft)
  vec2 bq = (vec2(abs(P.x), P.y) - vec2(${f(FACE.blush[0])}, ${f(FACE.blush[1])})) / vec2(0.14, 0.075);
  col = mix(col, vec3(0.96, 0.55, 0.55), (1.0 - smoothstep(0.15, 1.0, length(bq))) * 0.34 * uStyle.z);

  // ---- smile lines for older faces
  if (age > 0.0) {
    vec2 c = vec2(abs(P.x), P.y);
    float cf = min(sdSeg(c, vec2(0.55, -0.04), vec2(0.62, -0.01)), sdSeg(c, vec2(0.55, -0.11), vec2(0.62, -0.13)));
    float nl = abs(length((c - vec2(0.0, -0.3)) / vec2(0.22, 0.25)) - 1.0) * 0.22;
    float nlm = step(-0.55, P.y) * step(P.y, -0.36) * step(0.12, abs(P.x));
    col = mix(col, uSkin * 0.74, max(aa(cf - 0.008), aa(nl - 0.005) * nlm * 0.7) * 0.6 * age);
  }

  // ---- nose: a soft shadow on one side
  vec2 nq = (P - vec2(${f(FACE.nose[0])} + 0.03, ${f(FACE.nose[1])} - 0.01)) / vec2(0.032, 0.024);
  col = mix(col, uSkin * 0.8, (1.0 - smoothstep(0.25, 1.0, length(nq))) * 0.5);

  // ---- beard (short, painted) and moustache
  if (uBeard.y > 0.0) {
    vec2 q = (P - vec2(0.0, -0.78)) / vec2(0.62, 0.42);
    float jaw = length(q) - 1.0;
    float cheekCut = P.y - (-0.36 - 0.25 * smoothstep(0.2, 0.6, abs(P.x)));      // stays below the cheeks
    float d = max(jaw, cheekCut);
    float grain = 0.75 + 0.25 * hash(floor(P * 140.0));
    col = mix(col, uBrowC * grain, aa(d) * 0.88 * uBeard.y);
  }
  if (uBeard.x > 0.0) {
    vec2 m = vec2(abs(P.x), P.y) - vec2(0.075, ${f(FACE.mouth[1])} + 0.085);
    float droop = m.x * m.x * 2.2;
    float d = length((m + vec2(0.0, droop)) / vec2(0.1, 0.035)) - 1.0;
    col = mix(col, uBrowC, aa(d * 0.035) * uBeard.x);
  }

  // ---- brows
  {
    vec2 b = (P - vec2(side * ${f(FACE.brow[0])}, ${f(FACE.brow[1])} + uState.w + uMood2.y)) / 0.17;
    float ox = b.x * side;                       // toward the outer end
    float tilt = uMood.y;                        // + inner ends down (stern), - inner ends up (kind)
    float yc = 0.18 * (1.0 - ox * ox) * (1.0 - 0.6 * max(tilt, 0.0)) - 0.06 * ox + tilt * (tilt > 0.0 ? 0.5 : 0.3) * ox;
    float th = mix(0.12, 0.08, fem) * uStyle.w * (1.0 - 0.55 * smoothstep(0.0, 1.0, ox)) * (1.0 - 0.25 * smoothstep(-0.4, -1.0, ox));
    float d = max(abs(b.y - yc) - th, abs(b.x) - 1.0);
    col = mix(col, uBrowC, aa(d * 0.17));
  }

  // ---- eyes
  {
    vec2 E = vec2(${f(FACE.eyeSize[0])}, ${f(FACE.eyeSize[1])});
    vec2 e = (P - vec2(side * ${f(FACE.eye[0])}, ${f(FACE.eye[1])})) / E;   // eye units, real orientation
    float ox = e.x * side;                                               // + toward the outer corner
    float blink = clamp(max(uState.x, uState.y * 0.55), 0.0, 1.0);
    float xx = clamp(e.x, -1.0, 1.0);
    float top = sqrt(1.0 - xx * xx) * (0.8 + 0.08 * ox);                 // upper lid sits low over the iris
    float bot = -sqrt(1.0 - xx * xx) * 0.98 * (1.0 - 0.3 * uMood2.x);        // smiling cheeks lift the lower lid
    float lid = mix(top, bot + 0.04, max(blink, uMood.z));
    lid -= max(uMood.y, 0.0) * 0.26 * (1.0 - ox) * (1.0 - blink);       // stern: the lid slopes down to the inner corner
    float inX = abs(e.x) - 1.0;
    float open = aa(max(max(e.y - lid, bot - e.y), inX) * E.x);
    // iris: a circle in real space, big, touching the lid
    vec2 ic = uGaze + vec2(0.0, -0.02);
    vec2 v = (e - ic) * vec2(1.0, E.y / E.x);
    float r = length(v);
    float ri = 0.9;
    float t = smoothstep(0.8, -0.75, v.y);                               // light from below
    vec3 iris = mix(uIris * 0.32, uIris * 1.45 + 0.05, t * t);
    iris = mix(iris, uIris * 0.25, smoothstep(ri * 0.8, ri, r));         // dark rim
    iris = mix(iris, uIris * 0.1, aa((r - ri * 0.44) * E.x));            // pupil
    vec3 sclera = vec3(0.985, 0.98, 0.975) * mix(0.82, 1.0, smoothstep(0.0, 0.28, lid - e.y));
    vec3 eyeCol = mix(sclera, iris, aa((r - ri) * E.x));
    // catch-lights (same direction in both eyes)
    float h1 = aa((length((v - vec2(0.3, 0.33)) / vec2(1.0, 1.2)) - 0.23) * E.x);
    float h2 = aa((length(v - vec2(-0.28, -0.36)) - 0.1) * E.x);
    float hl = max(h1, h2 * 0.85) * (1.0 - blink);
    eyeCol = mix(eyeCol, vec3(1.0), hl);
    gEm += vec3(0.5) * hl * open;
    col = mix(col, eyeCol, open);
    gEye = open;
    // upper lash line: a bold band on the lid edge, heavier at the outer corner, with a small flick
    float th = mix(0.17, 0.22, fem) * (0.75 + 0.45 * smoothstep(-0.7, 0.9, ox)) * mix(1.0, 0.7, blink);
    float lash = max(max(lid - 0.05 - e.y, e.y - lid - th), abs(e.x) - 1.04);
    vec2 w0 = vec2(side * 0.88, top * 0.75 + 0.1);
    float wing = sdSeg(e, w0, w0 + vec2(side * mix(0.2, 0.32, fem), mix(0.07, 0.16, fem))) - mix(0.06, 0.085, fem);
    float lashA = aa(min(lash, wing) * E.x);
    col = mix(col, uLash, lashA);
    // lower lash: a faint line on the outer half
    float low = max(max(abs(e.y - bot) - 0.05, -ox + 0.1), abs(e.x) - 0.97);
    col = mix(col, uLash, aa(low * E.x) * 0.4 * (1.0 - blink));
    // lid crease
    float crease = max(abs(e.y - (top + 0.36 + 0.06 * ox)) - 0.035, abs(e.x + side * 0.12) - 0.75);
    col = mix(col, uSkin * 0.7, aa(crease * E.x) * 0.4 * (1.0 - blink * 0.7));
    // laughing eyes: a closed upward arc
    if (uState.y > 0.01) {
      float closedMix = smoothstep(0.35, 0.75, uState.y);
      float arc = max(abs(e.y - (0.2 - 0.75 * e.x * e.x)) - 0.12, abs(e.x) - 0.95);
      float eyeArea = max(max(open, lashA), aa((max(abs(e.y - bot * 0.5) - 1.3, abs(e.x) - 1.35)) * E.x));
      col = mix(col, uSkin, closedMix * eyeArea);
      col = mix(col, uLash, aa(arc * E.x) * closedMix);
    }
  }

  // ---- mouth
  {
    float mo = max(uState.z, uMood.w);
    float sm = uMood.x;
    vec2 m = (P - vec2(${f(FACE.mouth[0])}, ${f(FACE.mouth[1])})) / vec2(mix(0.13, 0.105, mo) * (1.0 + 0.12 * clamp(sm - 1.0, -0.6, 0.6)), 0.12);
    float yl = 0.24 * sm * (m.x * m.x - 0.35);               // smile: corners up (sm < 0: corners down)
    float hw = 1.0 - m.x * m.x;
    // closed: a short curved line, thicker in the middle
    float line = max(abs(m.y - yl) - 0.07 * (0.45 + 0.55 * hw), abs(m.x) - 1.0);
    float closedA = aa(line * 0.12) * (1.0 - smoothstep(0.05, 0.2, mo));
    // open: between the smile line and a rounder lower curve
    float yt = yl + 0.05;
    float yb = yl - mo * 1.1 * pow(max(hw, 0.0), 0.7);
    float inside = max(max(m.y - yt, yb - m.y), abs(m.x) - 1.0);
    float on = smoothstep(0.03, 0.15, mo);
    float openA = aa(inside * 0.12) * on;
    vec3 mc = vec3(0.38, 0.11, 0.13);
    mc = mix(mc, vec3(0.96, 0.95, 0.92), step(yt - 0.22 * smoothstep(0.25, 0.6, mo), m.y) * step(abs(m.x), 0.72));   // teeth
    mc = mix(mc, vec3(0.88, 0.45, 0.47), (1.0 - smoothstep(0.2, 0.75, length((m - vec2(0.0, yb + 0.22 * mo)) / vec2(0.6, 0.4)))) * smoothstep(0.3, 0.6, mo)); // tongue
    col = mix(col, mc, openA);
    float rim = aa((abs(inside) - 0.045) * 0.12) * on;
    col = mix(col, uLip, max(closedA, rim * 0.6));
  }
  return col;
}
`;

// ------------------------------------------------------------------ head surface
// Every shell around the head (skin, face patch, hair) uses the same mapping: a sphere, scaled to
// HEAD_SCALE, then the lower half narrowed a little toward the chin. Normals follow the mapping exactly,
// so the face patch shades seamlessly into the skin underneath.
const JAW_TAPER = 0.15;
const JAW_FLAT = 0.05;
const JAW_SHORT = 0.1;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _d = new THREE.Vector3(); const _a = new THREE.Vector3(); const _b = new THREE.Vector3();
const _J = new THREE.Matrix3();

function deform(v, R, out) {
  const t = sstep(0.1, -0.95, v.y / R);
  return out.set(v.x * (1 - JAW_TAPER * t), v.y * (1 - JAW_SHORT * t), v.z * (1 - JAW_FLAT * t));
}

/** Map a point/normal on a sphere (centred at the head centre) onto the head surface. */
function mapPoint(p0, R, outP, outN) {
  const p1 = _d.set(p0.x * HEAD_SCALE[0], p0.y * HEAD_SCALE[1], p0.z * HEAD_SCALE[2]);
  const n1 = new THREE.Vector3(p0.x / HEAD_SCALE[0], p0.y / HEAD_SCALE[1], p0.z / HEAD_SCALE[2]).normalize();
  const e = R * 1e-3;
  const cols = [];
  for (const ax of ['x', 'y', 'z']) {
    _a.copy(p1); _a[ax] += e; _b.copy(p1); _b[ax] -= e;
    cols.push(deform(_a, R, new THREE.Vector3()).sub(deform(_b, R, new THREE.Vector3())).divideScalar(2 * e));
  }
  _J.set(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z);
  _J.invert().transpose();
  deform(p1, R, outP);
  if (outN) outN.copy(n1).applyMatrix3(_J).normalize();
  return outP;
}

/** Bend a geometry built as a sphere around the origin onto the head surface (in place). */
export function shapeHead(geo, R) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const p = new THREE.Vector3(); const outP = new THREE.Vector3(); const outN = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    mapPoint(p, R, outP, outN);
    pos.setXYZ(i, outP.x, outP.y, outP.z);
    nor.setXYZ(i, outN.x, outN.y, outN.z);
  }
  pos.needsUpdate = true; nor.needsUpdate = true;
  geo.computeBoundingSphere();
  return geo;
}

/** A point on the head surface at azimuth/elevation (radians, 0/0 = front centre) and radius. */
export function headPoint(az, el, radius, R) {
  const p0 = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(radius);
  const p = new THREE.Vector3(); const n = new THREE.Vector3();
  mapPoint(p0, R, p, n);
  return { p, n };
}

/**
 * The face patch for one person. Returns { mesh, uniforms, set(state) }.
 * look: { skin, eyes, hair:{color}, sex, age, extras } — the same card the body is built from.
 */
export function makeFace(R, look, { browWeight = 1 } = {}) {
  const geo = shapeHead(new THREE.SphereGeometry(R * 1.004, 48, 36, Math.PI / 2 - PHI / 2, PHI, THETA0, THETA), R);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const fem = look.sex === 'f';
  const age = look.age ?? 30;
  const extras = new Set(look.extras || []);
  const ex = expressionOf(look);
  const hairCol = new THREE.Color(look.hair?.color || '#2b1d14');
  const brow = hairCol.clone().multiplyScalar(age >= 60 ? 0.85 : 0.72);
  const u = {
    uSkin: { value: new THREE.Color(look.skin || '#e8bfa0') },
    uIris: { value: new THREE.Color(look.eyes || '#6a4429') },
    uLash: { value: new THREE.Color(age >= 60 ? '#3b302b' : '#1b1311') },
    uBrowC: { value: brow },
    uLip: { value: new THREE.Color(fem ? '#b24f57' : '#94554d') },
    uState: { value: new THREE.Vector4(0, 0, 0, 0) },
    uGaze: { value: new THREE.Vector2(0, 0) },
    uStyle: { value: new THREE.Vector4(fem ? 1 : 0, THREE.MathUtils.clamp((age - 50) / 25, 0, 1), (fem ? 1 : 0.6) * ex.blush, browWeight * (ex.brow > 0.3 ? 1.12 : 1)) },
    uBeard: { value: new THREE.Vector2(extras.has('beard') || extras.has('mustache') ? 1 : 0, extras.has('beard') ? 1 : 0) },
    uMood: { value: new THREE.Vector4(ex.smile, ex.brow, ex.lid, ex.open) },
    uMood2: { value: new THREE.Vector2(ex.cheek, ex.browY) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFaceUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFaceUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( faceColor(), opacity );')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, gEye);')
      .replace('vec3 totalEmissiveRadiance = emissive;', `vec3 totalEmissiveRadiance = emissive + gEm + diffuseColor.rgb * ${SKIN_GLOW.toFixed(3)};`);
  };
  mat.customProgramCacheKey = () => 'kotoba-face-v4';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'face';
  mesh.frustumCulled = false;
  return {
    mesh,
    uniforms: u,
    expression: ex,
    /** Per-frame state; the resting expression is added on top (talking opens the mouth from its rest shape). */
    set({ blink = 0, squint = 0, mouth = 0, brow = 0, gazeX = 0, gazeY = 0 }) {
      u.uState.value.set(blink, squint, mouth, brow);
      u.uGaze.value.set(gazeX, gazeY + ex.gazeY);
    },
  };
}
