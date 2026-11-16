// js/core/grips.js — how a closed hand holds each kind of item, shared by the hands (finger wrap) and the items
// (where the model sits in the fist), so the handle always runs through the curled fingers.
// Grip space (WebXR): origin = centre of the fist, −Z along the held rod (thumb / index side), +X back of the right
// hand, +Y toward the elbow. Each entry: r = handle radius (the fingers close onto a cylinder along Z of that
// radius); at = where that cylinder's axis sits in grip space for the right hand (x mirrors for the left; thick
// things sit further into the palm); model = where the handle's axis is inside the item's own model.
export const GRIPS = {
  sword: { r: 0.0138, at: [0, 0], model: [0, 0] },
  spear: { r: 0.0165, at: [0, 0], model: [0, 0] },
  torch: { r: 0.0205, at: [-0.005, -0.002], model: [0, 0] },
  bow: { r: 0.023, at: [-0.007, 0], model: [0, -0.034] },
  shield: { r: 0.013, at: [0, 0], model: [0.004, 0] },
  windfan: { r: 0.013, at: [0, 0], model: [0, 0] },
  waybell: { r: 0.011, at: [0, 0], model: [0, 0] },
  arrow: { r: 0.007, at: [0, 0], model: [0, 0] },
  flask: { r: 0.047, at: [-0.03, -0.002], model: [0, 0] },
  bomb: { r: 0.058, at: [-0.044, -0.01], model: [0, 0] },
  rock: { r: 0.045, at: [-0.024, -0.03], model: [0, 0] },
  food: { r: 0.042, at: [-0.02, -0.03], model: [0, 0] },
  small: { r: 0.026, at: [-0.008, -0.014], model: [0, 0] },
  fist: { r: 0.008, at: [0, 0], model: [0, 0] },          // empty hand, grip pressed
};

/** which entry an item uses (food / materials / keys share one; anything else is held like a rod) */
export function gripKey(id, def) {
  if (!id) return 'fist';
  if (GRIPS[id]) return id;
  if (def?.cat === 'food') return 'food';
  if (def?.cat === 'material' || def?.cat === 'key') return 'small';
  return 'sword';
}
