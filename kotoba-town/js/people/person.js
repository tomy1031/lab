// Procedural townspeople built from a `look` card (content/cast.js).
// The body is modelled from simple shapes on a bone hierarchy, then baked into GPU-skinned meshes
// (vertex colours, rigid skinning) so one person costs ~3 draw calls on Quest.
// Animation: breathing, idle sway, blinking, look-at, lip-sync and gestures (bows, nods, pointing …).
// Root at the feet, facing +z.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const env = (p, a = 0.25, r = 0.3) => (p < a ? smooth(0, a, p) : p > 1 - r ? 1 - smooth(1 - r, 1, p) : 1);

/** Lightweight "material" descriptor: colour + bucket (matte | gloss | trans). */
const C = (color, bucket = 'matte', opacity = 1) => ({ color: new THREE.Color(color), bucket, opacity });

const SKIRT_TYPES = new Set(['blouse', 'store_uniform', 'teacher', 'museum_uniform']);
const SHORT_SLEEVES = new Set(['polo', 'konbini']);
const JACKETS = new Set(['suit', 'station_uniform', 'museum_uniform', 'store_uniform', 'cardigan', 'hoodie', 'teacher', 'apron', 'konbini']);

const BUCKET_MATS = {};
function bucketMaterial(b) {
  if (!BUCKET_MATS[b]) {
    BUCKET_MATS[b] = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: b === 'gloss' ? 0.32 : b === 'hair' ? 0.5 : 0.78,
      metalness: 0,
      transparent: b === 'trans',
      opacity: b === 'trans' ? 0.22 : 1,
      depthWrite: b !== 'trans',
    });
  }
  return BUCKET_MATS[b];
}

export class Person {
  constructor(look, { name = '' } = {}) {
    this.look = look;
    this.name = name;
    this.root = new THREE.Group();
    this.root.name = `person:${name}`;
    this.gestures = [];
    this.mouth = 0;
    this.level = 0;
    this.lookTarget = null;
    this.blinkT = 1 + Math.random() * 3;
    this.blink = 0;
    this.t = Math.random() * 10;
    this.sitting = false;
    this.headYaw = 0; this.headPitch = 0; this.bodyYaw = 0;
    this.parts = []; // { geo, mat:C, bone, matrix } collected while building
    this._build();
    this._bake();
  }

  // -------------------------------------------------------------- building
  bone(parent, pos = [0, 0, 0], name = '') {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    (parent || this.root).add(b);
    return b;
  }

  /** Add a shape to a bone (local transform pos/rot/scale). */
  add(geo, mat, bone, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...scale));
    this.parts.push({ geo, mat, bone, m });
  }

  /** A shape on its own small bone (so it can be scaled/moved by animation). */
  animPart(geo, mat, parent, pos, rot = [0, 0, 0], scale = [1, 1, 1], name = '') {
    const b = this.bone(parent, pos, name);
    this.add(geo, mat, b, [0, 0, 0], rot, scale);
    return b;
  }

  _build() {
    const L = this.look;
    const H = L.height ?? 1.65;
    const f = L.sex === 'f';
    const b = L.build ?? 1;
    const age = L.age ?? 30;
    const old = age >= 60;
    const type = L.outfit?.type || 'shirt';
    const extras = new Set(L.extras || []);
    const skin = C(L.skin || '#e8bfa0');
    const top = C(L.outfit?.top || '#6d8fb3');
    const bottom = C(L.outfit?.bottom || '#3b3f4a');
    const accent = C(L.outfit?.accent || '#ffffff');
    const shirt = C('#f3f1ec');
    const hair = C(L.hair?.color || '#2b1d14', 'hair');
    const shoe = C(old ? '#4a4038' : '#2a2624', 'gloss');
    const skirt = f && (SKIRT_TYPES.has(type) || (type === 'cardigan' && old));
    const jacket = JACKETS.has(type);
    this.dims = { H };

    const hipY = H * 0.505;
    const torsoLen = H * 0.3;
    const sw = H * (f ? 0.106 : 0.122) * b; // half shoulder width
    const headR = H * 0.071;
    const upperArm = H * 0.17; const foreArm = H * 0.148;
    const thigh = hipY * 0.5; const shin = hipY * 0.44;
    const lathe = (pts, matl, bone, y0, len, zScale, segs = 22) => {
      const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y * len)), segs);
      this.add(geo, matl, bone, [0, y0, 0], [0, 0, 0], [1, 1, zScale]);
    };
    const taper = (r0, r1, len, matl, bone, y0 = 0, zs = 1) => {
      this.add(new THREE.CylinderGeometry(r0, r1, len, 12, 1, true), matl, bone, [0, y0 - len / 2, 0], [0, 0, 0], [1, 1, zs]);
    };
    const ball = (r, matl, bone, pos = [0, 0, 0], scale = [1, 1, 1], seg = 12) => this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), matl, bone, pos, [0, 0, 0], scale);

    this.rootBone = this.bone(this.root, [0, 0, 0], 'root');
    // ---- pelvis
    this.hips = this.bone(this.rootBone, [0, hipY, 0], 'hips');
    lathe([[0.001, -0.12], [0.78, -0.1], [0.92, -0.02], [0.9, 0.06], [0.82, 0.12]].map(([r, y]) => [r * sw, y / 0.3]), bottom, this.hips, 0, torsoLen * 0.3, 0.66 * b);
    // ---- legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const th = this.bone(this.hips, [s * sw * 0.46, -H * 0.02, 0], 'thigh');
      const legC = skirt ? C(old ? '#6b5f58' : '#3d3636') : bottom;
      taper(H * 0.05 * b, H * 0.036 * b, thigh, skirt ? legC : bottom, th, 0);
      ball(H * 0.05 * b, skirt ? legC : bottom, th, [0, 0, 0]);
      const kn = this.bone(th, [0, -thigh, 0], 'knee');
      ball(H * 0.036 * b, legC, kn);
      taper(H * 0.036 * b, H * 0.024, shin, legC, kn, 0);
      const ft = this.bone(kn, [0, -shin, 0], 'foot');
      this.add(new THREE.CapsuleGeometry(H * 0.026, H * 0.1, 4, 10), shoe, ft, [0, -H * 0.012, H * 0.03], [Math.PI / 2, 0, 0], [1.15, 1, 0.75]);
      this.legs.push({ th, kn, ft });
    }
    if (skirt) {
      const len = type === 'cardigan' ? hipY * 0.66 : hipY * 0.44;
      this.add(new THREE.CylinderGeometry(sw * 0.92, sw * 1.22, len, 22, 1, true), bottom, this.hips, [0, -len / 2 + H * 0.02, 0], [0, 0, 0], [1, 1, 0.8]);
      this.add(new THREE.CircleGeometry(sw * 1.22, 22), bottom, this.hips, [0, -len + H * 0.02, 0], [Math.PI / 2, 0, 0], [1, 0.8, 1]);
    }

    // ---- torso
    this.spine = this.bone(this.hips, [0, H * 0.035, 0], 'spine');
    this.chest = this.bone(this.spine, [0, 0, 0], 'chest');
    const bust = f ? 1.03 : 1;
    const prof = [[0.86, 0], [0.84, 0.16], [0.88, 0.4], [0.97 * bust, 0.62], [1.0, 0.8], [0.93, 0.9], [0.62, 0.97], [0.3, 1.0]];
    const hem = jacket ? [[0.92, -0.32], [0.9, -0.18], ...prof] : prof;
    const torsoC = top;
    lathe(hem.map(([r, y]) => [r * sw, y]), torsoC, this.chest, 0, torsoLen, 0.64 * b);
    // collar / chest details (thin shapes just in front of the torso surface)
    const zf = sw * 0.64 * b; // torso front surface depth at chest height
    const flat = (w, h, y, c, z = zf + 0.003, rotX = -0.12) => this.add(new THREE.PlaneGeometry(w, h), c, this.chest, [0, y, z], [rotX, 0, 0]);
    if (type === 'suit') {
      this.add(new THREE.ConeGeometry(sw * 0.34, torsoLen * 0.42, 3, 1, true), shirt, this.chest, [0, torsoLen * 0.77, zf - 0.006], [Math.PI, 0, 0], [1, 1, 0.22]);
      if (extras.has('tie')) this.add(new THREE.BoxGeometry(sw * 0.15, torsoLen * 0.42, 0.006), accent, this.chest, [0, torsoLen * 0.68, zf + 0.004], [-0.1, 0, 0]);
      for (let i = 0; i < 2; i++) ball(0.007, C('#222', 'gloss'), this.chest, [0, torsoLen * (0.28 + i * 0.14), zf - 0.004]);
    } else if (type === 'station_uniform' || type === 'museum_uniform' || type === 'store_uniform') {
      this.add(new THREE.ConeGeometry(sw * 0.3, torsoLen * 0.3, 3, 1, true), shirt, this.chest, [0, torsoLen * 0.83, zf - 0.006], [Math.PI, 0, 0], [1, 1, 0.22]);
      for (let i = 0; i < 4; i++) ball(0.008, C('#d4b45a', 'gloss'), this.chest, [0, torsoLen * (0.62 - i * 0.18), zf + 0.002]);
      this.add(new THREE.BoxGeometry(sw * 1.9, H * 0.012, 0.004), C('#00000033'.slice(0, 7)), this.chest, [0, torsoLen * 0.05, zf + 0.004]);
    } else if (type === 'cardigan' || type === 'teacher') {
      this.add(new THREE.ConeGeometry(sw * 0.36, torsoLen * 0.55, 3, 1, true), accent, this.chest, [0, torsoLen * 0.7, zf - 0.006], [Math.PI, 0, 0], [1, 1, 0.22]);
      for (let i = 0; i < 4; i++) ball(0.007, C('#efe6d0', 'gloss'), this.chest, [sw * 0.06, torsoLen * (0.5 - i * 0.13), zf + 0.001]);
    } else if (type === 'polo' || type === 'shirt' || type === 'blouse' || type === 'casual') {
      const col = type === 'polo' ? accent : type === 'casual' ? top : shirt;
      this.add(new THREE.TorusGeometry(H * 0.034, H * 0.008, 6, 16), col, this.chest, [0, torsoLen * 0.985, H * 0.004], [Math.PI / 2 - 0.25, 0, 0], [1.05, 1, 1]);
    } else if (type === 'hoodie') {
      this.add(new THREE.TorusGeometry(H * 0.055, H * 0.024, 8, 18), top, this.chest, [0, torsoLen * 0.96, -H * 0.025], [Math.PI / 2 - 0.35, 0, 0]);
      for (const s of [-1, 1]) this.add(new THREE.CylinderGeometry(0.004, 0.004, torsoLen * 0.28, 5), accent, this.chest, [s * 0.03, torsoLen * 0.76, zf + 0.004]);
      flat(sw * 1.1, torsoLen * 0.22, torsoLen * 0.2, C(shadeHex(L.outfit?.top || '#5b7f6a', 0.88)), zf + 0.006, 0.05);
    }
    if (type === 'apron' || extras.has('apron')) {
      const ap = C(L.outfit?.accent || '#6b4a32');
      this.add(new THREE.BoxGeometry(sw * 1.25, torsoLen * 0.62 + hipY * 0.62, 0.008), ap, this.chest, [0, torsoLen * 0.36 - hipY * 0.3, zf + 0.012], [0.05, 0, 0]);
    }
    if (type === 'konbini') {
      this.add(new THREE.BoxGeometry(sw * 1.5, torsoLen * 0.07, 0.006), C('#ffffff'), this.chest, [0, torsoLen * 0.3, zf + 0.008]);
      this.add(new THREE.BoxGeometry(sw * 1.5, torsoLen * 0.04, 0.006), C('#f2c94c'), this.chest, [0, torsoLen * 0.22, zf + 0.008]);
    }
    if (extras.has('badge')) this.add(new THREE.BoxGeometry(H * 0.04, H * 0.016, 0.004), C('#ffffff'), this.chest, [sw * 0.45, torsoLen * 0.72, zf + 0.006], [-0.1, 0.25, 0]);
    if (extras.has('lanyard')) {
      this.add(new THREE.TorusGeometry(H * 0.05, 0.004, 4, 18, Math.PI), C('#2c5aa0'), this.chest, [0, torsoLen * 0.86, zf * 0.7], [-0.3, 0, Math.PI], [1, 1.7, 1]);
      this.add(new THREE.BoxGeometry(H * 0.034, H * 0.046, 0.004), C('#ffffff'), this.chest, [0, torsoLen * 0.62, zf + 0.008], [-0.08, 0, 0]);
    }
    if (extras.has('scarf')) {
      this.add(new THREE.TorusGeometry(H * 0.032, H * 0.012, 6, 14), accent, this.chest, [0, torsoLen * 0.99, 0.004], [Math.PI / 2, 0, 0], [1.1, 0.9, 1]);
      this.add(new THREE.ConeGeometry(H * 0.028, H * 0.06, 3), accent, this.chest, [sw * 0.15, torsoLen * 0.9, zf * 0.85], [Math.PI, 0, 0.3], [1.2, 1, 0.4]);
    }

    // ---- arms
    this.arms = [];
    const short = SHORT_SLEEVES.has(type);
    for (const s of [-1, 1]) {
      const sh = this.bone(this.chest, [s * sw * 0.93, torsoLen * 0.87, -H * 0.004], 'shoulder');
      const ra = H * 0.031 * b;
      ball(ra * 1.12, top, sh, [s * -0.004, 0, 0], [1, 1, 1]);
      const ua = this.bone(sh, [0, 0, 0], 'upperArm');
      taper(ra * 1.05, ra * 0.82, upperArm, short ? top : top, ua, 0);
      if (short) taper(ra * 0.85, ra * 0.75, upperArm * 0.55, skin, ua, -upperArm * 0.45);
      const el = this.bone(ua, [0, -upperArm, 0], 'elbow');
      ball(ra * 0.8, short ? skin : top, el);
      taper(ra * 0.8, ra * 0.62, foreArm, short ? skin : top, el, 0);
      if (!short) taper(ra * 0.6, ra * 0.58, foreArm * 0.12, skin, el, -foreArm * 0.9);
      const hd = this.bone(el, [0, -foreArm, 0], 'hand');
      // palm + fingers block + thumb
      this.add(new THREE.CapsuleGeometry(H * 0.017, H * 0.03, 4, 8), skin, hd, [0, -H * 0.03, 0], [0, 0, 0], [1.35, 1, 0.62]);
      this.add(new THREE.CapsuleGeometry(H * 0.0075, H * 0.022, 3, 6), skin, hd, [-s * H * 0.021, -H * 0.022, H * 0.008], [0.35, 0, s * 0.55]);
      this.arms.push({ s, sh, ua, el, hd });
    }

    // ---- neck & head
    this.neck = this.bone(this.chest, [0, torsoLen * 0.97, -H * 0.004], 'neck');
    taper(H * 0.025, H * 0.028, H * 0.06, skin, this.neck, H * 0.06);
    this.head = this.bone(this.neck, [0, H * 0.045, 0], 'head');
    const hcy = headR * 1.02;
    this.headCentre = V(0, hcy, 0);
    ball(headR, skin, this.head, [0, hcy, 0], [0.9, 1.07, 0.98], 26);
    ball(headR * 0.72, skin, this.head, [0, hcy - headR * 0.42, headR * 0.16], [0.9, 0.74, 0.9], 16);
    for (const s of [-1, 1]) ball(headR * 0.2, skin, this.head, [s * headR * 0.89, hcy - headR * 0.04, -headR * 0.02], [0.45, 1, 0.75], 8);
    ball(headR * 0.12, C(L.skin || '#e8bfa0'), this.head, [0, hcy - headR * 0.18, headR * 0.98], [0.8, 1.15, 0.95], 10);
    for (const s of [-1, 1]) this.add(new THREE.CircleGeometry(headR * 0.17, 14), C('#f09a9a', 'trans'), this.head, [s * headR * 0.5, hcy - headR * 0.3, headR * 0.87], [0, s * 0.5, 0], [1, 0.7, 1]);
    // eyes
    this.eyes = [];
    const eyeY = hcy + headR * 0.04;
    for (const s of [-1, 1]) {
      const eg = this.bone(this.head, [s * headR * 0.35, eyeY, headR * 0.84], 'eye');
      this.add(new THREE.SphereGeometry(headR * 0.15, 14, 10), C('#fbfaf6', 'gloss'), eg, [0, 0, 0], [0, 0, 0], [1, 0.82, 0.45]);
      const iris = this.bone(eg, [0, -headR * 0.005, headR * 0.068], 'iris');
      this.add(new THREE.CircleGeometry(headR * 0.105, 18), C(L.eyes || '#3d2817', 'gloss'), iris);
      this.add(new THREE.CircleGeometry(headR * 0.05, 14), C('#0d0a08', 'gloss'), iris, [0, 0, 0.0008]);
      this.add(new THREE.CircleGeometry(headR * 0.024, 8), C('#ffffff', 'gloss'), iris, [headR * 0.03, headR * 0.032, 0.0016]);
      const lid = this.animPart(new THREE.SphereGeometry(headR * 0.168, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), skin, eg, [0, -headR * 0.01, 0.003], [0, 0, 0], [1.02, 0.42, 0.56], 'lid');
      this.add(new THREE.TorusGeometry(headR * 0.15, headR * 0.022, 4, 16, Math.PI), C(old ? '#3a3330' : '#1a1210'), eg, [0, headR * 0.0, headR * 0.06], [0.25, 0, 0], [1, 0.5, 1]);
      this.eyes.push({ eg, iris, lid });
    }
    this.brows = [];
    for (const s of [-1, 1]) {
      const br = this.animPart(new THREE.BoxGeometry(headR * 0.36, headR * (f ? 0.045 : 0.07), headR * 0.05), hair, this.head, [s * headR * 0.35, eyeY + headR * 0.27, headR * 0.87], [0, -s * 0.2, s * -0.08], [1, 1, 1], 'brow');
      br.userData.y0 = br.position.y;
      this.brows.push(br);
    }
    // mouth
    const lip = C(f ? '#cf8a86' : '#bf8f7e');
    this.mouthB = this.bone(this.head, [0, hcy - headR * 0.47, headR * 0.86], 'mouth');
    this.mouthInner = this.animPart(new THREE.SphereGeometry(headR * 0.16, 14, 8), C('#5a2028'), this.mouthB, [0, 0, 0], [0, 0, 0], [1, 0.12, 0.35], 'mouthInner');
    this.lipU = this.animPart(new THREE.CapsuleGeometry(headR * 0.022, headR * 0.2, 3, 8), lip, this.mouthB, [0, headR * 0.026, headR * 0.035], [0, 0, Math.PI / 2], [1, 1, 0.55], 'lipU');
    this.lipL = this.animPart(new THREE.CapsuleGeometry(headR * 0.03, headR * 0.16, 3, 8), lip, this.mouthB, [0, -headR * 0.034, headR * 0.03], [0, 0, Math.PI / 2], [1, 1, 0.55], 'lipL');
    this.lipU.userData.y0 = this.lipU.position.y;
    this.lipL.userData.y0 = this.lipL.position.y;

    this._hair(hair, headR, hcy, L.hair?.style || 'short');
    this._extras(extras, headR, hcy, hair, L);
    this.restArm = f ? 0.07 : 0.09;
    this.H = H;
  }

  _hair(m, R, hcy, style) {
    const h = this.head;
    const add = (geo, pos, rot, scale) => this.add(geo, m, h, pos, rot, scale);
    const cap = (scale = 1.08, theta = Math.PI * 0.52, y = 0.06) =>
      add(new THREE.SphereGeometry(R * scale, 24, 14, 0, Math.PI * 2, 0, theta), [0, hcy + R * y, -R * 0.03], [-0.28, 0, 0], [0.95, 1.0, 1.02]);
    const back = (len = 1, width = 1.04, y0 = 0.05) =>
      add(new THREE.SphereGeometry(R * width, 20, 12, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.25, Math.PI * 0.5), [0, hcy - R * y0, -R * 0.02], [0, Math.PI, 0], [0.98, len, 1.02]);
    const fringe = (w = 1, tilt = 0, drop = 0.12) =>
      add(new THREE.SphereGeometry(R * 1.03, 20, 8, -Math.PI * 0.3 * w, Math.PI * 0.6 * w, 0, Math.PI * 0.27), [0, hcy + R * drop, R * 0.04], [-0.1, tilt, 0], [0.97, 1.0, 1.0]);
    const sides = (len = 1.05) =>
      add(new THREE.SphereGeometry(R * 1.12, 22, 12, Math.PI * 0.1, Math.PI * 0.8, Math.PI * 0.22, Math.PI * 0.55), [0, hcy - R * 0.1, -R * 0.02], [0, Math.PI, 0], [1.0, len, 1.02]);
    switch (style) {
      case 'bald_top':
        add(new THREE.TorusGeometry(R * 0.86, R * 0.2, 8, 24, Math.PI * 1.1), [0, hcy - R * 0.02, -R * 0.04], [Math.PI / 2 - 0.12, 0, Math.PI * 0.95], [0.98, 1.05, 1.6]);
        break;
      case 'crew':
        cap(1.04, Math.PI * 0.5, 0.03);
        break;
      case 'gray_short': case 'short':
        cap(1.07, Math.PI * 0.55, 0.05); back(); fringe(0.9);
        break;
      case 'side_part':
        cap(1.07, Math.PI * 0.55, 0.06); back(); fringe(0.8, 0.25);
        break;
      case 'wavy':
        cap(1.09, Math.PI * 0.58, 0.06); back(1.15, 1.06, 0.1); fringe(1);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 1.6 - Math.PI * 0.8;
          add(new THREE.SphereGeometry(R * 0.26, 10, 8), [Math.sin(a) * R * 0.95, hcy + R * 0.3 + Math.cos(i) * R * 0.08, -Math.cos(a) * R * 0.75], [0, 0, 0], [1, 1, 1]);
        }
        break;
      case 'bob':
        cap(1.1, Math.PI * 0.6, 0.06); fringe(1.05); sides(1.05);
        break;
      case 'long':
        cap(1.09, Math.PI * 0.52, 0.06); fringe(0.95, 0.12, 0.2); sides(1.05);
        add(new THREE.CapsuleGeometry(R * 0.55, R * 1.6, 4, 12), [0, hcy - R * 1.35, -R * 0.55], [0.1, 0, 0], [1.45, 1, 0.45]);
        break;
      case 'ponytail': {
        cap(1.07, Math.PI * 0.56, 0.06); back(); fringe(1, 0.1);
        const tail = this.bone(h, [0, hcy + R * 0.25, -R * 1.0], 'tail');
        this.add(new THREE.SphereGeometry(R * 0.14, 8, 6), C('#8a3a3a'), tail);
        this.add(new THREE.CapsuleGeometry(R * 0.2, R * 1.1, 4, 8), m, tail, [0, -R * 0.65, -R * 0.12], [0.2, 0, 0]);
        this.tail = tail;
        break;
      }
      case 'bun':
        cap(1.07, Math.PI * 0.56, 0.06); back(); fringe(0.85, -0.1);
        add(new THREE.SphereGeometry(R * 0.38, 14, 12), [0, hcy + R * 0.5, -R * 0.82], [0, 0, 0], [1, 1, 1]);
        break;
      default:
        cap(); back();
    }
  }

  _extras(ex, R, hcy, hairC, L) {
    const h = this.head;
    if (ex.has('glasses')) {
      const gm = C('#2a2a2e', 'gloss');
      for (const s of [-1, 1]) this.add(new THREE.TorusGeometry(R * 0.2, R * 0.022, 6, 20), gm, h, [s * R * 0.36, hcy + R * 0.04, R * 0.98], [0, 0, 0], [1, 0.82, 1]);
      this.add(new THREE.BoxGeometry(R * 0.2, R * 0.03, R * 0.03), gm, h, [0, hcy + R * 0.08, R * 1.0]);
      for (const s of [-1, 1]) this.add(new THREE.BoxGeometry(R * 0.03, R * 0.03, R * 0.9), gm, h, [s * R * 0.56, hcy + R * 0.06, R * 0.55]);
      for (const s of [-1, 1]) this.add(new THREE.CircleGeometry(R * 0.19, 16), C('#cfe6ff', 'trans'), h, [s * R * 0.36, hcy + R * 0.04, R * 0.99], [0, 0, 0], [1, 0.82, 1]);
    }
    if (ex.has('cap')) {
      const cm = C(L.outfit?.top || '#1f2a44');
      this.add(new THREE.CylinderGeometry(R * 1.02, R * 1.08, R * 0.55, 22), cm, h, [0, hcy + R * 0.62, -R * 0.02], [-0.08, 0, 0]);
      this.add(new THREE.CylinderGeometry(R * 1.12, R * 1.12, R * 0.08, 22, 1, false, -Math.PI / 2, Math.PI), C('#151515', 'gloss'), h, [0, hcy + R * 0.38, R * 0.2], [-0.12, 0, 0], [1, 1, 1.3]);
      this.add(new THREE.CylinderGeometry(R * 1.04, R * 1.04, R * 0.08, 22), C(L.outfit?.accent || '#c9a54a', 'gloss'), h, [0, hcy + R * 0.45, -R * 0.02], [-0.08, 0, 0]);
    }
    if (ex.has('beard')) this.add(new THREE.SphereGeometry(R * 0.68, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), hairC, h, [0, hcy - R * 0.35, R * 0.22], [0.15, 0, 0]);
    if (ex.has('beard') || ex.has('mustache')) this.add(new THREE.CapsuleGeometry(R * 0.06, R * 0.38, 3, 8), hairC, h, [0, hcy - R * 0.36, R * 0.93], [0, 0, Math.PI / 2], [1, 1, 0.7]);
    if (ex.has('earrings')) for (const s of [-1, 1]) this.add(new THREE.SphereGeometry(R * 0.05, 8, 6), C('#e8c45a', 'gloss'), h, [s * R * 0.92, hcy - R * 0.3, 0]);
  }

  /** Merge every shape into skinned meshes (one per material bucket). */
  _bake() {
    this.root.updateMatrixWorld(true);
    const bones = [];
    this.rootBone.traverse((o) => { if (o.isBone) { o.userData.index = bones.length; bones.push(o); } });
    const buckets = new Map();
    for (const p of this.parts) {
      const key = p.mat.bucket;
      if (!buckets.has(key)) buckets.set(key, []);
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(p.bone.matrixWorld, p.m));
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([p.mat.color.r, p.mat.color.g, p.mat.color.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const si = new Uint16Array(n * 4); const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = p.bone.userData.index; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      buckets.get(key).push(g);
      p.geo.dispose?.();
    }
    const skeleton = new THREE.Skeleton(bones);
    this.meshes = [];
    for (const [key, list] of buckets) {
      const geo = mergeNonIndexed(list);
      const mesh = new THREE.SkinnedMesh(geo, bucketMaterial(key));
      mesh.castShadow = key !== 'trans';
      mesh.frustumCulled = false;
      mesh.bind(skeleton, new THREE.Matrix4());
      this.root.add(mesh);
      this.meshes.push(mesh);
    }
    this.parts = null;
    // a phone for calls/gestures (kept separate so it can be shown/hidden)
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.01), new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.3 }));
    phone.position.set(0, -this.H * 0.045, 0.02);
    phone.visible = false;
    this.arms[1].hd.add(phone);
    this.phone = phone;
  }

  // ------------------------------------------------------------------ control
  gesture(name, opts = {}) {
    const dur = { bow_light: 1.3, bow: 2.0, nod: 0.9, wave: 1.8, point: 2.4, offer: 2.4, receive: 2.0, think: 2.4, laugh: 1.6, surprised: 1.4, shake_head: 1.2, beckon: 1.8, phone: 0 }[name];
    if (dur === undefined) return;
    if (name === 'phone') { this.phoneMode = true; this.phone.visible = true; return; }
    this.gestures = this.gestures.filter((g) => g.name !== name);
    this.gestures.push({ name, t: 0, dur, target: opts.target?.clone?.() });
  }

  clearGestures() { this.gestures = []; this.phoneMode = false; if (this.phone) this.phone.visible = false; }
  setSitting(on, seatH = 0.45) { this.sitting = on; this.seatH = seatH; }
  setLookTarget(v) { this.lookTarget = v; }

  update(dt, level = 0) {
    this.t += dt;
    const t = this.t;
    const H = this.H;
    const R = (o, x = 0, y = 0, z = 0) => o.rotation.set(x, y, z);
    R(this.hips); R(this.spine); R(this.chest); R(this.neck); R(this.head);
    this.hips.position.y = H * 0.505;
    this.chest.position.y = 0;
    for (const l of this.legs) { R(l.th); R(l.kn); R(l.ft); }
    for (const a of this.arms) { R(a.sh); a.ua.quaternion.identity(); a.ua.rotation.set(0.06, 0, a.s * this.restArm); R(a.el, -0.14); R(a.hd); }

    const breath = Math.sin(t * 1.6);
    this.chest.scale.set(1 + breath * 0.006, 1 + breath * 0.008, 1 + breath * 0.01);
    this.spine.rotation.z = Math.sin(t * 0.37) * 0.012;
    this.hips.rotation.z = Math.sin(t * 0.37 + 1) * 0.01;
    this.hips.position.x = Math.sin(t * 0.37) * 0.005;
    for (const a of this.arms) a.ua.rotation.z += a.s * breath * 0.008;

    if (this.sitting) {
      this.hips.position.y = this.seatH + H * 0.03;
      for (const l of this.legs) { l.th.rotation.x = -Math.PI / 2 + 0.06; l.kn.rotation.x = Math.PI / 2 - 0.06; }
      for (const a of this.arms) { a.ua.rotation.x = -0.4; a.el.rotation.x = -0.85; a.ua.rotation.z = a.s * 0.12; }
    }

    let tgtYaw = 0; let tgtPitch = 0;
    if (this.lookTarget) {
      const headW = new THREE.Vector3();
      this.head.getWorldPosition(headW);
      const d = this.lookTarget.clone().sub(headW);
      const inv = new THREE.Quaternion();
      this.root.getWorldQuaternion(inv).invert();
      d.applyQuaternion(inv);
      tgtYaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.3, 1.3);
      tgtPitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.45, 0.4);
    }
    const k = 1 - Math.exp(-dt * 5);
    this.headYaw += (tgtYaw - this.headYaw) * k;
    this.headPitch += (tgtPitch - this.headPitch) * k;
    const bodyShare = Math.max(0, Math.abs(this.headYaw) - 0.5) * Math.sign(this.headYaw);
    this.bodyYaw += (bodyShare * 0.6 - this.bodyYaw) * k * 0.5;
    this.spine.rotation.y += this.bodyYaw * 0.6;
    this.neck.rotation.y += (this.headYaw - this.bodyYaw * 0.6) * 0.45;
    this.head.rotation.y += (this.headYaw - this.bodyYaw * 0.6) * 0.55;
    this.head.rotation.x += this.headPitch * 0.75;
    this.neck.rotation.x += this.headPitch * 0.25;
    for (const e of this.eyes) e.iris.position.x = THREE.MathUtils.clamp((tgtYaw - this.headYaw) * 0.02, -0.005, 0.005);

    this.level += (level - this.level) * (level > this.level ? 0.7 : 0.3);
    const talking = this.level > 0.05;
    const open = talking ? Math.min(1, this.level * 1.3) * (0.65 + 0.35 * Math.abs(Math.sin(t * 17))) : 0;
    this.mouth += (open - this.mouth) * 0.5;
    this.mouthInner.scale.set(1 - this.mouth * 0.15, 1 + this.mouth * 7, 1);
    const R0 = H * 0.066;
    this.lipL.position.y = this.lipL.userData.y0 - R0 * this.mouth * 0.13;
    this.lipU.position.y = this.lipU.userData.y0 + R0 * this.mouth * 0.03;
    const browUp = talking ? this.level * 0.003 : 0;
    if (talking) {
      this.head.rotation.x += Math.sin(t * 3.1) * 0.025 * this.level;
      this.head.rotation.z += Math.sin(t * 1.7) * 0.02;
      const right = this.arms[1];
      right.ua.rotation.x -= 0.18 + Math.sin(t * 2.3) * 0.08;
      right.el.rotation.x -= 0.5 + Math.sin(t * 2.3 + 0.6) * 0.15;
    }
    let browExtra = 0;

    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blink = 0.14; this.blinkT = 2 + Math.random() * 4; }
    const closed = this.blink > 0 ? 1 : 0;
    this.blink = Math.max(0, this.blink - dt);
    let squint = 0;

    if (this.tail) this.tail.rotation.x = Math.sin(t * 2) * 0.05 - this.head.rotation.x * 0.5;
    if (this.phoneMode) this._phonePose();
    for (const g of this.gestures) {
      g.t += dt;
      const r = this._apply(g);
      if (r?.squint) squint = Math.max(squint, r.squint);
      if (r?.brow) browExtra = Math.max(browExtra, r.brow);
    }
    this.gestures = this.gestures.filter((g) => g.t < g.dur);
    for (const e of this.eyes) e.lid.scale.y = 1 + closed * 3 + squint * 1.4;
    for (const b of this.brows) b.position.y = b.userData.y0 + browUp + browExtra;
  }

  _phonePose() {
    const a = this.arms[1];
    a.ua.rotation.set(-0.35, 0, a.s * 0.55);
    a.el.rotation.set(-2.35, 0, 0);
    a.hd.rotation.set(0, 0.4, 0);
  }

  _apply(g) {
    const p = g.t / g.dur;
    const e = env(p);
    const [Lf, Rt] = this.arms;
    switch (g.name) {
      case 'bow_light':
      case 'bow': {
        const deg = g.name === 'bow' ? 0.55 : 0.28;
        const ee = env(p, 0.3, 0.38);
        this.spine.rotation.x += deg * ee;
        this.head.rotation.x += 0.15 * ee;
        for (const a of this.arms) { a.ua.rotation.x += 0.05 * ee; a.ua.rotation.z -= a.s * 0.05 * ee; }
        return null;
      }
      case 'nod': this.head.rotation.x += Math.sin(p * Math.PI * 4) * 0.18 * env(p, 0.1, 0.2); return null;
      case 'shake_head': this.head.rotation.y += Math.sin(p * Math.PI * 6) * 0.3 * env(p, 0.1, 0.2); return null;
      case 'wave':
        Rt.ua.rotation.z += -2.3 * e; Rt.ua.rotation.x += -0.2 * e;
        Rt.el.rotation.z += (0.4 + Math.sin(p * Math.PI * 8) * 0.35) * e;
        Rt.el.rotation.x += -0.3 * e;
        return null;
      case 'beckon':
        Rt.ua.rotation.x += -0.9 * e; Rt.ua.rotation.z += -0.2 * e;
        Rt.el.rotation.x += (-0.6 - Math.max(0, Math.sin(p * Math.PI * 6)) * 0.9) * e;
        Rt.hd.rotation.y += 1.4 * e;
        return null;
      case 'offer':
      case 'receive':
        for (const a of this.arms) { a.ua.rotation.x += -0.75 * e; a.ua.rotation.z += -a.s * 0.15 * e; a.el.rotation.x += -0.55 * e; a.hd.rotation.y += -a.s * 0.6 * e; }
        this.spine.rotation.x += 0.18 * e;
        return null;
      case 'think':
        Rt.ua.rotation.x += -0.55 * e; Rt.ua.rotation.z += 0.25 * e;
        Rt.el.rotation.x += -2.1 * e;
        this.head.rotation.z += 0.14 * e; this.head.rotation.x += -0.06 * e;
        Lf.ua.rotation.x += -0.3 * e; Lf.el.rotation.x += -1.1 * e; Lf.ua.rotation.z += 0.35 * e;
        return null;
      case 'laugh':
        this.head.rotation.x += -0.12 * e + Math.sin(p * Math.PI * 10) * 0.04 * e;
        this.chest.position.y = Math.abs(Math.sin(p * Math.PI * 10)) * 0.008 * e;
        Rt.ua.rotation.x += -0.4 * e; Rt.el.rotation.x += -1.6 * e;
        return { squint: e };
      case 'surprised':
        this.head.rotation.x += -0.12 * e;
        for (const a of this.arms) { a.ua.rotation.x += -0.5 * e; a.el.rotation.x += -1.0 * e; }
        return { brow: 0.012 * e };
      case 'point': {
        const ee = env(p, 0.2, 0.25);
        const tgt = g.target || this.root.localToWorld(V(0.6, 1.2, 1.5));
        const sh = new THREE.Vector3();
        Rt.sh.getWorldPosition(sh);
        const dirW = tgt.clone().sub(sh).normalize();
        const q = new THREE.Quaternion();
        Rt.sh.getWorldQuaternion(q);
        const dirL = dirW.applyQuaternion(q.invert());
        const aim = new THREE.Quaternion().setFromUnitVectors(V(0, -1, 0), dirL);
        Rt.ua.quaternion.slerp(aim, ee);
        Rt.el.rotation.x *= 1 - ee;
        // look where you point, briefly
        return null;
      }
      default: return null;
    }
  }

  get voiceAnchor() { return this.head; }

  topWorld(target = new THREE.Vector3()) {
    this.head.getWorldPosition(target);
    target.y += this.H * 0.16;
    return target;
  }

  dispose() { for (const m of this.meshes || []) m.geometry.dispose(); }
}

function shadeHex(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return `#${c.getHexString()}`; }

function mergeNonIndexed(list) {
  const out = new THREE.BufferGeometry();
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  for (const [name, size, Arr] of [['position', 3, Float32Array], ['normal', 3, Float32Array], ['color', 3, Float32Array], ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array]]) {
    const arr = new Arr(n * size);
    let off = 0;
    for (const g of list) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
