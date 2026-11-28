// courses/index.js — the courses (in Grand Prix order, cup by cup) and the title-screen tune
import candy from './candy.js';
import forest from './forest.js';
import coral from './coral.js';
import galaxy from './galaxy.js';
import angkor from './angkor.js';
import phnompenh from './phnompenh.js';
import bokor from './bokor.js';
import battambang from './battambang.js';

export const COURSES = [candy, forest, coral, galaxy, angkor, phnompenh, bokor, battambang];

// a Grand Prix runs one cup: its four courses in order
export const CUPS = [
  { id: 'dream', name: 'ドリームカップ', short: 'DREAM', courses: [0, 1, 2, 3] },
  { id: 'cambodia', name: 'カンボジアカップ', short: 'CAMBODIA', courses: [4, 5, 6, 7] },
];
export const cupOf = (idx) => CUPS.find((c) => c.courses.includes(idx)) || CUPS[0];

export const TITLE_MUSIC = {
  bpm: 128, root: 62, scale: 'major', progression: [0, 4, 5, 3], seed: 21,
  style: { lead: 'square', drums: 'pop', bass: 'octave', arpType: 'triangle', rhythm: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0] },
};
