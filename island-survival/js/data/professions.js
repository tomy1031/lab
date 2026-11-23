// data/professions.js — companion professions, character quirks, sex/age modifiers, skills and job table (DESIGN §23).
// Pure data. Dice strings are 'NdM+K' / 'NdM-K'. Skill ranges are [lo, hi] (inclusive); skills not listed roll 0–2.

export const ABILITIES = [
  { id: 'str', name: '筋力', desc: '持つ・運ぶ・切る 力' },
  { id: 'con', name: '体力', desc: '丈夫さ・持久力' },
  { id: 'dex', name: '器用', desc: '手先の 細かさ' },
  { id: 'agi', name: '敏捷', desc: '身のこなし・足の 速さ' },
  { id: 'int', name: '知識', desc: '物知り・観察・判断' },
  { id: 'pow', name: '精神', desc: '心の 強さ・落ち着き' },
];

export const SKILLS = [
  { id: 'gather', name: '採集' }, { id: 'fish', name: '釣り・漁' }, { id: 'hunt', name: '狩り' }, { id: 'craft', name: '工作' },
  { id: 'cook', name: '料理' }, { id: 'fire', name: '火' }, { id: 'build', name: '建築' },
  { id: 'swim', name: '泳ぎ' }, { id: 'medic', name: '医療' }, { id: 'night', name: '夜目' }, { id: 'nav', name: '方向感覚' },
];

// perk / flaw: { id, text, jobMul?: { jobId: ×output }, … } — only effects that touch job output are modelled here.
export const PROFESSIONS = {
  fisher: {
    id: 'fisher', name: '漁師（見習い）', short: '漁師',
    dice: { str: '3d6+2', con: '3d6+2', dex: '3d6', agi: '3d6+1', int: '3d6-1', pow: '3d6' },
    skills: { fish: [5, 8], swim: [5, 9], cook: [1, 4], craft: [2, 4], nav: [3, 6] },
    perk: { id: 'fish_eye', text: '魚の 目利き：魚・貝の 鮮度と 毒魚を 教える。潮を 朝に 言う。そばで 釣ると アタリ ×1.2' },
    flaw: { id: 'land_slow', text: '陸の 狩り・建築は 並 以下（伸び ×0.5）', growthMul: { hunt: 0.5, build: 0.5 } },
  },
  botanist: {
    id: 'botanist', name: '植物学者（院生）', short: '植物学者',
    dice: { str: '3d6-2', con: '3d6-1', dex: '3d6+1', agi: '3d6', int: '3d6+4', pow: '3d6' },
    skills: { gather: [5, 8], cook: [3, 6], craft: [2, 4], medic: [2, 4] },
    perk: { id: 'appraise', text: '鑑定：植物・キノコを 図鑑 K3 に。薬の 効果 ×1.2。毒の 物を 拾わない' },
    flaw: { id: 'no_butcher', text: '狩り・解体を しない（信頼 70 以上で 解体だけ）', noKill: true },
  },
  carpenter: {
    id: 'carpenter', name: '大工（棟梁）', short: '大工',
    dice: { str: '3d6+2', con: '3d6+1', dex: '3d6+3', agi: '3d6-1', int: '3d6', pow: '3d6+1' },
    skills: { build: [6, 9], craft: [4, 7], fire: [3, 6], gather: [1, 3] },
    perk: { id: 'foreman', text: '棟梁：建築の 所要 さらに ×0.7、建物の Q ＋10・耐久 ＋20%', jobMul: { build_help: 1 / 0.7 } },
    flaw: { id: 'sloppy', text: '釣り・料理は 雑（焦がす 率 ＋5%）', jobMul: { cook: 0.95, fish: 0.95 } },
  },
  nurse: {
    id: 'nurse', name: '看護師', short: '看護師',
    dice: { str: '3d6', con: '3d6+1', dex: '3d6+2', agi: '3d6', int: '3d6+2', pow: '3d6+2' },
    skills: { medic: [6, 9], cook: [3, 5], fire: [1, 3], night: [4, 7] },
    perk: { id: 'care', text: '手当て：包帯・湿布の 感染率 さらに ×0.5。あなたの 発症を 潜伏中に 見ぬく。夜勤に 強い（徹夜の 睡眠の 減り ×0.7）' },
    flaw: { id: 'weak_arm', text: '力仕事（伐採・運搬の 成果 ×0.8）', jobMul: { gather_wood: 0.8, gather_material: 0.8, fetch_water: 0.8 } },
  },
  cook: {
    id: 'cook', name: '料理人', short: '料理人',
    dice: { str: '3d6', con: '3d6', dex: '3d6+3', agi: '3d6', int: '3d6+1', pow: '3d6' },
    skills: { cook: [6, 9], fire: [4, 6], gather: [2, 5], fish: [1, 4] },
    perk: { id: 'kitchen', text: '台所：焦がさない。料理の 満腹 ＋10%・気力 ＋2。鮮度の 段階を 見ぬく', jobMul: { cook: 1.1 } },
    flaw: { id: 'chilly', text: '寒さ（快適の 下限 ＋1℃）', coldPlus: 1 },
  },
  hunter: {
    id: 'hunter', name: '猟師', short: '猟師',
    dice: { str: '3d6+1', con: '3d6+2', dex: '3d6+1', agi: '3d6+2', int: '3d6', pow: '3d6+2' },
    skills: { hunt: [6, 9], fire: [3, 6], nav: [5, 8], night: [3, 6], craft: [2, 4] },
    perk: { id: 'tracker', text: '読み：足跡・ふんの 新しさと 向き、手負いを 待つ 時間を 教える。解体の 収量 ＋10%' },
    flaw: { id: 'quiet', text: '口数が 少ない（話しかける 頻度 ×0.7）', chatMul: 0.7 },
  },
  guide: {
    id: 'guide', name: 'アウトドアガイド', short: 'ガイド',
    dice: { str: '3d6+1', con: '3d6+2', dex: '3d6+1', agi: '3d6+1', int: '3d6+1', pow: '3d6+1' },
    skills: { fire: [5, 8], nav: [6, 9], gather: [3, 5], medic: [2, 4], swim: [3, 6], craft: [3, 5] },
    perk: { id: 'planner', text: '段取り：天気の 崩れを 6 時間 前に 言う。迷子に ならない。着火の 基本率 ＋0.05', neverLost: true },
    flaw: { id: 'average', text: '飛びぬけた 物が ない（技能の 上限 8）', skillCap: 8 },
  },
  farmer: {
    id: 'farmer', name: '農家', short: '農家',
    dice: { str: '3d6+2', con: '3d6+2', dex: '3d6', agi: '3d6', int: '3d6', pow: '3d6+1' },
    skills: { gather: [4, 7], build: [2, 5], craft: [3, 5], cook: [2, 5], fire: [2, 5], swim: [0, 2] },
    perk: { id: 'worker', text: '働き者：仕事中の 睡眠・気力の 減り ×0.8。再生を 妨げない 取り方（採集量 ＋10%）', jobMul: { gather_food: 1.1, gather_material: 1.1 } },
    flaw: { id: 'no_sea', text: '泳ぎ 0–2（海の 仕事を ほぼ しない）' },
  },
  office: {
    id: 'office', name: '会社員', short: '会社員',
    dice: { str: '3d6-1', con: '3d6-1', dex: '3d6', agi: '3d6', int: '3d6+2', pow: '3d6' },
    skills: { cook: [1, 4] }, allSkills: [0, 2],
    growthMul: 1.5,
    perk: { id: 'plan', text: '計画：蓄えの 残り日数を 正しく 言う。技能の 伸び ×1.5' },
    flaw: { id: 'greenhorn', text: '最初は 何も できない' },
  },
  student: {
    id: 'student', name: '学生', short: '学生',
    dice: { str: '3d6', con: '3d6+1', dex: '3d6', agi: '3d6+2', int: '3d6', pow: '3d6-1' },
    skills: { swim: [2, 6] }, allSkills: [0, 3],
    growthMul: 2,
    perk: { id: 'potential', text: '伸びしろ：技能の 伸び ×2。何でも 断らない（苦手の 減点 なし）' },
    flaw: { id: 'fearful', text: '夜の 不安 ×1.3', nightFearMul: 1.3 },
  },
};
export const PROFESSION_IDS = Object.keys(PROFESSIONS);

// quirks keep after changing profession. Effect keys are read by companion-sheet.js.
export const CHAR_INFO = {
  nagi: {
    id: 'nagi', name: '汐見 凪', short: 'ナギ', sex: 'F', age: 19, defaultProfession: 'fisher',
    quirks: [
      { id: 'jungle_dark', text: '密林・夜の 屋外で 気力が 余計に 減る（−1/h）', moraleJungleNight: -1 },
      { id: 'no_bugs', text: '虫の 料理は 食べない', noInsects: true },
      { id: 'swimmer', text: '泳ぎは 少なくとも Lv4', swimMin: 4 },
    ],
  },
  touko: {
    id: 'touko', name: '柊 透子', short: 'トウコ', sex: 'F', age: 24, defaultProfession: 'botanist',
    quirks: [
      { id: 'lost_easy', text: '方向音痴（方向感覚 −2、迷子率 ×2）', navMinus: 2, lostMul: 2 },
      { id: 'no_kill', text: '動物を しとめない（罠と 解体は する、矢は 撃てない）', noKill: true },
    ],
  },
  gen: {
    id: 'gen', name: '岩切 源', short: 'ゲン', sex: 'M', age: 58, defaultProfession: 'carpenter',
    quirks: [
      { id: 'no_swim', text: '泳げない（海に 入らない）', swimFixed: 0 },
      { id: 'bad_eyes', text: '夜目が 利かない（夜目 −2）', nightMinus: 2 },
      { id: 'grumble', text: 'AI 錬成の 変な 物に ぼやく', grumbleAI: true },
    ],
  },
};

export const SEX_MOD = {
  F: { label: '女性', abil: { str: -1, dex: 1 }, appetite: 0.90, sweat: 1.0, shiverEarly: 0.2, coreCold: 0.9, illness: 0.95 },
  M: { label: '男性', abil: { str: 1 }, appetite: 1.0, sweat: 1.05, shiverEarly: 0, coreCold: 1.0, illness: 1.0 },
};

export const AGE_MOD = [
  { max: 29, label: '若い', abil: { agi: 1 }, regen: 1.1, skillLowerBonus: 0, skills: {} },
  { max: 49, label: '', abil: {}, regen: 1.0, skillLowerBonus: 0, skills: {} },
  { max: Infinity, label: '年配', abil: { con: -1, agi: -1, int: 2, pow: 1 }, regen: 0.85, skillLowerBonus: 1, skills: { night: -1 } },
];
export const ageMod = (age) => AGE_MOD.find((a) => age <= a.max);

// §23.5 job table: job id → skill (null = fixed Lv5 / none), ability, label
export const JOBS_SKILL = {
  gather_wood: { skill: 'gather', ability: 'str', label: '薪あつめ' },
  gather_food: { skill: 'gather', ability: 'int', label: '食べ物さがし' },
  gather_material: { skill: 'gather', ability: 'str', label: '素材あつめ' },
  fetch_water: { skill: null, fixed: 5, ability: 'str', label: '水くみ' },
  fish: { skill: 'fish', ability: 'agi', label: '釣り' },
  cook: { skill: 'cook', ability: 'dex', label: '料理' },
  tend_fire: { skill: 'fire', ability: 'pow', label: '火の 番' },
  build_help: { skill: 'build', ability: 'str', label: '建築の 手伝い' },
  craft: { skill: 'craft', ability: 'dex', label: '錬成' },
  watch: { skill: 'night', nightOnly: true, ability: 'int', label: '見張り' },
  nurse: { skill: 'medic', ability: 'pow', label: '看病' },
  hunt_help: { skill: 'hunt', ability: 'agi', label: '狩りの 手伝い' },
};
