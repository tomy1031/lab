// Shared constants. Angles are in degrees unless the name says otherwise.

export const WATER_Y = -0.15;          // lake surface (platform top is y = 0)
export const STIM_DIST = 2.0;          // stimuli sit 2 m away: close to the headset focal plane, easy vergence
export const DEG = Math.PI / 180;

export const FONT = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Noto Sans CJK JP","Noto Sans JP","Yu Gothic",sans-serif';
// English display names (titles, chapter names) are set in a quiet serif
export const TITLE_FONT = '"Cormorant Garamond","Iowan Old Style","Palatino Linotype",Georgia,serif';

export const APP_NAME = 'Starlight Lake';

// Session plans. Durations in seconds for a 15-minute night; scaled by the chosen length.
// Chapters are short (~2 min) and alternate, so the night keeps changing pace.
// Order follows the evidence: warm-up, accommodation/vergence work (KGU 2025), contrast perceptual
// learning (Polat 2004, Deveau 2014, Tan & Fong 2008, Yan 2015), lateral masking with brief
// presentation (Polat 2012 for presbyopia), stereo (Vedamurthy 2016), action/periphery (Li 2009).
export const PLAN_VR = [
  { id: 'rest', dur: 45, variant: 'intro' },
  { id: 'lantern', dur: 120 },
  { id: 'spirits', dur: 120 },
  { id: 'gates', dur: 105 },
  { id: 'rest', dur: 32, variant: 'far' },
  { id: 'comets', dur: 80 },
  { id: 'spirits', dur: 105, variant: 'high' },
  { id: 'depth', dur: 95 },
  { id: 'lantern', dur: 110, variant: 'finale' },
];

// Screen mode: uncorrected, 2.5-4 m from a PC/TV. No stereo, small field: contrast work at high SF.
export const PLAN_SCREEN = [
  { id: 'rest', dur: 25, variant: 'screen' },
  { id: 'spirits', dur: 210 },
  { id: 'gates', dur: 180 },
  { id: 'rest', dur: 25, variant: 'screen' },
  { id: 'spirits', dur: 180, variant: 'high' },
  { id: 'gates', dur: 120, variant: 'brief' },
];

export const MODULE_INFO = {
  rest: { title: 'Still Water', sub: '呼吸と遠くを眺める時間',
    how: '光の蓮に合わせて呼吸します。吸うと花が開き、吐くと光が遠くの灯台へ流れていきます。最後は遠くを眺めて、まばたきを。' },
  lantern: { title: 'Lantern Drift', sub: '遠近のピント運動',
    how: '近づく灯籠の輪の「切れ目」の方向へ、つまんで(トリガーで)はじき返す。遠くで見抜くほど高得点。' },
  spirits: { title: 'Wisps', sub: 'コントラスト感度トレーニング',
    how: '縞模様が見える精にだけ触れよう。無地の精は見送る。縞はだんだん淡くなります。' },
  gates: { title: 'Star Gates', sub: '側方マスキングと瞬間視',
    how: '中央の星を見つめる。一瞬光る左右の門のうち、真ん中にも縞が宿ったのはどちら？' },
  depth: { title: 'Floating Orbs', sub: '立体視トレーニング',
    how: '三つの珠のうち、いちばん手前に浮いたものを選ぼう。' },
  comets: { title: 'Shooting Stars', sub: '周辺視野と反応速度',
    how: '視界の端を流れる星を、消える前につかまえよう。' },
};

// Chapters a player can pick in the Custom course, in the order a night visits them.
export const CHAPTERS = ['lantern', 'spirits', 'gates', 'depth', 'comets'];
export const CHAPTER_HINT = {
  lantern: '遠近のピント', spirits: 'コントラスト', gates: '瞬間視', depth: '立体視', comets: '周辺視',
};

// Recommended dose, from the protocols in docs/research.md.
export const DOSE = {
  minutesPerDay: [15, 25],
  sessionsPerWeek: [3, 5],
  weeks: [6, 10],
};
