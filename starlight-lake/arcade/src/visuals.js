import * as THREE from 'three';

// Shaders for the arcade's objects. The bubbles carry the contrast stimulus: a luminance
// grating in the bubble's own colour (lighter and darker bands of one hue), computed in linear
// light and dithered, like the Gabor patches in Starlight Lake. Everything decorative stays
// outside the striped disc.

// colours written straight to the framebuffer (these shaders do no colour-space conversion)
const raw = (hex) => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const ENC = /* glsl */`
vec3 encodeSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`;

// linear colours, scaled so the brightest stripe still fits the display at full contrast
export const BUBBLE_COLORS = [
  [0.52, 0.2, 0.32], [0.2, 0.36, 0.52], [0.2, 0.46, 0.32], [0.5, 0.42, 0.14], [0.36, 0.26, 0.52],
];

export class Bubble {
  constructor(color, golden = false) {
    this.uniforms = {
      uColor: { value: new THREE.Vector3(...color) }, uContrast: { value: 0 }, uCycles: { value: 4 }, uSigma: { value: 0.15 },
      uOrient: { value: 0 }, uPhase: { value: Math.random() * 6.28 }, uOpacity: { value: 1 }, uTime: { value: 0 }, uHover: { value: 0 },
      uGold: { value: golden ? 1 : 0 }, uSeed: { value: Math.random() * 10 }, uWobble: { value: 0 },
    };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: VS,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uContrast, uCycles, uSigma, uOrient, uPhase, uOpacity, uTime, uHover, uGold, uSeed, uWobble;
        varying vec2 vUv;
        ${ENC}
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p);
          float a = atan(p.y, p.x);
          float s = sin(uOrient), c = cos(uOrient);
          float x = c * p.x + s * p.y;
          float ph = 6.2831853 * uCycles * x + uPhase;
          // fade stripes only as they approach the pixel limit (~3 px per cycle)
          float aa = smoothstep(2.8, 1.6, fwidth(ph));
          float R = 0.37;
          // broad envelope so the stripes fill most of the bubble, tapered to the edge
          float env = exp(-(r * r) / (2.0 * uSigma * uSigma)) * smoothstep(R, R - 0.09, r);
          vec3 col = encodeSRGB(uColor * (1.0 + uContrast * aa * env * sin(ph)));
          col += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) / 255.0;
          float disc = smoothstep(R, R - 0.015, r);
          // soap-film rim and a highlight, outside the striped disc
          float rr = r - 0.025 * uWobble * sin(a * 3.0 + uTime * 4.0 + uSeed);
          float rim = exp(-pow((rr - 0.42) / 0.028, 2.0)) * smoothstep(R - 0.005, R + 0.01, r);
          vec3 irid = 0.55 + 0.45 * cos(vec3(0.0, 2.1, 4.2) + a * 1.5 + uTime * 0.9 + uSeed);
          vec3 rimCol = mix(irid, vec3(1.0, 0.82, 0.35), uGold) * rim * (1.0 + 0.8 * uHover + 0.5 * uGold);
          float hl = exp(-pow((rr - 0.43) / 0.016, 2.0)) * pow(max(dot(normalize(p + 1e-5), normalize(vec2(-0.6, 0.8))), 0.0), 6.0);
          gl_FragColor = vec4(col * disc + rimCol + vec3(1.0) * hl, disc) * uOpacity;
        }`,
    }));
    this.mesh.renderOrder = 20;
  }
  /** sf cycles/deg, contrast, ori deg, discDeg = visual size of the striped disc, dist metres. */
  set({ sf, contrast, ori, discDeg, dist }) {
    const quadDeg = discDeg / 0.74;
    this.uniforms.uCycles.value = sf * quadDeg;
    this.uniforms.uSigma.value = 0.37 / 1.9;
    this.uniforms.uContrast.value = contrast;
    this.uniforms.uOrient.value = THREE.MathUtils.degToRad(ori);
    const size = 2 * dist * Math.tan(THREE.MathUtils.degToRad(quadDeg) / 2);
    this.mesh.scale.set(size, size, 1);
    this.radiusM = size * 0.44;
  }
}

/** Ring Rush target: a white board with a coloured rim and a dark Landolt C. */
export class TargetDisc {
  constructor(color) {
    this.uniforms = { uGap: { value: 0 }, uColor: { value: raw(color) }, uOpacity: { value: 1 }, uFlash: { value: 0 }, uFlashColor: { value: raw(0x7dffb0) }, uTime: { value: 0 }, uGold: { value: 0 } };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: VS,
      fragmentShader: /* glsl */`
        uniform float uGap, uOpacity, uFlash, uTime, uGold; uniform vec3 uColor, uFlashColor; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p); float px = fwidth(r);
          float face = smoothstep(0.3 + px, 0.3 - px, r);
          float band = smoothstep(0.36 + px, 0.36 - px, r) - face;
          float outline = smoothstep(0.395 + px, 0.395 - px, r) - smoothstep(0.36 + px, 0.36 - px, r);   // dark edge: stands out on bright clouds
          float Ro = 0.2, g = Ro * 2.0 / 5.0, Ri = Ro - g;
          float ring = smoothstep(Ro + px, Ro - px, r) * smoothstep(Ri - px, Ri + px, r);
          float ang = uGap * 1.5707963; vec2 d = vec2(cos(ang), sin(ang));
          float gap = smoothstep(g * 0.5 + px, g * 0.5 - px, abs(dot(p, vec2(-d.y, d.x)))) * step(0.0, dot(p, d));
          vec3 rimC = mix(uColor, vec3(1.0, 0.8, 0.3), uGold);
          vec3 col = mix(vec3(1.0), vec3(0.07, 0.09, 0.2), ring * (1.0 - gap));
          col = mix(col, uFlashColor, uFlash * 0.5);
          float glow = exp(-pow(max(r - 0.36, 0.0) * 14.0, 2.0)) * (1.0 - face - band);
          float spin = uGold * pow(0.5 + 0.5 * sin(atan(p.y, p.x) * 6.0 - uTime * 6.0), 6.0) * band;
          vec3 outc = col * face + rimC * band * (1.0 + spin) + vec3(0.1, 0.13, 0.28) * outline;
          gl_FragColor = vec4(outc, face + band + outline) * uOpacity;
        }`,
    }));
    this.mesh.renderOrder = 15;
  }
}

/** Depth Order ball: one flat colour and a white rim, the same for every ball but the colour. */
export class FlatBall {
  constructor(color) {
    this.uniforms = { uColor: { value: raw(color) }, uOpacity: { value: 1 }, uFlash: { value: 0 }, uHover: { value: 0 } };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: VS,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity, uFlash, uHover; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p); float px = fwidth(r);
          float disc = smoothstep(0.42 + px, 0.42 - px, r);
          float rim = smoothstep(0.42 + px, 0.42 - px, r) - smoothstep(0.37 + px, 0.37 - px, r);
          vec3 c = mix(uColor, vec3(1.0), rim * (0.8 + 0.2 * uHover));
          c = mix(c, vec3(1.0), uFlash * 0.6);
          float halo = exp(-pow(max(r - 0.42, 0.0) * 18.0, 2.0)) * (1.0 - disc) * (0.15 + 0.5 * uHover + uFlash);
          gl_FragColor = vec4(c * disc + vec3(1.0) * halo, disc) * uOpacity;
        }`,
    }));
    this.mesh.renderOrder = 16;
  }
}

/** A five-pointed star with a soft glow. */
export class Star {
  constructor(color = 0xffd45e) {
    this.uniforms = { uColor: { value: raw(color) }, uOpacity: { value: 1 }, uSpin: { value: 0 } };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: VS,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity, uSpin; varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0; float r = length(p); float a = atan(p.y, p.x) + uSpin;
          float k = 0.62 + 0.38 * cos(5.0 * a);              // star radius by angle
          float edge = 0.62 * (0.55 + 0.45 * pow(0.5 + 0.5 * cos(5.0 * a), 2.0));
          float px = fwidth(r) * 1.5;
          float body = smoothstep(edge + px, edge - px, r);
          float line = smoothstep(edge * 1.18 + px, edge * 1.18 - px, r) - body;    // dark outline
          vec3 c = mix(uColor, vec3(1.0), smoothstep(edge * 0.6, 0.0, r) * 0.6);
          gl_FragColor = vec4(c * body + vec3(0.12, 0.15, 0.3) * line, body + line) * uOpacity;
        }`,
    }));
    this.mesh.renderOrder = 18;
  }
}

/** Side Catch's buddy: a round friend with one big eye. Blue = go, red with frowning brows = stop. */
export class Buddy {
  constructor() {
    this.uniforms = { uBlink: { value: 0 }, uAngry: { value: 0 }, uLook: { value: new THREE.Vector2() }, uOpacity: { value: 1 }, uTime: { value: 0 } };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, premultipliedAlpha: true,
      vertexShader: VS,
      fragmentShader: /* glsl */`
        uniform float uBlink, uAngry, uOpacity, uTime; uniform vec2 uLook; varying vec2 vUv;
        float circ(vec2 p, float r, float px){ return smoothstep(r + px, r - px, length(p)); }
        void main(){
          vec2 p = (vUv - 0.5) * 2.0; float px = fwidth(p.x) * 1.5;
          p.y += 0.03 * sin(uTime * 2.0);
          vec3 bodyC = mix(vec3(0.33, 0.62, 1.0), vec3(1.0, 0.32, 0.36), uAngry);
          float body = circ(p, 0.86, px);
          float shadeB = 0.85 + 0.15 * smoothstep(0.9, -0.6, p.y);
          vec3 c = bodyC * shadeB;
          vec2 e = p - vec2(0.0, 0.05);
          float white = circ(e, 0.5, px);
          vec2 ip = e - uLook * 0.14;
          float iris = circ(ip, 0.26, px), pupil = circ(ip, 0.12, px), shine = circ(ip - vec2(-0.08, 0.1), 0.06, px);
          vec3 eyeC = mix(vec3(1.0), mix(vec3(0.1, 0.3, 0.75), vec3(0.6, 0.1, 0.1), uAngry), iris);
          eyeC = mix(eyeC, vec3(0.03), pupil); eyeC = mix(eyeC, vec3(1.0), shine);
          float lid = step(0.5 * (1.0 - uBlink), abs(e.y)) * white;    // eyelids close from both sides
          c = mix(c, eyeC, white * (1.0 - lid));
          // frowning brows when red
          vec2 b1 = p - vec2(-0.28, 0.66), b2 = p - vec2(0.28, 0.66);
          float brow = uAngry * (smoothstep(0.06 + px, 0.06 - px, abs(b1.y + b1.x * 0.5)) * step(abs(b1.x), 0.22)
                              + smoothstep(0.06 + px, 0.06 - px, abs(b2.y - b2.x * 0.5)) * step(abs(b2.x), 0.22));
          c = mix(c, vec3(0.25, 0.05, 0.08), brow);
          float halo = exp(-pow(max(length(p) - 0.86, 0.0) * 6.0, 2.0)) * (1.0 - body) * 0.5;
          gl_FragColor = vec4(c * body + bodyC * halo, body) * uOpacity;
        }`,
    }));
    this.mesh.renderOrder = 19;
  }
}
