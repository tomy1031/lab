// js/courses.js — the four runs: a practice slope with lessons, and three courses (easy → hard).
// Every place, name and layout here is original to POWDER LINE.
import { Course } from './course.js';

const TAU = Math.PI * 2;

export const THEMES = {
  noon: {
    sky: ['#2f74d6', '#cfe7ff'], fog: '#dcecff', fogDensity: 0.0038, sun: [0.35, 0.8, -0.45], sunColor: '#fffaf2', sunI: 2.1,
    hemi: ['#dfeaff', '#8ea3c8', 1.25], snow: '#f6f9ff', shade: '#b4c8ea', trees: 1, treeTint: '#2f6a4a', mountains: '#9fb8dc',
    snowfall: 0.25, music: { root: 62, tempo: 112, mood: 'bright' },
  },
  morning: {
    sky: ['#4b8fe0', '#ffe6cf'], fog: '#eef0f7', fogDensity: 0.0034, sun: [-0.55, 0.45, -0.7], sunColor: '#fff0dc', sunI: 2.0,
    hemi: ['#e6ecff', '#9a9fca', 1.25], snow: '#f7f8ff', shade: '#bcc2ec', trees: 1.15, treeTint: '#2d6448', mountains: '#b7b9da',
    snowfall: 0.15, music: { root: 64, tempo: 118, mood: 'bright' },
  },
  glacier: {
    sky: ['#2a6fb5', '#c4eef5'], fog: '#cdeef6', fogDensity: 0.0036, sun: [0.5, 0.6, -0.2], sunColor: '#f4fbff', sunI: 2.0,
    hemi: ['#dcf6ff', '#7eaac2', 1.25], snow: '#effbff', shade: '#8fc6dd', trees: 0.45, treeTint: '#2c5d55', mountains: '#9ccbe0',
    snowfall: 0.35, ice: true, music: { root: 57, tempo: 124, mood: 'cool' },
  },
  aurora: {
    sky: ['#040a1c', '#1a2d5e'], fog: '#0d1838', fogDensity: 0.0052, sun: [0.3, 0.7, 0.4], sunColor: '#9fb8ff', sunI: 1.1,
    hemi: ['#4a62b0', '#141a33', 0.9], snow: '#c9d6ff', shade: '#3a4a86', trees: 1.1, treeTint: '#173a3a', mountains: '#24345e',
    snowfall: 0.5, night: true, aurora: true, stars: true, music: { root: 59, tempo: 128, mood: 'night' },
  },
};

const practice = {
  id: 'practice', name: 'れんしゅうゲレンデ', en: 'PRACTICE', level: 0, seed: 3, theme: THEMES.noon, par: 70,
  sub: '傾く・しゃがむ・ジャンプ・グラブ・スピン・ブレーキを、看板に そって 順に 練習',
  ranks: [1500, 1000, 500],
  length: 700,
  slope: [[-60, 3], [-10, 6], [10, 11], [150, 11], [170, 14], [280, 14], [300, 12], [640, 12], [690, 10], [720, -2], [900, -4]],
  cx: [[0, 0]],
  hw: [[-60, 13], [0, 15], [690, 15], [740, 22]],
  build(C, H) {
    H.sign(16, 'R', 'lean');
    H.line(40, 140, 5, (s) => 7 * Math.sin((TAU * (s - 40)) / 100));
    H.sign(152, 'R', 'tuck');
    H.ring(190); H.ring(225); H.ring(260, 0, 1.5, 2.1);
    H.sign(282, 'R', 'ollie');
    H.log(322, -7.5, 7.5); H.line(322, 322, 1, () => 0, 'green', 2.1);
    H.log(362, -7.5, 7.5); H.line(362, 362, 1, () => 0, 'green', 2.1);
    H.sign(388, 'R', 'kicker');
    H.kicker(440, 0, { len: 7, h: 1.4, w: 6, crystals: 'blue', n: 5, arc: 15 });
    H.sign(488, 'R', 'spin');
    H.kicker(548, 0, { len: 8.5, h: 2.0, w: 7, crystals: 'gold', n: 6, arc: 16 });
    H.sign(600, 'R', 'brake');
    H.line(625, 690, 6.5, () => -5);
  },
};

const hill = {
  id: 'hill', name: 'ゆきうさぎの丘', en: 'SNOWHARE HILL', level: 1, seed: 11, theme: THEMES.morning, par: 95,
  sub: '初級：広くて ゆるやか。分かれ道・ローラー・3つの キッカー',
  ranks: [3200, 2300, 1400],
  length: 1300,
  slope: [[-60, 3], [-10, 6], [10, 12], [40, 14], [300, 14], [340, 12], [420, 13], [640, 13], [700, 15], [900, 15], [960, 13], [1200, 15], [1290, 12], [1320, -2], [1520, -4]],
  cx: [[0, 0], [120, 0], [200, 12], [270, 0], [700, 0], [780, -12], [860, 8], [940, 0], [1300, 0]],
  hw: [[-60, 14], [0, 20], [400, 20], [430, 27], [650, 27], [690, 21], [1290, 21], [1340, 26]],
  build(C, H) {
    H.line(20, 110, 6, (s) => 5 * Math.sin((s - 20) / 14));
    H.ring(62); H.ring(104, 3);
    H.line(130, 222, 6, () => -3);
    H.kicker(252, 0, { len: 7, h: 1.3, w: 7, crystals: 'blue', n: 5, arc: 15 });
    H.rollers(300, 392, 0.32, 16);
    H.line(306, 386, 8, () => 0, (s) => (s > 380 ? 'green' : 'blue'));
    H.island(440, 640, 0, 9, 3);
    H.line(470, 612, 7, () => -17, (s) => (s > 600 ? 'gold' : 'blue'));
    H.kicker(532, 17, { len: 6, h: 1.2, w: 5, crystals: 'blue', n: 4, arc: 14 });
    H.ring(592, 17); H.ring(620, 17);
    H.kicker(722, 0, { len: 8, h: 1.8, w: 8, crystals: 'gold', n: 6, arc: 16 });
    H.ring(800, -7); H.ring(830, 5); H.ring(860, -5); H.ring(890, 6);
    H.rollers(960, 1062, 0.3, 18);
    H.line(966, 1056, 9, () => 4, (s) => (s > 1050 ? 'green' : 'blue'));
    H.tree(1002, -8); H.tree(1032, 7); H.rock(1082, -4, 1.1); H.rock(1100, 6, 0.9);
    H.kicker(1160, 0, { len: 7.5, h: 1.6, w: 7, crystals: 'gold', n: 5, arc: 16 });
    H.ring(1240); H.ring(1270);
  },
};

const glacier = {
  id: 'glacier', name: 'こおりの谷', en: 'GLACIER GORGE', level: 2, seed: 23, theme: THEMES.glacier, par: 105,
  sub: '中級：氷の トンネルと 氷柱、崖の ドロップ、3本に 分かれる 道',
  ranks: [4300, 3100, 1900],
  length: 1600,
  slope: [[-60, 3], [-10, 7], [10, 13], [40, 16], [250, 17], [300, 15], [500, 18], [700, 18], [760, 15], [1000, 18], [1200, 18], [1260, 16], [1590, 16], [1620, -2], [1820, -4]],
  cx: [[0, 0], [100, 0], [180, -14], [280, -14], [350, 9], [420, 9], [480, 0], [720, 0], [800, 16], [870, 16], [950, 0], [1250, 0], [1330, -12], [1400, -12], [1460, 0]],
  hw: [[-60, 14], [0, 17], [480, 17], [510, 27], [720, 27], [750, 17], [990, 17], [1020, 34], [1200, 34], [1230, 18], [1590, 18], [1640, 24]],
  build(C, H) {
    H.line(30, 96, 6, (s) => 4 * Math.sin((s - 30) / 10));
    H.ring(74);
    H.icewall(140, 300, -1); H.icewall(140, 300, 1);
    for (const s of [196, 214, 232, 250, 268]) H.arch(s);
    H.line(192, 272, 5, () => 0, (s) => (s > 268 ? 'gold' : 'blue'));
    H.ice(304, -5); H.ice(322, 6); H.ice(344, -2); H.ice(366, 5);
    H.line(300, 372, 12, (s) => (Math.round((s - 300) / 12) % 2 ? -1 : 2));
    H.kicker(442, 0, { len: 7.5, h: 1.6, w: 7, crystals: 'blue', n: 5, arc: 16 });
    H.island(512, 720, 0, 10, 3.5);
    H.ledge(622, -17, { len: 48, h: 3.0, w: 10, crystals: 'gold', n: 6, arc: 17 });
    H.line(540, 708, 8, () => 17, (s) => (s > 690 ? 'green' : 'blue'));
    H.ring(600, 17); H.ring(650, 17);
    H.rollers(762, 880, 0.4, 15);
    H.line(770, 870, 10, () => 0);
    H.kicker(932, 0, { len: 8, h: 1.9, w: 8, crystals: 'gold', n: 6, arc: 17 });
    H.island(1032, 1190, -13, 4, 3); H.island(1032, 1190, 13, 4, 3);
    H.ice(1070, -1.5, 0.8); H.ice(1100, 2, 0.8); H.ice(1132, -1.5, 0.8);
    H.line(1060, 1180, 10, () => 0.5, (s) => (s > 1170 ? 'gold' : 'green'));
    H.kicker(1110, -25, { len: 6.5, h: 1.4, w: 5, crystals: 'blue', n: 4, arc: 15 });
    H.ring(1080, 25); H.ring(1120, 25); H.ring(1160, 25);
    H.drop(1282, 40, 4.5, 22, 22);
    H.line(1250, 1278, 7, () => 0);
    H.moguls(1352, 1452, 0.4, 7.5);
    H.line(1360, 1446, 8, (s) => 5 * Math.sin((s - 1360) / 9));
    H.kicker(1522, 0, { len: 8, h: 2.0, w: 8, crystals: 'gold', n: 6, arc: 17 });
    H.ring(1585);
  },
};

const aurora = {
  id: 'aurora', name: 'オーロラの峰', en: 'AURORA RIDGE', level: 3, seed: 37, theme: THEMES.aurora, par: 112,
  sub: '上級：夜の 急斜面。林の スラローム・コブ・崖・キッカーの 連続',
  ranks: [5400, 3900, 2400],
  length: 1900,
  slope: [[-60, 3], [-10, 7], [10, 14], [40, 18], [300, 19], [340, 21], [600, 21], [640, 18], [880, 19], [1100, 21], [1300, 21], [1340, 18], [1600, 20], [1890, 18], [1920, -2], [2120, -4]],
  cx: [[0, 0], [80, 0], [160, 13], [240, -10], [320, 7], [400, 0], [600, 0], [680, -15], [760, 10], [840, 0], [1100, 0], [1180, 14], [1260, -8], [1330, 0], [1650, 0], [1720, -10], [1800, 0], [1900, 0]],
  hw: [[-60, 13], [0, 15], [600, 15], [630, 25], [840, 25], [870, 15], [1360, 15], [1390, 26], [1590, 26], [1620, 15], [1890, 15], [1940, 22]],
  build(C, H) {
    H.lanterns(0, 1900, 26);
    H.line(30, 90, 6, (s) => 3 * Math.sin((s - 30) / 9));
    const slalom = [[112, -4], [134, 4], [156, -3], [178, 5], [200, -4], [222, 3], [244, -5], [266, 4], [288, -3]];
    for (const [s, o] of slalom) H.tree(s, o, 0.9);
    for (const [s, o] of slalom) H.line(s, s, 1, () => -o * 1.1, 'blue');
    H.kicker(382, 0, { len: 8, h: 1.8, w: 6, crystals: 'gold', n: 6, arc: 17 });
    H.moguls(432, 562, 0.5, 7);
    H.line(440, 556, 9, (s) => 4 * Math.sin((s - 440) / 12));
    H.island(642, 842, 0, 9, 3.5);
    for (const [s, o] of [[680, -14], [702, -18], [724, -13], [746, -18], [768, -14], [790, -18]]) H.tree(s, o, 0.85);
    H.line(670, 800, 11, (s) => (Math.round((s - 670) / 11) % 2 ? -16.5 : -15), (s) => (s > 790 ? 'gold' : 'green'));
    H.kicker(712, 16, { len: 7, h: 1.6, w: 6, crystals: 'blue', n: 5, arc: 16 });
    H.ledge(800, 16, { len: 40, h: 2.6, w: 8, crystals: 'gold', n: 5, arc: 17 });
    H.drop(900, 48, 5, 26, 26);
    H.line(870, 896, 6, () => 0);
    H.rollers(962, 1082, 0.45, 16);
    H.line(968, 1076, 8, () => -3, (s) => (s > 1070 ? 'green' : 'blue'));
    H.kicker(1150, 0, { len: 8.5, h: 2.1, w: 7, crystals: 'gold', n: 6, arc: 18 });
    H.rock(1226, -5, 1.4); H.rock(1252, 4, 1.2); H.rock(1290, -2, 1.0);
    H.island(1392, 1582, 0, 9, 3.5);
    H.ice(1430, -15, 0.8); H.ice(1460, -18, 0.8); H.ice(1490, -14, 0.8); H.ice(1520, -17, 0.8);
    H.ring(1445, -16); H.ring(1505, -16); H.ring(1560, -16);
    H.kicker(1452, 16, { len: 6.5, h: 1.5, w: 6, crystals: 'blue', n: 4, arc: 16 });
    H.kicker(1522, 16, { len: 6.5, h: 1.6, w: 6, crystals: 'green', n: 4, arc: 16 });
    const slalom2 = [[1660, 3], [1684, -4], [1708, 4], [1732, -3], [1756, 4], [1780, -4]];
    for (const [s, o] of slalom2) H.tree(s, o, 0.9);
    for (const [s, o] of slalom2) H.line(s, s, 1, () => -o, 'blue');
    H.kicker(1852, 0, { len: 9, h: 2.3, w: 9, crystals: 'gold', n: 7, arc: 18 });
  },
};

export const SPECS = [practice, hill, glacier, aurora];
const cache = new Map();
export function getCourse(id) {
  if (!cache.has(id)) cache.set(id, new Course(SPECS.find((c) => c.id === id) || SPECS[1]));
  return cache.get(id);
}
