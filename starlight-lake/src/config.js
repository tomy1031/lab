// Shared constants. Angles are in degrees unless the name says otherwise.

export const WATER_Y = -0.15;          // lake surface (platform top is y = 0)
export const STIM_DIST = 2.0;          // stimuli sit 2 m away: close to the headset focal plane, easy vergence
export const DEG = Math.PI / 180;

export const FONT = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Noto Sans CJK JP","Noto Sans JP","Yu Gothic",sans-serif';

// Session plans. Durations in seconds for a 15-minute night; scaled by the chosen length.
// Order follows the evidence: warm-up, accommodation/vergence work (KGU 2025), contrast perceptual
// learning (Polat 2004, Deveau 2014, Tan & Fong 2008, Yan 2015), lateral masking with brief
// presentation (Polat 2012 for presbyopia), stereo (Vedamurthy 2016), action/periphery (Li 2009).
export const PLAN_VR = [
  { id: 'rest', dur: 40, variant: 'intro' },
  { id: 'lantern', dur: 180 },
  { id: 'spirits', dur: 180 },
  { id: 'rest', dur: 30, variant: 'far' },
  { id: 'gates', dur: 150 },
  { id: 'depth', dur: 120 },
  { id: 'comets', dur: 90 },
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
  rest: { title: '静かな水面', sub: '呼吸と遠くを眺める時間',
    how: '光の玉を目で追い、呼吸を合わせます。最後に遠くの山を眺めて、まばたきを。' },
  lantern: { title: '灯籠ながし', sub: '遠近のピント運動',
    how: '近づく灯籠の輪の「切れ目」の方向へ、つまんで(トリガーで)はじき返す。遠くで見抜くほど高得点。' },
  spirits: { title: '光の精', sub: 'コントラスト感度トレーニング',
    how: '縞模様が見える精にだけ触れよう。無地の精は見送る。縞はだんだん淡くなります。' },
  gates: { title: '星の門', sub: '側方マスキングと瞬間視',
    how: '中央の星を見つめる。一瞬光る左右の門のうち、真ん中にも縞が宿ったのはどちら？' },
  depth: { title: '浮かぶ星珠', sub: '立体視トレーニング',
    how: '三つの星珠のうち、いちばん手前に浮いたものを選ぼう。' },
  comets: { title: '流れ星', sub: '周辺視野と反応速度',
    how: '視界の端を流れる星を、消える前につかまえよう。' },
};

// Recommended dose, from the protocols in docs/research.md.
export const DOSE = {
  minutesPerDay: [15, 25],
  sessionsPerWeek: [3, 5],
  weeks: [6, 10],
};
