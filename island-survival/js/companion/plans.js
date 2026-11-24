// companion/plans.js — 相談して 頼む (DESIGN §24.8): the companion reads the situation, ranks what matters
// (hurt / water / fire / dusk / rain / food / nothing), and proposes 1–2 plans the game can start (jobs of
// companion.js). Also the game → companion "triggers" (fire_low, dusk, rain_soon, player_thirsty, player_hungry,
// player_hurt, night_noise) with their own cool-downs. Pure functions over the live game objects; no DOM.
import { itemDef } from '../data/items.js';

export const SITUATION_NAMES = { hurt: 'ケガ・病気', water: '水', fire: '火', dusk: '夜が 近い', rain: '雨が 来る', food: '食べ物', none: '特に なし' };
export const JOB_LABEL = { gather_wood: '薪あつめ', gather_food: '食べ物さがし', fetch_water: '水くみ', fish: '釣り・漁', tend_fire: '火の 番' };

const WOOD = /branch|twig|firewood|driftwood|log/;
const isBox = (s) => !!(itemDef(s.id)?.container || s.stats?.liters);

/** the facts the companion looks at (also sent to Gemini Live as [STATE]) */
export function facts(C) {
  const g = C.game, P = g.sys.player, B = P.body.s, S = C.vitals.s, hour = g.clock.hour, W = g.sys.weather;
  const inv = P.inv.stacks.concat(C.inv.stacks);
  const cups = inv.reduce((a, s) => a + (s.water?.cups || 0), 0);
  const foodUnits = inv.reduce((a, s) => a + (itemDef(s.id)?.food && !itemDef(s.id)?.food?.poison ? s.n : 0), 0);
  const wood = inv.reduce((a, s) => a + (WOOD.test(s.id) ? s.n : 0), 0);
  const fireRec = g.sys.fires?.nearest?.(g.player.pos, 30);
  const fire = fireRec?.fire || null;
  const shelter = g.sys.building?.shelterAt?.(g.player.pos.x, g.player.pos.z) || { rain: 0 };
  const hasShelter = shelter.rain >= 0.5 || (g.sys.building?.sites || []).some((b) => b.stage === 'done' && /lean|shelter|hut|tent|a_frame|bed/.test(b.id || ''));
  const hurt = P.body.visible().filter((c) => c.sev >= 1 && !Object.keys(c.treated || {}).length);
  return {
    hour, playerWater: B.water, playerFood: B.food, myWater: S.water, myFood: S.food, cups, foodUnits, wood,
    fireLit: !!fire?.lit, fireMin: fire?.lit ? fire.fuel : 0, hasShelter, hurt: hurt.map((c) => c.name),
    rainSoon: W.rainSoon?.(g.clock, 3) ?? false, raining: W.rain > 0.2, night: hour >= 19 || hour < 5.5,
    hasContainer: C.inv.stacks.some(isBox),
    playerBox: P.inv.stacks.find((s) => isBox(s) && !s.water?.cups) || null,
  };
}

/** situations ranked by urgency (§24.8 の 点数づけ), at most `n` */
export function assess(C, n = 2) {
  const f = facts(C), out = [];
  const add = (id, score, plans) => out.push({ id, score, plans });
  const water = Math.min(f.playerWater, f.myWater);
  const food = Math.min(f.playerFood, f.myFood);
  if (f.hurt.length) add('hurt', 9, [{ job: 'tend_fire', who: 'companion' }, { job: f.hasContainer ? 'fetch_water' : null, who: 'companion' }].filter((p) => p.job));
  if (water < 40 || f.cups < 4) add('water', 8 - water / 10 + (f.cups < 2 ? 1 : 0), [f.hasContainer ? { job: 'fetch_water', who: 'companion' } : f.playerBox ? { job: 'fetch_water', who: 'companion', label: '水くみ（入れ物を 預ける）', lend: f.playerBox.uid } : { job: 'gather_food', who: 'companion', label: 'ヤシの実あつめ（入れ物が ないので 実の 水を）' }]);
  if (!f.fireLit || f.wood < 3 || f.fireMin < 60) add('fire', (!f.fireLit ? 5 : 3) + (f.night ? 2 : 0) + (f.wood < 3 ? 1 : 0), [{ job: 'gather_wood', who: 'companion' }, ...(f.fireLit ? [{ job: 'tend_fire', who: 'companion' }] : [])]);
  if (f.hour >= 16 && f.hour < 18.8 && (f.wood < 4 || !f.hasShelter)) add('dusk', 7, [{ job: 'gather_wood', who: 'companion' }]);
  if (f.rainSoon && !f.hasShelter) add('rain', 7.5, [{ job: 'gather_wood', who: 'companion', label: '屋根の 材料あつめ' }]);
  if (food < 40 || f.foodUnits < 3) add('food', 6 - food / 10, [{ job: C.sheet?.skills?.fish >= 4 ? 'fish' : 'gather_food', who: 'companion' }]);
  out.sort((a, b) => b.score - a.score);
  if (!out.length) out.push({ id: 'none', score: 0, plans: [] });
  for (const s of out) for (const p of s.plans) p.label = p.label || JOB_LABEL[p.job] || '';
  return out.slice(0, n);
}

/** short Japanese state text for the Live model (no numbers read aloud; the model rephrases) */
export function stateText(C) {
  const f = facts(C), lvl = (v) => (v > 70 ? '十分' : v > 40 ? 'ふつう' : v > 15 ? '少ない' : 'ほとんど ない');
  return `水：プレイヤー ${lvl(f.playerWater)}・あなた ${lvl(f.myWater)}・ためた 水 ${f.cups} 杯。食べ物：プレイヤー ${lvl(f.playerFood)}・あなた ${lvl(f.myFood)}・手持ち ${f.foodUnits} 個。` +
    `薪 ${f.wood} 本、火 ${f.fireLit ? `あり（残り 約 ${Math.round(f.fireMin)} 分）` : 'なし'}、屋根 ${f.hasShelter ? 'あり' : 'なし'}。${f.rainSoon ? '空が あやしい（数時間で 雨）。' : ''}${f.hurt.length ? `プレイヤーの 不調：${f.hurt.join('、')}。` : ''}`;
}

// ---------------------------------------------------------------- triggers (game → companion), §24.8 きっかけ
export const TRIGGERS = {
  fire_low: { text: '火が あと 20 分 ほどで 消えそう', sit: 'fire' },
  dusk: { text: '日が 沈むまで あと 1 時間', sit: 'dusk' },
  rain_soon: { text: '風が しめって きた。もうすぐ 雨が 来そう', sit: 'rain' },
  player_thirsty: { text: 'プレイヤーが のどが かわいて いる', sit: 'water' },
  player_hungry: { text: 'プレイヤーが お腹を すかせて いる', sit: 'food' },
  player_hurt: { text: 'プレイヤーが ケガ・病気を して いる', sit: 'hurt' },
  night_noise: { text: '夜の 茂みで 何かが 動く 音が した', sit: null },
};

/** which triggers fire now (the caller applies the 30-minute cool-down per id) */
export function detectTriggers(C) {
  const g = C.game, f = facts(C), out = [];
  if (f.fireLit && f.fireMin > 0 && f.fireMin < 20) out.push('fire_low');
  if (f.hour >= 17.3 && f.hour < 17.6) out.push('dusk');
  if (f.rainSoon) out.push('rain_soon');
  if (f.playerWater < 30) out.push('player_thirsty');
  if (f.playerFood < 30) out.push('player_hungry');
  if (f.hurt.length) out.push('player_hurt');
  if (f.night && (g.sys.fauna?.animals || []).some((a) => a.alive && !a.sp?.small && a.pos.distanceTo(g.player.pos) < 25)) out.push('night_noise');
  return out;
}
