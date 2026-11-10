// js/core/config.js — tuning constants shared by core / player / items (OPUS-A).
// Numbers come from docs/DESIGN.md (§2 exercise, §4 items, §5.1 hit rules, §7.6 budget, §10.16 Quest).

export const DEFAULT_STAND_HEIGHT = 1.6;      // m, until the step detector has learnt the real one
export const SPAWN_FALLBACK = { x: 0, z: 540, yaw: 0 };

// §2.2 cadence (spm) → speed (m/s), piecewise linear
export const CADENCE_CURVE = [
  [0, 0], [49.999, 0], [50, 1.2], [100, 2.0], [130, 3.2], [160, 4.6], [185, 6.0], [200, 6.5],
];
export const GAIT_ZONES = { walk: 50, jog: 110, sprint: 160 };

// §2.1 step detection
export const STEP = {
  neckDown: 0.10, neckBack: 0.08,
  tauLP: 0.04, tauBase: 0.6, tauStand: 3.0, tauVy: 0.03,
  aMin: { high: 0.006, mid: 0.009, low: 0.013 },
  minDescent: 0.06,          // m/s, peak descending speed before the valley
  minInterval: 0.22,         // s (270 spm)
  maxAmp: 0.12,              // m, larger = a squat
  nodPitchRate: 60 * Math.PI / 180,
  duckDrop: 0.15,            // m below standing → duck (no steps)
  duckVy: 0.5,               // m/s fast drop (only counted together with duckVyDrop below standing)
  duckVyDrop: 0.06,
  duckRecover: 0.25, duckHold: 0.5,
  lateralSpeed: 0.8, lateralHold: 0.3,
  swingHandSpeed: 3.0, swingAMinMul: 1.5,
  confirmWindow: 1.25,       // second step must come within this (§2.1 says 1.0; 1.25 lets 50 spm start)
  tauAccel: 0.25, tauStop: 0.18, tauDir: 0.15,
  armAssistMul: 0.7, armVigor: 0.05, armAmp: 0.12,
};

// §4.3 holsters: body frame (x right, y up, z back), H = standing head height
export const HOLSTERS = {
  backR: { x: 0.18, y: (H) => H - 0.08, z: 0.20, r: 0.16, cats: ['weapon', 'shield', 'bow'] },
  backL: { x: -0.18, y: (H) => H - 0.08, z: 0.20, r: 0.16, cats: ['weapon', 'shield', 'bow'] },
  hipR: { x: 0.24, y: (H) => H * 0.56, z: 0.02, r: 0.14, cats: ['tool', 'weapon'] },
  hipL: { x: -0.24, y: (H) => H * 0.56, z: 0.02, r: 0.14, cats: ['tool', 'weapon'] },
  chest: { x: 0, y: (H) => H * 0.74, z: -0.16, r: 0.13, cats: ['food'] },
  belt: { x: 0, y: (H) => H * 0.56, z: -0.16, r: 0.13, cats: ['throwable'] },
};
export const SLOT_IDS = ['backR', 'backL', 'hipR', 'hipL', 'chest', 'belt'];
// game-less fallback: what each holster hands out forever when there is no inventory (§10.9)
export const SLOT_FALLBACK = { backR: 'sword', backL: 'shield', hipR: 'windfan', hipL: 'torch', chest: 'apple', belt: 'bomb' };

// §5.1 haptics
export const HAPTIC = {
  weak: [0.4, 40], strong: [0.8, 70], armor: [1.0, 25], whiff: [0.1, 15], zone: [0.2, 20], grab: [0.35, 25],
};

// §10.9 projectiles
export const PROJECTILE_MAX = 16;
export const STUCK_ARROWS_MAX = 10;
export const THROW_WINDOW = 0.08;       // s of hand history averaged for the release velocity
export const THROW_MUL = 1.3;

// §7.6 budget for OPUS-A (draw calls / triangles)
export const BUDGET = { drawCalls: 16, triangles: 8000 };

// §10.16 rendering per device
export const DEVICE_RENDER = {
  quest2: { scale: { low: 0.85, mid: 1.0, high: 1.0 }, foveation: 0.8, fps: { low: 72, mid: 72, high: 72 }, auto: 'mid' },
  quest3: { scale: { low: 0.85, mid: 1.0, high: 1.2 }, foveation: 0.5, fps: { low: 72, mid: 72, high: 90 }, auto: 'high' },
  pc: { scale: { low: 0.85, mid: 1.0, high: 1.2 }, foveation: 0, fps: { low: 60, mid: 60, high: 60 }, auto: 'high' },
};
