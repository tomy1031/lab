// data/water.js — water sources and treatments (DESIGN §7.6, §22.7).
// water = hydration gained per cup (a cup is 0.25 L); W = base illness chance per cup (before treatment x difficulty);
// P(cup) = clamp(W * TREATMENTS[treat] * D, 0, 0.9). Sea water can never be made drinkable except by distilling
// (salt is not removed by filtering or boiling).
export const CUP_L = 0.25;

export const WATERS = {
  sea: { name: '海水', water: -10, W: 0, salty: true, note: '飲むほど渇く。1日2杯以上で嘔吐。蒸留だけが真水にする。' },
  swamp: { name: '湿地の溜まり水', water: 20, W: 0.45, parasite: 0.05, note: '寄生虫5%。煮沸が必須。' },
  river_low: { name: '川の水（下流・河口）', water: 20, W: 0.18, muddyW: 0.30, note: '大雨のあと24hは濁り（W 0.30）。' },
  river_up: { name: '川の水（上流・滝）', water: 20, W: 0.08, note: '岩山を登る手間がある。' },
  stream: { name: '小川の水', water: 20, W: 0.18, muddyW: 0.30, note: 'この島では下流の川と同じ扱い。' },
  pond: { name: '池の水', water: 20, W: 0.25, parasite: 0.02, note: '湿地よりややまし。煮沸すること。' },
  spring: { name: '岩清水', water: 20, W: 0.02, ratePerHour: 0.5, note: '岩山中腹の1か所。毎時0.5Lしか出ない。' },
  rain_fresh: { name: '雨水（受けてすぐ）', water: 20, W: 0.02, note: '雨水受け・葉・鍋で集める。' },
  rain_stored: { name: '雨水（ためて24h以上）', water: 20, W: 0.06, wPerDay: 0.02, wMax: 0.20, lidFactor: 0.5, note: 'ふた付きは増加が半分。' },
  coconut_water: { name: 'ヤシの水', water: 20, W: 0.005, note: 'ほぼ安全。' },
  dew: { name: '朝露', water: 5, W: 0.03, note: '布で集める（05–07時）。1回5。' },
  distilled: { name: '蒸留水', water: 20, W: 0, note: 'ソーラースチルや鍋のふた。海水も真水に。' },
  bamboo_water: { name: '竹の水', water: 20, W: 0.02, liters: 0.2, note: '節の間にたまった水。振ると音がする（0.2L）。' },
};

export const TREATMENTS = {
  none: 1,
  cloth: 0.8,
  filter: (q) => 0.6 - 0.4 * q / 100,
  boil: 0.03,
  hotstone: 0.05,
  filter_boil: 0.01,
  bottle: 0.02,
  distill: 0,
};
