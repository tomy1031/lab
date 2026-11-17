// courses/index.js — the four courses (in Grand Prix order) and the title-screen tune
import candy from './candy.js';
import forest from './forest.js';
import coral from './coral.js';
import galaxy from './galaxy.js';

export const COURSES = [candy, forest, coral, galaxy];

export const TITLE_MUSIC = {
  bpm: 128, root: 62, scale: 'major', progression: [0, 4, 5, 3], seed: 21,
  style: { lead: 'square', drums: 'pop', bass: 'octave', arpType: 'triangle', rhythm: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0] },
};
