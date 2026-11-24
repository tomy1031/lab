// js/chapters/base.js — what every chapter shares: a root group in the stage, a list of steps (each with a
// title, a text for the guide panel and what to show), its own buttons, and the things you can touch.
import * as THREE from 'three';

export class Chapter {
  constructor(app, { id, title, tag, sub = '', desc = '' }) {
    this.app = app;
    this.id = id;
    this.title = title;
    this.tag = tag;
    this.sub = sub;
    this.desc = desc;
    this.root = new THREE.Group();
    this.root.visible = false;
    app.stage.add(this.root);
    this.steps = [];
    this.step = 0;
    this.items = [];
    this.view = { pos: [0, 1.5, 0.45], yaw: 0, pitch: -0.28 }; // the PC camera for this chapter
    this.keyHelp = '';
    this.guides = []; // per step: { vr, hand, pc, targets: [{ at: () => world Vector3, vr, pc, r }] }
    this.stickHelp = null; // { L, R }: what the thumbsticks do in this chapter
  }

  enter(step = 0) {
    if (!this.guides.length && this.setupGuides) this.setupGuides();
    this.root.visible = true;
    this.setStep(step);
  }

  exit() {
    this.root.visible = false;
  }

  setStep(k) {
    this.step = Math.max(0, Math.min(this.steps.length - 1, k));
    const s = this.steps[this.step];
    s.enter?.();
    this.app.refreshPanel();
  }

  // the guide panel's content for the current step
  panelSpec() {
    const s = this.steps[this.step];
    return {
      kind: 'step',
      num: `${this.index}章`,
      title: this.title,
      tag: s.tag || this.tag,
      step: this.step,
      steps: this.steps.length,
      stepTitle: s.title,
      text: typeof s.text === 'function' ? s.text() : s.text,
      actions: (s.actions ? s.actions() : this.actions?.()) || [],
      extra: s.extra || null,
      extraH: s.extraH,
      how: this.app.guide?.how(),
      guideOn: this.app.guide?.on,
      nextChapter: this.index < this.app.chapters.length - 1,
      prevChapter: this.index > 1,
    };
  }

  onAction() {}
  update() {}
  keys() {}
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (t) => t * t * (3 - 2 * t);
