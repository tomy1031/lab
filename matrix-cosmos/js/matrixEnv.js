// js/matrixEnv.js — 3D Matrix Universe: physically coupled Digital Rain, obsidian phosphor grid floor, and void dome.
import * as THREE from 'three';

// Procedural 8x8 glyph atlas of Katakana + numerals + physics symbols
function makeGlyphAtlas() {
  const glyphs =
    'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ0123456789ℏcψγλΔ∞πΦΩ∑∫√∂';
  const size = 512;
  const cells = 8;
  const cell = size / cells;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.floor(cell * 0.58)}px "JetBrains Mono", "Fira Code", "Noto Sans Mono CJK JP", "Hiragino Kaku Gothic ProN", monospace`;

  for (let i = 0; i < 64; i++) {
    const ch = glyphs[i % glyphs.length];
    const gx = i % cells;
    const gy = Math.floor(i / cells);
    const cx = gx * cell + cell * 0.5;
    const cy = gy * cell + cell * 0.52;
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx * cell + 3, gy * cell + 3, cell - 6, cell - 6);
    ctx.clip();
    ctx.shadowColor = '#00ff66';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#d8ffe8';
    ctx.fillText(ch, cx, cy);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ch, cx, cy);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

const RAIN_VERT = /* glsl */ `
attribute vec3 aOffset;
attribute vec4 aParams; // x: speed, y: phase, z: height, w: seed

uniform float uSimTime;
uniform float uRealTime;
uniform float uContract;
uniform float uAberration;
uniform vec4 uGravity; // xyz: center, w: strength
uniform float uQuantumGhost;
uniform float uTransition;

varying vec2 vUv;
varying float vHead;
varying float vSeed;
varying float vZNorm;
varying float vDist;
varying float vAlpha;

void main() {
  vUv = uv;
  vSeed = aParams.w;

  // Base world anchor of this code column
  vec3 anchor = aOffset;

  // Relativistic length contraction along Z axis (direction of motion is -Z)
  anchor.z *= mix(1.0, uContract, 0.85);

  // Relativistic aberration (headlight effect: pull columns slightly inward toward -Z)
  if (uAberration > 0.001) {
    float r = length(anchor.xy);
    float pull = uAberration * 0.42;
    anchor.xy *= mix(1.0, 0.42, pull * smoothstep(2.0, -24.0, anchor.z));
  }

  // Gravitational bending toward black hole
  float gStr = uGravity.w;
  if (gStr > 0.001) {
    vec3 toCenter = uGravity.xyz - anchor;
    float d = max(1.4, length(toCenter));
    float bend = (gStr * 7.5) / (d * d);
    anchor += normalize(toCenter) * min(bend, d * 0.65);
    anchor.y -= min(bend * 1.4, 5.5);
  }

  // Quantum superposition subtle horizontal ghost jitter
  if (uQuantumGhost > 0.001) {
    float jitter = sin(uRealTime * 9.0 + aParams.w * 43.0) * 0.22 * uQuantumGhost;
    anchor.x += jitter;
  }

  // Cylindrical billboard facing Y-axis toward camera
  vec3 camPos = cameraPosition;
  vec3 toCam = vec3(camPos.x - anchor.x, 0.0, camPos.z - anchor.z);
  float lenXZ = max(0.0001, length(toCam));
  vec3 forward = toCam / lenXZ;
  vec3 right = vec3(forward.z, 0.0, -forward.x);

  float width = 0.26 + 0.14 * fract(aParams.w * 7.13);
  float height = aParams.z;
  vec3 worldPos = anchor + right * (position.x * width) + vec3(0.0, position.y * height, 0.0);

  // Rain drop head position driven by uSimTime (freezes when uSimTime stops!)
  float fallCycle = fract(aParams.y - uSimTime * aParams.x * (1.0 + uTransition * 2.5));
  vHead = fallCycle;
  vZNorm = clamp(-anchor.z / 20.0, -1.0, 1.0);
  vDist = length(anchor - camPos);
  vAlpha = smoothstep(32.0, 6.0, vDist) * smoothstep(1.2, 3.2, vDist);

  gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
}
`;

const RAIN_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uSimTime;
uniform float uDoppler;
uniform float uOpacity;
uniform float uTransition;
uniform vec3 uTint;

varying vec2 vUv;
varying float vHead;
varying float vSeed;
varying float vZNorm;
varying float vDist;
varying float vAlpha;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  float rows = 18.0;
  float rowIdx = floor(vUv.y * rows);
  vec2 cellUv = vec2(vUv.x, fract(vUv.y * rows));

  // Distance along trail behind the falling head (head moves downwards as vHead decreases)
  float dTrail = fract((vUv.y - vHead));
  // Brightest at dTrail near 0 (the head), fading upward into tail
  float trail = pow(max(0.0, 1.0 - dTrail * 1.45), 2.2);
  float isHead = smoothstep(0.08, 0.0, dTrail);

  if (trail < 0.02 && uTransition < 0.1) discard;

  // Glyph index mutates with uSimTime — so at lightspeed even glyphs freeze!
  float tick = floor(uSimTime * 4.5 + rowIdx * 0.7 + vSeed * 19.0);
  float rnd = hash(vec2(rowIdx + vSeed * 101.0, tick));
  float glyphIdx = floor(rnd * 64.0);
  float gx = mod(glyphIdx, 8.0);
  float gy = floor(glyphIdx / 8.0);

  vec2 innerUv = 0.08 + cellUv * 0.84;
  vec2 atlasUv = (vec2(gx, 7.0 - gy) + innerUv) / 8.0;
  vec4 tex = texture2D(uAtlas, atlasUv);
  float mask = smoothstep(0.18, 0.75, tex.a);
  if (mask < 0.05) discard;

  // Base Matrix phosphor green
  vec3 green = uTint;
  vec3 headCol = vec3(0.84, 1.0, 0.90);

  // Relativistic Doppler shift: forward (-Z => vZNorm > 0) blueshifts to cyan-white, behind redshifts to crimson
  vec3 blueShift = vec3(0.35, 0.95, 1.0);
  vec3 redShift = vec3(1.0, 0.14, 0.24);
  vec3 baseCol = green;
  if (uDoppler > 0.001) {
    float f = smoothstep(0.0, 0.85, vZNorm);
    float b = smoothstep(0.0, 0.85, -vZNorm);
    baseCol = mix(baseCol, blueShift, f * uDoppler * 0.92);
    baseCol = mix(baseCol, redShift, b * uDoppler * 0.92);
  }

  vec3 col = mix(baseCol, headCol, isHead * 0.88);
  // Extra beaming brightness ahead during lightspeed
  float beaming = 1.0 + max(0.0, vZNorm) * uDoppler * 0.85 - max(0.0, -vZNorm) * uDoppler * 0.45;
  float alpha = mask * (trail * 0.88 + isHead * 0.65 + uTransition * 0.4) * vAlpha * uOpacity * beaming;

  gl_FragColor = vec4(col * (1.15 + isHead * 0.8), clamp(alpha, 0.0, 1.0));
}
`;

const FLOOR_VERT = /* glsl */ `
uniform vec4 uGravity;
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  float depth = 0.0;
  if (uGravity.w > 0.001) {
    float r = length(wp.xz - uGravity.xz);
    depth = -(uGravity.w * 2.8) / (r * r + 0.55);
    wp.y += max(depth, -4.5);
  }
  vWorld = wp.xyz;
  vDepth = depth;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FLOOR_FRAG = /* glsl */ `
uniform float uSimTime;
uniform float uDoppler;
uniform float uContract;
uniform vec3 uTint;
varying vec3 vWorld;
varying float vDepth;

void main() {
  vec2 coord = vWorld.xz;
  coord.y /= max(0.12, uContract);
  float dist = length(vWorld.xz);
  float fade = smoothstep(30.0, 2.0, dist);

  // Sharp fine & major Matrix coordinate grid
  vec2 g1 = abs(fract(coord * 1.0 - 0.5) - 0.5) / fwidth(coord * 1.0);
  float line1 = 1.0 - min(min(g1.x, g1.y), 1.0);
  vec2 g2 = abs(fract(coord * 0.2 - 0.5) - 0.5) / fwidth(coord * 0.2);
  float line2 = 1.0 - min(min(g2.x, g2.y), 1.0);

  // Radial radar ring pulse
  float ring = smoothstep(0.12, 0.0, abs(fract(dist * 0.15 - uSimTime * 0.22) - 0.5));

  vec3 col = uTint;
  if (uDoppler > 0.01) {
    float fwd = smoothstep(0.0, -14.0, vWorld.z);
    float back = smoothstep(0.0, 14.0, vWorld.z);
    col = mix(col, vec3(0.3, 0.96, 1.0), fwd * uDoppler * 0.85);
    col = mix(col, vec3(1.0, 0.16, 0.26), back * uDoppler * 0.85);
  }
  // Gravity well glow near singularity
  float gravGlow = smoothstep(-0.2, -3.2, vDepth);
  col = mix(col, vec3(1.0, 0.22, 0.35), gravGlow * 0.75);

  float intensity = line1 * 0.26 + line2 * 0.55 + ring * 0.18 + gravGlow * 0.32;
  vec3 finalCol = mix(vec3(0.004, 0.015, 0.008), col * 1.35, clamp(intensity, 0.0, 1.0));
  gl_FragColor = vec4(finalCol, fade * (0.35 + intensity * 0.65));
}
`;

export class MatrixEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    scene.background = new THREE.Color('#010402');
    scene.fog = new THREE.FogExp2('#010603', 0.032);

    // Subtle Matrix lighting
    this.ambient = new THREE.AmbientLight('#44ff99', 0.45);
    this.keyLight = new THREE.DirectionalLight('#b8ffd8', 1.15);
    this.keyLight.position.set(4, 10, 5);
    this.rimLight = new THREE.PointLight('#00ff66', 2.2, 22);
    this.rimLight.position.set(-3, 3.5, -4);
    scene.add(this.ambient, this.keyLight, this.rimLight);

    this.atlas = makeGlyphAtlas();
    this.simTime = 0;
    this.realTime = 0;

    // Shared controllable physical uniforms
    this.state = {
      timeScale: 1.0,
      doppler: 0.0,
      contract: 1.0,
      aberration: 0.0,
      gravityCenter: new THREE.Vector3(0, 1.2, -2.8),
      gravityStrength: 0.0,
      quantumGhost: 0.0,
      rainOpacity: 0.9,
      transition: 0.0,
      tint: new THREE.Color('#00ff55'),
    };

    this._buildDigitalRain();
    this._buildFloor();
    this._buildDust();
  }

  _buildDigitalRain() {
    const COUNT = 860;
    const base = new THREE.PlaneGeometry(1, 1, 1, 1);
    const geom = new THREE.InstancedBufferGeometry();
    geom.index = base.index;
    geom.setAttribute('position', base.getAttribute('position'));
    geom.setAttribute('uv', base.getAttribute('uv'));

    const offsets = new Float32Array(COUNT * 3);
    const params = new Float32Array(COUNT * 4);

    // Deterministic pseudo-random distribution in 360° cylindrical shells
    let s = 1337;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };

    for (let i = 0; i < COUNT; i++) {
      const layer = rnd();
      const radius = 3.2 + Math.pow(layer, 1.35) * 23.0;
      const angle = rnd() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = 3.0 + (rnd() - 0.35) * 11.0;

      offsets[i * 3] = x;
      offsets[i * 3 + 1] = y;
      offsets[i * 3 + 2] = z;

      params[i * 4] = 0.22 + rnd() * 0.42; // speed
      params[i * 4 + 1] = rnd(); // initial phase
      params[i * 4 + 2] = 6.5 + rnd() * 7.5; // column height
      params[i * 4 + 3] = rnd(); // seed
    }

    geom.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geom.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
    geom.instanceCount = COUNT;

    this.rainUniforms = {
      uAtlas: { value: this.atlas },
      uSimTime: { value: 0 },
      uRealTime: { value: 0 },
      uDoppler: { value: 0 },
      uContract: { value: 1 },
      uAberration: { value: 0 },
      uGravity: { value: new THREE.Vector4(0, 1.2, -2.8, 0) },
      uQuantumGhost: { value: 0 },
      uOpacity: { value: 0.9 },
      uTransition: { value: 0 },
      uTint: { value: new THREE.Color('#00ff55') },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT,
      fragmentShader: RAIN_FRAG,
      uniforms: this.rainUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.rainMesh = new THREE.Mesh(geom, mat);
    this.rainMesh.frustumCulled = false;
    this.rainMesh.renderOrder = 1;
    this.group.add(this.rainMesh);
  }

  _buildFloor() {
    const geom = new THREE.PlaneGeometry(64, 64, 96, 96);
    geom.rotateX(-Math.PI / 2);
    this.floorUniforms = {
      uSimTime: { value: 0 },
      uDoppler: { value: 0 },
      uContract: { value: 1 },
      uGravity: { value: new THREE.Vector4(0, 0, -2.8, 0) },
      uTint: { value: new THREE.Color('#00ff55') },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: FLOOR_VERT,
      fragmentShader: FLOOR_FRAG,
      uniforms: this.floorUniforms,
      transparent: true,
      depthWrite: false,
    });
    this.floorMesh = new THREE.Mesh(geom, mat);
    this.floorMesh.position.y = 0;
    this.group.add(this.floorMesh);
  }

  _buildDust() {
    const N = 450;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 1.5 + Math.random() * 18;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.2 + Math.random() * 7.5;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: '#44ff88',
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.dust = new THREE.Points(g, m);
    this.group.add(this.dust);
  }

  triggerTransition() {
    this.state.transition = 1.0;
  }

  resetPhysics() {
    this.state.timeScale = 1.0;
    this.state.doppler = 0.0;
    this.state.contract = 1.0;
    this.state.aberration = 0.0;
    this.state.gravityStrength = 0.0;
    this.state.quantumGhost = 0.0;
    this.state.rainOpacity = 0.85;
    this.state.tint.set('#00ff55');
  }

  update(dt) {
    this.realTime += dt;
    this.simTime += dt * this.state.timeScale;
    this.state.transition = Math.max(0, this.state.transition - dt * 1.9);

    const ru = this.rainUniforms;
    ru.uSimTime.value = this.simTime;
    ru.uRealTime.value = this.realTime;
    ru.uDoppler.value = this.state.doppler;
    ru.uContract.value = this.state.contract;
    ru.uAberration.value = this.state.aberration;
    ru.uGravity.value.set(
      this.state.gravityCenter.x,
      this.state.gravityCenter.y,
      this.state.gravityCenter.z,
      this.state.gravityStrength
    );
    ru.uQuantumGhost.value = this.state.quantumGhost;
    ru.uOpacity.value = this.state.rainOpacity;
    ru.uTransition.value = this.state.transition;
    ru.uTint.value.copy(this.state.tint);

    const fu = this.floorUniforms;
    fu.uSimTime.value = this.simTime;
    fu.uDoppler.value = this.state.doppler;
    fu.uContract.value = this.state.contract;
    fu.uGravity.value.set(
      this.state.gravityCenter.x,
      0,
      this.state.gravityCenter.z,
      this.state.gravityStrength
    );
    fu.uTint.value.copy(this.state.tint);

    this.dust.rotation.y += dt * 0.015 * this.state.timeScale;
  }
}
