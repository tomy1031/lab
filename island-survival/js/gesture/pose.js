// gesture/pose.js — hand shape helpers for MediaPipe landmarks (from dream-drift's gesture-math.js). Pure functions,
// so tests can feed synthetic hands. Landmarks are in camera-image space (x right, y down, 0…1),
// NOT mirrored: the player's right hand appears on the image's left side.
//

export const LM = { WRIST: 0, THUMB_TIP: 4, THUMB_IP: 3, INDEX_MCP: 5, INDEX_PIP: 6, INDEX_TIP: 8, MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_TIP: 12, RING_PIP: 14, RING_TIP: 16, PINKY_MCP: 17, PINKY_PIP: 18, PINKY_TIP: 20 };

const dist = (a, b, ax = 1) => Math.hypot((a.x - b.x) * ax, a.y - b.y);

// which fingers are stretched out. aspect = image width / height (to measure in square units)
export function fingers(lm, aspect = 4 / 3) {
  const w = lm[LM.WRIST];
  const ext = (tip, pip) => dist(lm[tip], w, aspect) > dist(lm[pip], w, aspect) * 1.12;
  const palm = dist(lm[LM.INDEX_MCP], lm[LM.PINKY_MCP], aspect);
  return {
    thumb: dist(lm[LM.THUMB_TIP], lm[LM.PINKY_MCP], aspect) > Math.max(palm * 1.25, dist(lm[LM.THUMB_IP], lm[LM.PINKY_MCP], aspect) * 1.05),
    index: ext(LM.INDEX_TIP, LM.INDEX_PIP),
    middle: ext(LM.MIDDLE_TIP, LM.MIDDLE_PIP),
    ring: ext(LM.RING_TIP, LM.RING_PIP),
    pinky: ext(LM.PINKY_TIP, LM.PINKY_PIP),
  };
}

export function classify(lm, aspect = 4 / 3) {
  const f = fingers(lm, aspect);
  const n = (f.index ? 1 : 0) + (f.middle ? 1 : 0) + (f.ring ? 1 : 0) + (f.pinky ? 1 : 0);
  if (f.index && f.middle && !f.ring && !f.pinky) return 'peace';
  if (n >= 4) return 'open';
  if (n === 0) return 'fist';
  if (f.index && n === 1) return f.thumb ? 'gun' : 'point';
  if (f.thumb && f.pinky && !f.index && !f.middle) return 'call';
  return 'other';
}

export function palmCenter(lm) {
  const ids = [0, 5, 9, 13, 17];
  let x = 0, y = 0;
  for (const i of ids) { x += lm[i].x; y += lm[i].y; }
  return { x: x / ids.length, y: y / ids.length };
}

// signed steering angle in radians, positive = turn right (clockwise as the player sees it)
export function wheelAngle(hands, aspect = 4 / 3) {
  if (hands.length >= 2) {
    const c = hands.slice(0, 2).map(palmCenter).sort((a, b) => a.x - b.x);
    const A = c[0], B = c[1]; // A = image-left = player's right hand
    // turning right: player's left hand (B) rises, right hand (A) drops
    return Math.atan2(-(B.y - A.y), (B.x - A.x) * aspect);
  }
  if (hands.length === 1) {
    const lm = hands[0];
    const w = lm[LM.WRIST], m = lm[LM.MIDDLE_MCP];
    // upright hand = 0; fingers leaning to the player's right (image left, -x) = turn right
    return -Math.atan2((m.x - w.x) * aspect, -(m.y - w.y));
  }
  return 0;
}

// map an angle to −1…1 with a dead zone and a soft curve
export function steerFromAngle(a, { dead = 0.07, full = 0.6, curve = 1.35 } = {}) {
  const s = Math.sign(a), m = Math.abs(a);
  if (m < dead) return 0;
  const t = Math.min(1, (m - dead) / (full - dead));
  return s * Math.pow(t, curve);
}


/** palm size in image units (wrist → middle knuckle): a rough proxy for distance to the camera */
export function palmSize(lm, aspect = 4 / 3) {
  return dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP], aspect);
}

/** thumb-tip ↔ index-tip distance relative to palm size (small = pinching) */
export function pinchRatio(lm, aspect = 4 / 3) {
  return dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP], aspect) / (palmSize(lm, aspect) || 0.1);
}
