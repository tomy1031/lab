// data/items.js — the item database for everything that is NOT a crafted result (those live in crafted.js).
//
// Sections (in file order):
//   1. helpers         attrs parser, builders that fill in the defaults (stack size, quality range, edible, scent)
//   2. MATERIALS       DESIGN §11.3 natural / drift / wreck materials, plus fuels (§10.3), tinder (§10.1), boards (§22.9)
//   3. ANIMAL PARTS    hide sinew bone horn fat feather (§22.4)
//   4. FOODS           §7.1 + §20.4 split (toxic look-alikes) + §22.5 fish species + §22.4 meat cuts
//   5. HERBS           §6.4 medicines (`med`) and the poisonous herb numb_weed
//   6. STARTERS        §3 + §21 take-along items (each has `starter: { star, score, p }`), their kit contents and
//                      the medkit pieces; clothes_base, watch, diary (shared start equipment)
//   7. API             itemDef(id, stack) / attrsOf(stack) / isFood(id) / starterItems()
//
// Conventions: attrs are 0–10 integers (zeros omitted). weight in kg. q = default quality range when found
// (natural 35–65, drift 40–80, wreck 50–85, take-along 95). fuel = fuelH added to a fire (§10.3);
// tinder = tinder multiplier (§10.1); board = friction-board multiplier (§22.9).
// food.decay = freshness lost per hour at 25 C; food.thick = cooking thickness (§7.3: 1.5 / 1.0 / 0.6);
// food.rawPenalty = morale when eaten raw; food.poison = { id, chance, sev:[a,b], hp, heatKills, incubation(h) }.
// Extra (non-schema) keys used here: `species` (fish -> nutrition class id), `kit` (what a starter bundle unpacks to),
// `perk` (numbers read by systems for take-along bonuses), `recover`, `start`, `grade`.
import { CRAFTED } from './crafted.js';

// ---------------------------------------------------------------- 1. helpers
const A = (s) => {
  const o = {};
  for (const m of (s || '').trim().split(/\s+/)) {
    if (!m) continue;
    const r = /^([a-z]+)(\d+)$/.exec(m);
    if (!r) throw new Error('bad attr token ' + m);
    o[r[1]] = +r[2];
  }
  return o;
};
const Q_NATURAL = [35, 65], Q_DRIFT = [40, 80], Q_WRECK = [50, 85], Q_TAKE = [95, 95];
const defStack = (w) => (w <= 0.05 ? 50 : w <= 0.3 ? 20 : w <= 1 ? 10 : w <= 3 ? 4 : 2);

export const ITEMS = {};
const add = (id, d) => { ITEMS[id] = { cat: 'material', tags: [], q: Q_NATURAL, p: 'P0', ...d }; return ITEMS[id]; };

// material: attrs given as a string like 'burn7 tinder2'
function mat(id, name, icon, attrs, weight, p, tags, extra = {}) {
  return add(id, { name, icon, weight, attrs: A(attrs), tags: tags || [], stack: defStack(weight), p, ...extra });
}

// food: f = { food, water, B, parasite, decay, w }
function food(id, name, icon, f, p, extra = {}) {
  const { food: fd, water, B, parasite = 0, decay, w, thick = 1.0, flesh = false, ...fx } = f;
  const attrs = { edible: Math.min(10, Math.round(fd / 4)), ...(flesh ? { scent: 5 } : {}), ...(extra.attrs || {}) };
  const { attrs: _a, food: foodExtra = {}, ...rest } = extra;
  return add(id, {
    name, icon, cat: 'food', weight: w, attrs, tags: ['food', ...(rest.tags || [])], stack: defStack(w), p,
    food: { food: fd, water, B, parasite, decay, thick, rawPenalty: 0, mustCook: false, cookable: true, ...fx, ...foodExtra },
    guide: id, ...rest, tags: ['food', ...(rest.tags || [])],
  });
}
const CRUST = { rawPenalty: -3 };

// ---------------------------------------------------------------- 2. MATERIALS (§11.3)
// wood and plant matter
mat('twig', '小枝', '🌿', 'burn7 tinder2 long2 hard2', 0.05, 'P0', ['wood'], { fuel: 0.25, tinder: 0.15, board: 0.3, desc: '火おこしの最初の燃料。どこでも拾える。' });
mat('branch', '枝', '🪵', 'hard4 long5 burn6', 0.4, 'P0', ['wood'], { fuel: 0.75, board: 1.0, desc: '基本の燃料。削れば杭や柄になる。' });
mat('pole', '長い棒', '📏', 'hard5 long8 burn5 flex2', 0.9, 'P0', ['wood'], { fuel: 0.75, board: 1.0, desc: 'まっすぐな長い棒。槍や竿の元。' });
mat('bent_wood', '曲がり木', '🪃', 'hard5 long8 flex7', 0.8, 'P0', ['wood'], { fuel: 0.75, board: 0.5, desc: 'しなる若木。弓の材料。' });
mat('log', '丸太', '🪵', 'hard6 long9 heavy9 burn8 float6', 12, 'P0', ['wood'], { fuel: 5.0, stack: 1, desc: '重い丸太。割れば薪、並べればいかだ。' });
mat('plank', '板', '🟫', 'hard6 long7 heavy5 burn7 float5', 3, 'P1', ['wood'], { fuel: 1.5, board: 1.0, desc: '丸太を割った板。床や壁になる。' });
mat('bamboo', '竹', '🎋', 'hard6 long9 flex5 container5 float7 burn5 waterproof6', 1.5, 'P0', ['wood', 'plant'], { fuel: 0.6, board: 1.2, container: { liters: 0.5, heatproof: false, maxBoils: 3 }, desc: '筒にも棒にもなる。燃やすとはぜる。' });
mat('bamboo_strip', '竹ひご', '🥢', 'flex8 long7 hard3 fiber2', 0.1, 'P1', ['wood', 'plant'], { fuel: 0.1, desc: '竹を割った細い材。編み物や罠に。' });
mat('vine', 'つる', '🌱', 'fiber6 flex7 long8', 0.2, 'P0', ['plant', 'fiber'], { fuel: 0.1, desc: '密林のつる。縛る・編むのに使う。' });
mat('palm_leaf', 'ヤシの葉', '🌴', 'fiber4 waterproof5 insul4 burn5 long6 flex5', 0.3, 'P0', ['leaf', 'plant'], { fuel: 0.4, desc: '屋根や敷物、編み物の材料。' });
mat('big_leaf', '大きな葉', '🍃', 'waterproof6 insul2 flex6 container1', 0.1, 'P0', ['leaf', 'plant'], { fuel: 0.05, desc: 'バナナやタロの葉。包む・受ける。' });
mat('palm_fiber', 'ヤシの繊維', '🧶', 'fiber5 tinder8 burn7 absorb3 insul3', 0.05, 'P0', ['plant', 'fiber'], { fuel: 0.05, tinder: 1.1, desc: 'ヤシ殻の繊維。最良の火口にもなる。' });
mat('coconut_shell', 'ヤシ殻', '🥥', 'container4 hard5 burn6 waterproof8 float4', 0.2, 'P0', ['plant'], { fuel: 1.0, container: { liters: 0.25, heatproof: false, maxBoils: 3 }, desc: '半分に割った殻。器や燃料に。' });
mat('bark', '樹皮', '🟤', 'fiber3 burn6 tinder4 waterproof4 container1 insul3', 0.3, 'P0', ['wood', 'plant'], { fuel: 0.3, tinder: 0.6, desc: '木の皮。内皮をもめば火口になる。' });
mat('dry_grass', '枯れ草', '🌾', 'tinder7 burn8 fiber2 insul5', 0.1, 'P0', ['plant'], { fuel: 0.05, tinder: 1.0, desc: '乾いた草。鳥の巣状に丸めて火口に。' });
mat('green_grass', '草・シダ', '🌿', 'fiber3 insul3 absorb2', 0.1, 'P0', ['plant'], { tinder: 0.3, desc: '生の草。寝床や詰め物に。' });
mat('wood_shavings', '木くず', '🪚', 'tinder6 burn8', 0.02, 'P0', ['wood'], { fuel: 0.05, tinder: 0.7, desc: '削りかす。細かく乾いた火口。' });
mat('thorn', '大きなトゲ', '📌', 'sharp7 hard3 long1', 0.01, 'P0', ['plant'], { desc: '密林のトゲ。針や釣り針の元。' });
mat('driftwood', '流木', '🪵', 'hard4 long5 burn7 float7', 0.6, 'P0', ['wood'], { q: Q_DRIFT, fuel: 1.5, board: 1.1, desc: '浜の流木。乾いていれば良い燃料。' });
// stone, earth
mat('stone', '丸石', '🪨', 'hard8 heavy6', 1.0, 'P0', ['stone'], { stack: 8, desc: '川や浜の丸い石。叩く・砕く・重しに。' });
mat('flat_stone', '平たい石', '🪨', 'hard8 heavy8 heatproof9', 3.0, 'P0', ['stone'], { desc: '火にかけられる石。石板焼きに。' });
mat('flint', '火打ち石', '🔶', 'hard9 sharp5 spark7', 0.4, 'P0', ['stone'], { stack: 8, desc: 'チャート。割れば刃、打てば火花。' });
mat('obsidian', '黒曜石', '⬛', 'hard7 sharp9 shine4', 0.3, 'P1', ['stone', 'glass'], { desc: '岩山の頂上で見つかる最高の刃。' });
mat('coral_stone', 'サンゴ石', '🪸', 'hard5 absorb4 heavy4', 0.8, 'P1', ['stone'], { desc: '軽くて穴だらけの石。ろ過に使える。' });
mat('clay', '粘土', '🟫', 'sticky5 waterproof6 heatproof8 heavy6', 1.0, 'P0', ['stone'], { stack: 8, desc: '川や湿地の粘土。焼けば器になる。' });
mat('sand', '砂', '🏖️', 'absorb5 heavy5 heatproof6', 1.0, 'P0', ['stone'], { stack: 8, desc: '浜と川の砂。ろ過の層に。' });
mat('mud', '泥', '🟤', 'sticky3 insul3 waterproof3 scent2', 1.0, 'P1', [], { stack: 8, desc: '湿地の泥。塗り壁や虫よけに。' });
mat('charcoal', '炭', '⚫', 'burn9 absorb9 med3', 0.1, 'P0', ['wood'], { fuel: 3.0, desc: '煙が出ない燃料。毒の吸着にも。' });
mat('ash', '灰', '🌫️', 'absorb4', 0.1, 'P1', [], { desc: '火の跡の灰。' });
// shells, salt
mat('shell', '貝殻', '🐚', 'hard5 sharp4 shine4 container1', 0.05, 'P0', ['shell'], { desc: '浜の貝殻。削る・すくう・光る。' });
mat('big_shell', '大きな貝殻', '🐚', 'container4 hard6 heatproof5 sharp3', 0.8, 'P1', ['shell'], { container: { liters: 1.0, heatproof: true, maxBoils: 10 }, desc: 'シャコガイ。鍋にもなる大きな殻。' });
mat('salt', '塩', '🧂', '', 0.1, 'P1', ['salt'], { desc: '保存と味付けに。海水を煮つめて作る。' });
// resin, wax
mat('resin', '樹脂', '🍯', 'sticky8 burn8 waterproof7 tinder3 scent3', 0.1, 'P1', ['plant'], { fuel: 0.3, desc: 'ねばねばの樹液。接着と防水と着火剤。' });
mat('beeswax', '蜜ろう', '🕯️', 'waterproof8 sticky4 burn6', 0.1, 'P1', [], { fuel: 0.3, desc: '蜂の巣のろう。防水とろうそくに。' });
// drift finds (40-80)
mat('plastic_bottle', 'ペットボトル', '🧴', 'container6 waterproof10 float8 shine3', 0.05, 'P0', ['plastic'], { q: Q_DRIFT, container: { liters: 0.5, heatproof: false, maxBoils: 0 }, desc: '漂着物。水を運べ、ウキにもなる。' });
mat('can', '空き缶', '🥫', 'container4 heatproof8 hard5 shine7 sharp3 waterproof10', 0.05, 'P0', ['metal'], { q: Q_DRIFT, container: { liters: 0.35, heatproof: true, maxBoils: 99 }, desc: '漂着物。火にかけて煮沸できる小鍋。' });
mat('glass_bottle', 'ガラス瓶', '🍾', 'container6 waterproof10 hard5 shine6', 0.4, 'P1', ['glass'], { q: Q_DRIFT, container: { liters: 0.6, heatproof: false, maxBoils: 0 }, desc: '丈夫な瓶。割ればガラス片になる。' });
mat('glass_shard', 'ガラス片', '🔹', 'sharp8 hard5 shine6', 0.05, 'P1', ['glass'], { q: Q_DRIFT, desc: '瓶を割った破片。切れ味は鋭い。' });
mat('cloth', '布切れ', '🧣', 'fiber5 absorb6 insul4 burn6 tinder3 flex6', 0.1, 'P0', ['cloth'], { q: Q_DRIFT, fuel: 0.1, tinder: 0.8, desc: '漂着した布。包帯、ろ過、火口に。' });
mat('rope_scrap', 'ロープ片', '🪢', 'fiber8 long6 flex5', 0.2, 'P0', ['fiber', 'cloth'], { q: Q_DRIFT, desc: '漂着したロープの切れ端。' });
mat('net_scrap', '網の切れ端', '🕸️', 'fiber7 flex6', 0.3, 'P1', ['fiber'], { q: Q_DRIFT, desc: '網の破片。つなげば漁具になる。' });
mat('tarp', 'ブルーシート', '🟦', 'waterproof10 fiber4 flex6 insul2', 0.8, 'P1', ['plastic', 'cloth'], { q: Q_DRIFT, desc: 'めったに漂着しない防水シート。' });
// rare drift finds (events: the washed-up crate)
mat('float', 'ブイの 浮き', '🛟', 'float8 shine3', 0.2, 'P1', ['plastic'], { q: Q_DRIFT, desc: '漂着した 浮き。ウキや いかだに。' });
add('lighter', { name: '使い捨てライター', icon: '🔥', cat: 'tool', weight: 0.02, tags: ['plastic', 'metal'], q: [60, 80], stack: 1, p: 'P1', attrs: { spark: 6 }, tool: { kind: 'fire', durability: 50, view: 'flint' }, perk: { fireBase: 0.95, wetResist: 0.2 }, desc: '漂着した ライター。濡れると つきにくい。' });
add('blanket', { name: '毛布', icon: '🧣', cat: 'clothing', weight: 1.0, tags: ['cloth'], q: [50, 80], stack: 1, p: 'P1', attrs: { insul: 7, fiber: 4, absorb: 5, burn: 5 }, wear: { slot: 'bed', insul: 4, rain: 0, sun: 0, days: 60 }, desc: '漂着した 毛布。寝る ときに 暖かい。' });
food('canned_food', '缶詰', '🥫', { food: 30, water: 6, B: 0.0, decay: 0, w: 0.4, thick: 1.0, flesh: false }, 'P1', { desc: '漂着した 缶詰。開ければ 安全に 食べられる。', tags: ['food', 'metal'] });
mat('sandal', 'ビーチサンダル', '🩴', 'float5 insul3 flex4', 0.15, 'P2', ['plastic'], { q: Q_DRIFT, wear: { slot: 'feet', insul: 0, rain: 0, sun: 0, days: 10 }, desc: '片方だけのサンダル。足を守る。' });
// wreck finds (50-85)
mat('metal_scrap', '金属片', '🔩', 'hard9 sharp5 heavy5 heatproof9 shine5 spark3', 0.5, 'P1', ['metal', 'steel'], { q: Q_WRECK, desc: '難破船の金属片。刃や鋼になる。' });
mat('nail', '釘', '📍', 'hard9 sharp6 long1', 0.02, 'P1', ['metal', 'steel'], { q: Q_WRECK, desc: '難破船や流木の釘。針や鋼に。' });
mat('wire', '針金', '➰', 'fiber6 hard7 flex4', 0.05, 'P1', ['metal'], { q: Q_WRECK, desc: '針金。罠や釣り針の材料。' });
mat('sailcloth', '帆布', '⛵', 'waterproof7 fiber6 insul4 flex5', 2.0, 'P1', ['cloth'], { q: Q_WRECK, desc: '厚い帆布。屋根や服の材料。' });
// fuels without another table
mat('firewood', '薪', '🪵', 'hard5 burn8 long4 heavy3', 2.5, 'P0', ['wood'], { fuel: 2.0, board: 1.0, stack: 8, desc: '丸太を割った薪。中火以上の燃料。' });
mat('green_wood', '生木', '🌳', 'hard4 burn3 long5 heavy3', 1.5, 'P0', ['wood'], { fuel: 1.0, board: 0.1, desc: '生の木。濃い煙が出る。狼煙や燻製に。' });
for (const id of ['firewood', 'green_wood']) ITEMS[id].cat = 'fuel';

// ---------------------------------------------------------------- 3. ANIMAL PARTS (§11.3, §22.4)
mat('hide', '皮', '🟫', 'insul8 waterproof5 fiber3 flex5', 2.0, 'P0', ['hide'], { stack: 4, desc: '獣の皮。5日で腐る。なめせば服に。' });
mat('sinew', '腱', '🧵', 'fiber9 flex6 long4', 0.05, 'P1', ['fiber'], { desc: '獣の腱。最強の糸。弦や縫い糸に。' });
mat('bone', '骨', '🦴', 'hard6 sharp3 long4', 0.2, 'P0', ['bone'], { desc: '獣の骨。針、錐、釣り針の元。' });
mat('horn', '角・牙', '🦷', 'hard7 sharp6 long3', 0.3, 'P1', ['bone'], { desc: 'ヤギの角やイノシシの牙。' });
mat('feather', '羽根', '🪶', 'insul5 float3 shine2', 0.01, 'P0', ['feather'], { desc: '鳥の羽根。矢羽根・ウキ・詰め物に。' });

// ---------------------------------------------------------------- 4. FOODS (§7.1, §20.4, §22.4, §22.5)
// -- fruit, plants (coconut stage is a stack property: see food.stage)
food('coconut', 'ヤシの実', '🥥', { food: 12, water: 20, B: 0.005, decay: 0.1, w: 1.2, cookable: false },
  'P0', { desc: '割って飲む。若い実は水、熟れた実は果肉。', tags: ['plant'], food: {
    opensTo: ['coconut_open', 'coconut_shell'], stage: {
      green: { food: 4, water: 30, label: '若い実' }, brown: { food: 16, water: 10, label: '熟した実' } },
    perDayLimit: 4, perDayDiarrhea: 0.2 } });
food('coconut_open', '開けたヤシの実', '🥥', { food: 12, water: 20, B: 0.01, decay: 2.0, w: 0.9, cookable: false },
  'P0', { desc: '穴を開けた実。水は傷みやすい。', tags: ['plant'], guide: 'coconut', food: { stage: { green: { food: 4, water: 30 }, brown: { food: 16, water: 10 } } } });
food('coconut_meat', 'ヤシの果肉', '🥥', { food: 16, water: 2, B: 0.01, decay: 2.0, w: 0.3, cookable: false },
  'P0', { desc: '割った実の白い果肉。腹持ちが良い。', tags: ['plant'], guide: 'coconut' });
food('banana', '野生のバナナ', '🍌', { food: 10, water: 3, B: 0.01, decay: 1.2, w: 0.15, cookable: false },
  'P0', { desc: '青いと半分の栄養。3日で熟す。', tags: ['plant'], food: { unripe: { food: 5 }, ripenDays: 3 } });
food('berry', '野イチゴ', '🍓', { food: 4, water: 2, B: 0.02, decay: 2.0, w: 0.05, cookable: false },
  'P0', { desc: '下向きに実る赤い実。つぶすと甘い。', tags: ['plant'] });
food('red_berry_toxic', 'ドクベニの実', '🍒', { food: 4, water: 2, B: 0.02, decay: 2.0, w: 0.05, cookable: false },
  'P0', { desc: '上向きに実る赤い実。毒。青くさい。', tags: ['plant'], food: {
    poison: { id: 'vomit', chance: 0.7, sev: [1, 2], hp: 10, heatKills: false, incubation: 0, duration: 12 } } });
food('guava', 'グァバの実', '🍈', { food: 6, water: 2, B: 0.02, decay: 1.5, w: 0.1, cookable: false },
  'P1', { desc: '黄緑の甘い実。', tags: ['plant'] });
food('breadfruit', 'パンノキの実', '🍈', { food: 18, water: 2, B: 0.02, decay: 0.8, w: 1.0, thick: 0.6 },
  'P1', { desc: 'でこぼこの緑の実。生は腹痛。必ず加熱。', tags: ['plant'], food: {
    mustCook: true, poison: { id: 'stomachache', chance: 0.6, sev: [1, 1], hp: 0, heatKills: true, incubation: 0, duration: 4, halfCooked: 0.2 } } });
food('taro', 'タロイモ', '🥔', { food: 16, water: 1, B: 0.02, decay: 0.3, w: 0.5, thick: 0.6 },
  'P0', { desc: '葉はつや消し。生は口がしびれる。加熱必須。', tags: ['plant'], food: {
    mustCook: true, poison: { id: 'plant_poison', chance: 0.9, sev: [1, 1], hp: 0, heatKills: true, incubation: 0, duration: 1 } } });
food('false_taro', 'クワズイモ', '🥔', { food: 16, water: 1, B: 0.02, decay: 0.3, w: 0.5, thick: 0.6 },
  'P0', { desc: 'つやつや葉のそっくりな毒芋。焼いても毒。', tags: ['plant'], food: {
    mustCook: true, poison: { id: 'numb_mouth', chance: 0.8, sev: [1, 1], hp: 0, heatKills: false, incubation: 0, duration: 6 } } });
food('seaweed', '海藻', '🌿', { food: 5, water: 1, B: 0.03, decay: 1.5, w: 0.1, cookable: false },
  'P0', { desc: '干せば塩気のある保存食。', tags: ['plant'] });
food('wild_greens', '野草', '🥬', { food: 3, water: 1, B: 0.03, decay: 2.5, w: 0.05, cookable: false },
  'P1', { desc: '食べられる葉。栄養の偏り防止。', tags: ['plant'] });
// -- mushrooms (§20.4: look-alike pair mushroom_c / mushroom_toxic)
const MUSH = { food: 6, water: 1, B: 0.08, decay: 2.0, w: 0.05 };
food('mushroom_a', 'キクラゲ', '🍄', MUSH, 'P0', { desc: '倒木に生える茶色い耳。似た毒はない。', tags: ['plant'] });
food('mushroom_b', 'ヒラタケ', '🍄', MUSH, 'P0', { desc: '木に重なって生える灰色のキノコ。', tags: ['plant'] });
food('mushroom_c', 'シロカサタケ', '🍄', MUSH, 'P0', { desc: '地面の白いキノコ。毒にそっくり。', tags: ['plant'] });
food('mushroom_toxic', 'ドクツボタケ', '🍄', MUSH, 'P0', { desc: '根元にふくろがある。猛毒。', tags: ['plant'], food: {
  poison: { id: 'toxic_mushroom', chance: 0.85, sev: [2, 3], hp: 24, heatKills: false, incubation: 2, duration: 12, hallucination: 6, sev3: 0.15 } } });
// -- shellfish, crustaceans
food('shellfish', '貝', '🐚', { food: 6, water: 1, B: 0.18, decay: 5.0, w: 0.1, thick: 1.5 },
  'P0', { desc: 'カサガイや二枚貝。干潮に拾える。エサにも。', tags: ['shell'] });
food('red_tide_shellfish', '赤潮の貝', '🐚', { food: 6, water: 1, B: 0.18, decay: 5.0, w: 0.1, thick: 1.5 },
  'P1', { desc: '赤潮の海の貝。加熱しても毒。', tags: ['shell'], guide: 'shellfish', food: {
    poison: { id: 'red_tide', chance: 0.3, sev: [1, 2], hp: 24, heatKills: false, incubation: 1, duration: 12 } } });
food('crab', 'カニ', '🦀', { food: 10, water: 1, B: 0.20, parasite: 0.03, decay: 5.0, w: 0.3, ...CRUST },
  'P0', { desc: '岩礁や浜のカニ。焼くか煮る。', tags: ['fish'], attrs: { scent: 5 } });
food('coconut_crab', 'ヤシガニ', '🦀', { food: 26, water: 1, B: 0.20, decay: 5.0, w: 1.5, ...CRUST },
  'P1', { desc: 'ヤシ林の夜の大ガニ。はさまれると切れる。', tags: ['fish'], attrs: { scent: 5 } });
food('urchin', 'ウニ', '🦔', { food: 5, water: 1, B: 0.06, decay: 6.0, w: 0.2 },
  'P1', { desc: 'トゲが動けば生きている。素手は刺さる。', tags: ['shell'] });
food('octopus', 'タコ', '🐙', { food: 16, water: 1, B: 0.10, decay: 5.0, w: 0.8, ...CRUST },
  'P1', { desc: '潮だまりやサンゴ礁にいる。', tags: ['fish'], attrs: { scent: 5 } });
food('lobster', '伊勢エビ', '🦞', { food: 20, water: 1, B: 0.15, decay: 5.0, w: 0.6, ...CRUST },
  'P1', { desc: '夜のサンゴ礁の高級品。気力が上がる。', tags: ['fish'], attrs: { scent: 5 }, food: { moraleBonus: 6 } });
// -- fish: the five nutrition classes (§7.1), species below point to them
const FISH = {
  fish_s: { food: 12, water: 2, B: 0.10, parasite: 0.02, decay: 6.0, w: 0.2, thick: 1.5 },
  fish_m: { food: 22, water: 3, B: 0.12, parasite: 0.03, decay: 6.0, w: 0.8 },
  fish_l: { food: 40, water: 4, B: 0.12, parasite: 0.03, decay: 6.0, w: 3.0, thick: 0.6 },
  river_fish: { food: 14, water: 2, B: 0.10, parasite: 0.25, decay: 6.0, w: 0.3 },
  puffer: { food: 14, water: 2, B: 0.10, parasite: 0, decay: 6.0, w: 0.5 },
};
const fishFlesh = { flesh: true, ...CRUST };
food('fish_s', '小魚', '🐟', { ...FISH.fish_s, ...fishFlesh }, 'P0', { desc: '入り江や川の小魚。エサにもなる。', tags: ['fish'], stack: 20, species: 'fish_s' });
food('fish_m', '中くらいの魚', '🐟', { ...FISH.fish_m, ...fishFlesh }, 'P0', { desc: '入り江や岩礁の中型魚。', tags: ['fish'], species: 'fish_m' });
food('fish_l', '大きな魚', '🐟', { ...FISH.fish_l, ...fishFlesh }, 'P0', { desc: '沖の大物。4切れに分けられる。', tags: ['fish'], stack: 2, species: 'fish_l', food: { cuts: 4, cutItem: 'fish_fillet' } });
food('river_fish', '川魚', '🐟', { ...FISH.river_fish, ...fishFlesh }, 'P1', { desc: '川魚。生は寄生虫が多い。', tags: ['fish'], species: 'river_fish' });
food('puffer', 'ハリセン魚', '🐡', { ...FISH.puffer, ...fishFlesh }, 'P1', { desc: '丸くふくらむ毒魚。加熱しても毒。', tags: ['fish'], species: 'puffer', food: {
  poison: { id: 'fugu', chance: 0.6, sev: [2, 3], hp: 48, heatKills: false, incubation: 1, duration: 8, detoxChance: 0.7, detoxPoison: 0.08, sev3: 0.25 } } });
food('fish_fillet', '魚の切り身', '🍣', { food: 10, water: 1, B: 0.12, parasite: 0.03, decay: 6.0, w: 0.75, ...fishFlesh },
  'P0', { desc: '大魚を切り分けた身。', tags: ['fish'], guide: 'fish_l', species: 'fish_l' });
// -- fish species (§22.5): nutrition copied from the class they point to
function species(id, name, icon, of, desc, over = {}, extraFood = {}) {
  const b = FISH[of];
  const { w = b.w, ...fv } = over;
  return food(id, name, icon, { ...b, ...fishFlesh, ...fv, w }, 'P0',
    { desc, tags: ['fish'], species: of, stack: of === 'fish_l' ? 2 : of === 'fish_s' ? 20 : 10, guide: id, food: extraFood });
}
species('sardine', 'イワシ', '🐟', 'fish_s', '入り江に群れる小魚。朝と夕に食う。');
species('wrasse', 'ベラ', '🐠', 'fish_s', '岩礁の際にいる小魚。日中に釣れる。');
species('jack', 'アジ', '🐟', 'fish_m', '朝夕まずめに釣れる中型魚。');
species('seabream', 'クロダイ', '🐟', 'fish_m', '岩礁の中型魚。カニや貝を食う。');
species('grouper', 'ハタ', '🐟', 'fish_l', '夜に深みで釣れる大物の根魚。');
species('trevally', 'カスミアジ', '🐟', 'fish_l', '朝まずめの回遊魚。光る餌に食いつく。');
species('goby', 'ハゼ', '🐟', 'river_fish', '河口やよどみの小さな川魚。');
species('eel', 'ウナギ', '🐍', 'river_fish', '滝つぼの夜の大ウナギ。身が厚い。', { food: 24, w: 0.6 });
// -- eggs, insects, honey, fat
food('sugarcane', 'サトウキビ', '🎋', { food: 5, water: 6, B: 0.01, decay: 0.5, w: 0.4, thick: 1.0, flesh: false }, 'P1', { desc: 'かじると甘い汁。気力が少し上がる。', tags: ['food', 'plant'], attrs: { long: 6, fiber: 2, burn: 4 } });
food('egg', '海鳥の卵', '🥚', { food: 8, water: 2, B: 0.08, decay: 1.0, w: 0.06, thick: 1.5 }, 'P0', { desc: '岩山や浜の巣の卵。取ると親鳥につつかれる。', tags: ['food'] });
food('grub', '幼虫', '🐛', { food: 5, water: 1, B: 0.10, parasite: 0.05, decay: 3.0, w: 0.02, thick: 1.5, flesh: false, rawPenalty: -8 },
  'P1', { desc: '朽ち木の幼虫。焼くと食べられる。最高のエサ。', tags: ['food'], attrs: { scent: 6 } });
food('honey', 'ハチミツ', '🍯', { food: 15, water: 0, B: 0, decay: 0, w: 0.3, cookable: false },
  'P1', { desc: '腐らない甘味。傷にぬると感染が軽くなる。', tags: ['food'], attrs: { med: 4 }, med: { type: 'antiseptic', power: 5, use: 'apply' }, food: { moraleBonus: 8, infectionMul: 0.5 } });
food('fat', '脂身', '🧈', { food: 8, water: 0, B: 0.20, decay: 2.0, w: 0.3 },
  'P1', { desc: '解体でとれる脂。ランプ・石けん・防水に。', tags: ['food', 'meat'], attrs: { burn: 7, waterproof: 5, edible: 3, sticky: 2, scent: 4 }, fuel: 0.3 });
// -- meat (§7.1) and cuts (§22.4). flesh -> scent 5
const MEAT = { flesh: true, ...CRUST };
food('bird_meat', '鳥の肉', '🍗', { food: 20, water: 2, B: 0.30, parasite: 0.02, decay: 4.0, w: 0.6, ...MEAT }, 'P0', { desc: '海鳥や野鶏の肉。羽根も取れる。', tags: ['meat'], guide: 'seabird' });
food('small_game', '小動物の肉', '🥩', { food: 10, water: 1, B: 0.25, parasite: 0.05, decay: 4.0, w: 0.3, ...MEAT }, 'P1', { desc: 'ネズミやトカゲの肉。', tags: ['meat'] });
food('snake_meat', 'ヘビの肉', '🥩', { food: 14, water: 1, B: 0.25, parasite: 0.08, decay: 4.0, w: 0.4, ...MEAT }, 'P1', { desc: 'ヘビの肉。皮も使える。', tags: ['meat'], guide: 'viper' });
food('goat_meat', 'ヤギの肉', '🥩', { food: 26, water: 2, B: 0.28, parasite: 0.04, decay: 4.0, w: 1.0, ...MEAT }, 'P0', { desc: 'ヤギ1切れ。1頭で8切れ取れる。', tags: ['meat'], guide: 'goat' });
food('boar_meat', 'イノシシの肉', '🥩', { food: 28, water: 2, B: 0.35, parasite: 0.30, decay: 4.0, w: 1.0, ...MEAT }, 'P0', { desc: 'イノシシ1切れ。生は寄生虫が多い。', tags: ['meat'], guide: 'boar' });
food('organ_meat', '内臓肉', '🫀', { food: 10, water: 1, B: 0.30, parasite: 0.04, decay: 8.0, w: 0.3, ...MEAT }, 'P0', { desc: 'レバーやハツ。栄養豊富だが傷みが速い。', tags: ['meat'], attrs: { scent: 9 }, guide: 'goat' });
food('marrow', '骨髄', '🦴', { food: 4, water: 0, B: 0.10, decay: 2.0, w: 0.05, ...MEAT }, 'P1', { desc: '斧で割った骨の髄。少しだけ腹にたまる。', tags: ['meat', 'bone'], guide: 'goat' });

// ---------------------------------------------------------------- 5. HERBS (§6.4, §7.5)
function herb(id, name, icon, w, medAttr, med, p, desc, extra = {}) {
  return add(id, {
    name, icon, cat: 'herb', weight: w, attrs: { med: medAttr, scent: 3, ...(extra.attrs || {}) }, tags: ['plant', 'herb'],
    stack: defStack(w), med, guide: id, p, desc, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'attrs')),
  });
}
herb('aloe', 'アロエ', '🪴', 0.2, 7, { type: 'burn', power: 7, use: 'apply' }, 'P0', 'やけど・日焼け・刺し毒の痛みに。', { attrs: { absorb: 2, scent: 1 } });
herb('yomogi', 'ヨモギ', '🌿', 0.05, 7, { type: 'hemostat', power: 7, use: 'apply' }, 'P0', 'もんで当てれば止血。感染率も下がる。', { attrs: { edible: 1 }, tinder: 0.3 });
herb('dokudami', 'ドクダミ', '🌿', 0.05, 6, { type: 'poultice', power: 6, use: 'apply' }, 'P0', '生ぐさい葉。化膿の湿布に。', { attrs: { scent: 5 } });
herb('ginger', '野生のショウガ', '🫚', 0.1, 7, { type: 'cold', power: 7, use: 'tea' }, 'P0', '根を煮て茶に。風邪と吐き気に。', { attrs: { edible: 1, scent: 6 } });
herb('guava_leaf', 'グァバの葉', '🍃', 0.05, 6, { type: 'diarrhea', power: 6, use: 'tea' }, 'P1', '茶にして下痢を抑える。');
herb('turmeric', 'ウコン', '🟠', 0.1, 7, { type: 'antitoxin', power: 7, use: 'apply' }, 'P1', '湿布にして毒を軽くする。', { attrs: { scent: 4 } });
herb('cinchona', 'キナの樹皮', '🌳', 0.1, 8, { type: 'fever', power: 8, use: 'tea' }, 'P1', '苦い樹皮の煎じ薬。島熱の治療。', { attrs: { fiber: 2 } });
herb('neem_fruit', 'センダンの実', '🟡', 0.05, 6, { type: 'dewormer', power: 6, use: 'tea' }, 'P1', '炭と煎じて虫くだしに。生は毒。', { attrs: { toxic: 3 }, food: { food: 2, water: 0, B: 0, parasite: 0, decay: 0.5, thick: 1.0, rawPenalty: 0, mustCook: false, cookable: false,
  poison: { id: 'mild_poison', chance: 0.5, sev: [1, 1], hp: 0, heatKills: false, incubation: 1, duration: 4 } } });
herb('lemongrass', 'レモングラス', '🌾', 0.05, 2, { type: 'repellent', power: 6, use: 'apply' }, 'P1', 'レモンの香り。体にこすって虫よけに。', { attrs: { scent: 7, edible: 1 } });
herb('charcoal_powder', '炭の粉', '⚫', 0.1, 6, { type: 'adsorb', power: 7, use: 'eat' }, 'P0', '水で飲めば食中毒や毒を吸着。', { attrs: { absorb: 9, burn: 9 }, tags: ['plant', 'herb'] });
mat('numb_weed', 'シビレ草', '🌿', 'toxic8 scent2', 0.05, 'P1', ['plant'], { cat: 'herb', guide: 'numb_weed', desc: 'ヨモギに似た毒草。矢やエサに塗る。',
  food: { food: 1, water: 0, B: 0, parasite: 0, decay: 2.0, thick: 1.0, rawPenalty: 0, mustCook: false, cookable: false,
    poison: { id: 'vomit', chance: 0.8, sev: [1, 1], hp: 0, heatKills: false, incubation: 0, duration: 6, woundWorse: 2 } } });
ITEMS.numb_weed.p = 'P0';

// ---------------------------------------------------------------- 6. STARTERS (§3, §21) — each has starter: { star, score, p }
function starter(id, name, icon, cat, weight, star, score, p, extra = {}) {
  return add(id, { name, icon, cat, weight, attrs: {}, tags: [], stack: 1, q: Q_TAKE, p, starter: { star, score, p }, guide: id, ...extra });
}
starter('knife', 'サバイバルナイフ', '🔪', 'tool', 0.3, 2, 1.0, 'P0', {
  attrs: A('hard8 sharp9 long1 spark3'), tags: ['metal', 'steel'],
  tool: { kind: 'blade', durability: 400, sharp: 9, chop: 3, melee: 12, power: 0, range: 1.5, view: 'knife' },
  perk: { craftSharpQ: 20, butcherMeat: 0.3, harvestSpeed: 2, sparkChance: 0.55 }, desc: '万能の工作刀。削る・さばく・火花も出せる。' });
starter('axe', '手斧', '🪓', 'tool', 1.2, 2, 1.0, 'P0', {
  attrs: A('hard9 sharp5 heavy5 long3 spark2'), tags: ['metal', 'steel', 'wood'],
  tool: { kind: 'axe', durability: 500, sharp: 5, chop: 18, melee: 25, power: 0, range: 1.6, view: 'axe' },
  perk: { fellSpeed: 3, buildTime: 0.6, logHits: 6 }, desc: '伐採3倍。建築が速い。薪割りも楽。' });
starter('bow', '弓と矢', '🏹', 'weapon', 0.8, 3, 1.0, 'P0', {
  attrs: A('flex8 long7 hard4 fiber3'), tags: ['wood', 'fiber'],
  tool: { kind: 'bow', durability: 300, sharp: 0, chop: 0, melee: 2, power: 30, range: 40, view: 'bow' },
  kit: { arrow_pro: 10 }, desc: '射程40m。矢10本つき。狩りの島。' });
starter('rifle', '猟銃', '🔫', 'weapon', 3.0, 3, 1.0, 'P0', {
  attrs: A('hard8 heavy5 long5'), tags: ['metal', 'wood'],
  tool: { kind: 'gun', durability: 99999, sharp: 0, chop: 0, melee: 8, power: 80, range: 120, view: 'rifle' },
  kit: { ammo: 'setup' }, ammoVariants: { 12: { star: 3, score: 1.0 }, 30: { star: 2, score: 0.9 }, inf: { star: 1, score: 0.7 } },
  perk: { sparkChance: 0.9, scareRadius: 150, scareHours: 6 }, desc: '射程120m。弾の火薬で着火もできる。' });
starter('rod', '釣り竿', '🎣', 'tool', 0.5, 2, 1.0, 'P0', {
  attrs: A('flex8 long8 hard3 fiber2'), tags: ['wood', 'fiber'],
  tool: { kind: 'rod', durability: 150, sharp: 0, chop: 0, melee: 1, power: 10, range: 8, view: 'rod' },
  kit: { hook_pro: 3 }, perk: { lineStrength: 10, hookUses: 40 }, desc: '糸・針3本・ウキつき。大物にも耐える。' });
starter('net', '投網', '🕸️', 'tool', 1.5, 2, 1.0, 'P0', {
  attrs: A('fiber7 flex6 heavy2'), tags: ['fiber'],
  tool: { kind: 'net', durability: 80, sharp: 0, chop: 0, melee: 0, power: 0, range: 4, view: 'net' },
  perk: { radius: 2.0, mesh: 1.5, minFish: 2, maxFish: 8 }, desc: '浅瀬で小魚を一網打尽。置き網にも。' });
starter('firesteel', '火打ち石', '🔥', 'tool', 0.1, 1, 0.95, 'P0', {
  attrs: A('hard8 spark9'), tags: ['metal', 'steel'],
  tool: { kind: 'fire', durability: 3000, sharp: 0, chop: 0, melee: 0, power: 0, range: 0, view: 'steel' },
  perk: { fireBase: 0.85, wetResist: 0.5 }, desc: 'ファイヤースターター。約3000回。濡れに強い。' });
starter('pot', '鍋', '🍲', 'container', 0.9, 2, 1.0, 'P0', {
  attrs: A('container8 heatproof9 hard6 waterproof10'), tags: ['metal'],
  container: { liters: 3, heatproof: true, maxBoils: 99999 },
  tool: { kind: 'pot', durability: 99999, sharp: 0, chop: 0, melee: 3, power: 0, range: 0, view: 'pot' },
  perk: { stewPoisonMul: 0.05, stewFullness: 1.15, dryBurnLimit: 3 }, desc: 'ふた付き3L。煮沸と煮込みで安全な食事。' });
starter('rope', 'ロープ30m', '🪢', 'tool', 1.8, 3, 1.05, 'P1', {
  attrs: A('fiber9 long8 flex5'), tags: ['fiber'],
  tool: { kind: 'rope', durability: 200, sharp: 0, chop: 0, melee: 0, power: 0, range: 5, view: 'rope' },
  perk: { pieces: 6, pieceMeters: 5 }, desc: '5mごとに6本へ。建築・崖・いかだに。' });
starter('bottle', '浄水ボトル', '🍶', 'container', 0.3, 2, 1.0, 'P1', {
  attrs: A('container6 waterproof10 shine3 hard4'), tags: ['plastic'],
  container: { liters: 0.75, heatproof: false, maxBoils: 0 },
  tool: { kind: 'purifier', durability: 300, sharp: 0, chop: 0, melee: 0, power: 0, range: 0, view: 'bottle' },
  perk: { waterTreat: 'bottle', lensFire: 0.35 }, desc: 'どの淡水も飲める0.75L。水レンズで着火も。' });
starter('tent', 'テント', '⛺', 'misc', 3.0, 2, 1.0, 'P0', {
  attrs: A('waterproof9 insul5 flex4'), tags: ['cloth'],
  tool: { kind: 'tent', durability: 3, sharp: 0, chop: 0, melee: 0, power: 0, range: 0 },
  perk: { rain: 1.0, wind: 0.85, insul: 4, sleepBonus: 0.2, setupMin: 10, packMin: 5 }, desc: '1人用。雨・風・虫を防ぐ。嵐3回で破れる。' });
starter('sleeping_bag', '寝袋', '🛏️', 'clothing', 1.2, 2, 1.0, 'P0', {
  attrs: A('insul9 flex6 absorb3'), tags: ['cloth', 'feather'],
  wear: { slot: 'bed', insul: 7, rain: 0, sun: 0, days: 99999 },
  perk: { sitInsul: 3, wetMul: 0.4, sleepQualityMin: 0.9, bugMul: 0.25 }, desc: '就寝中+7℃。防水ではない。' });
starter('goggles', '水中ゴーグル', '🥽', 'tool', 0.15, 3, 1.05, 'P1', {
  attrs: A('shine6 waterproof8 hard3'), tags: ['glass', 'plastic'],
  tool: { kind: 'goggles', durability: 200, sharp: 0, chop: 0, melee: 0, power: 0, range: 0 },
  perk: { viewDist: 15, diveSec: 35, lensFire: 0.3 }, desc: '素潜りができる。視界15m、潜水35秒。' });
starter('medkit', '救急箱', '🧰', 'medicine', 0.8, 3, 1.05, 'P1', {
  attrs: A('container5 waterproof6'), tags: [],
  kit: { bandage_pro: 6, disinfectant: 6, painkiller: 6, stomach_med: 6, antibiotic: 3, venom_pump: 1 }, desc: '包帯・消毒液・各種薬。病気やケガ6回ぶん。' });
starter('guide', 'サバイバル図鑑', '📖', 'misc', 0.4, 2, 0.95, 'P1', {
  attrs: A('burn5 fiber2'), tags: ['paper'], tool: { kind: 'guide', durability: 99999, sharp: 0, chop: 0, melee: 0, power: 0, range: 0 },
  perk: { craftQuality: 10, fireBonus: 0.1, showRisk: true, wetUnreadable: 100 }, desc: '植物・キノコ・魚が最初から確定。毒を踏まない。' });

// kit contents (not take-along choices themselves: no `starter` block)
add('arrow_pro', { name: '矢', icon: '➶', cat: 'ammo', weight: 0.03, attrs: A('hard4 sharp5 long4 float2'), tags: ['wood', 'feather'], stack: 20, q: Q_TAKE, p: 'P0',
  tool: { kind: 'arrow', durability: 1, sharp: 6, chop: 0, melee: 1, power: 30, range: 40, view: 'stick' }, recover: 0.7, guide: 'arrow_pro', desc: '弓の矢。70%は回収できる。' });
add('ammo', { name: '弾', icon: '🔸', cat: 'ammo', weight: 0.03, attrs: A('hard6 heavy2 burn4'), tags: ['metal'], stack: 30, q: Q_TAKE, p: 'P0',
  tool: { kind: 'bullet', durability: 1, sharp: 0, chop: 0, melee: 0, power: 80, range: 120 }, guide: 'ammo', desc: '猟銃の弾。火薬は着火にも使える。' });
add('hook_pro', { name: '釣り針', icon: '🪝', cat: 'tool', weight: 0.01, attrs: A('hard8 sharp7 long1'), tags: ['metal', 'steel'], stack: 10, q: Q_TAKE, p: 'P0',
  tool: { kind: 'hook', durability: 40, sharp: 7, chop: 0, melee: 0, power: 0, range: 0 }, guide: 'hook_pro', desc: '鋼の釣り針。1本40回使える。' });
function medPiece(id, name, icon, type, power, use, desc, extra = {}) {
  return add(id, { name, icon, cat: 'medicine', weight: 0.05, attrs: { med: 8, ...(extra.attrs || {}) }, tags: [], stack: 10, q: Q_TAKE, p: 'P1',
    med: { type, power, use }, guide: id, desc, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'attrs')) });
}
medPiece('bandage_pro', '包帯', '🩹', 'bandage', 8, 'apply', '傷をおおう。止血と感染予防。', { attrs: { med: 8, absorb: 6, fiber: 3 } });
medPiece('disinfectant', '消毒液', '🧴', 'disinfect', 8, 'apply', '傷の感染を防ぐ。しみる。');
medPiece('painkiller', '解熱鎮痛薬', '💊', 'painkiller', 7, 'eat', '熱と痛みをやわらげる。');
medPiece('stomach_med', '整腸薬', '💊', 'stomach', 7, 'eat', '腹痛・下痢・吐き気を抑える。');
medPiece('antibiotic', '抗生物質', '💉', 'antibiotic', 10, 'eat', '重い感染症を治す。3回ぶんだけ。');
medPiece('venom_pump', '毒吸引器', '🪠', 'venom', 8, 'apply', '咬み傷の毒を吸い出す。何度でも使える。', { weight: 0.1, stack: 1, reusable: true });

// shared start equipment (worn / carried by everyone)
add('clothes_base', { name: '服', icon: '👕', cat: 'clothing', weight: 0.6, attrs: A('insul2 flex5 absorb3'), tags: ['cloth'], stack: 1, q: Q_TAKE, p: 'P0',
  wear: { slot: 'body', insul: 1.0, rain: 0, sun: 0, days: 40 }, start: true, wetInsulMul: 0.3, worn: { insul: 0.3 }, guide: 'clothes_base',
  desc: 'Tシャツと半ズボンと運動靴。濡れると保温が落ちる。' });
add('watch', { name: '腕時計', icon: '⌚', cat: 'tool', weight: 0.05, attrs: A('hard5 shine3'), tags: ['metal'], stack: 1, q: Q_TAKE, p: 'P0', start: true,
  desc: '時刻と方角が分かる。' });
add('diary', { name: '日記帳と鉛筆', icon: '📔', cat: 'misc', weight: 0.2, attrs: A('burn6 tinder2'), tags: ['paper'], stack: 1, q: Q_TAKE, p: 'P0', start: true,
  fuel: 0.05, tinder: 0.5, desc: '島の記録をつける。破れば火口にもなる。' });

// ---------------------------------------------------------------- 7. API
const STARTER_ORDER = ['knife', 'axe', 'bow', 'rifle', 'rod', 'net', 'firesteel', 'pot', 'rope', 'bottle', 'tent', 'sleeping_bag', 'goggles', 'medkit', 'guide'];

/** Definition for an id (ITEMS first, then CRAFTED) with the stack's name / attrs / stats applied to a shallow copy. */
export function itemDef(id, stack = null) {
  const base = ITEMS[id] ?? CRAFTED[id];
  if (!base) return undefined;
  if (!stack) return base;
  const d = { ...base };
  if (stack.name) d.name = stack.name;
  if (stack.attrs) d.attrs = stack.attrs;
  if (stack.stats) {
    const s = stack.stats;
    d.stats = s;
    if (d.tool || ['sharp', 'chop', 'melee', 'power', 'range'].some((k) => k in s)) {
      d.tool = { ...(base.tool || { kind: base.name }), ...pick(s, ['sharp', 'chop', 'melee', 'power', 'range', 'durability']) };
    }
    if (s.liters != null && (d.container || base.container)) d.container = { ...(base.container || {}), liters: s.liters };
  }
  return d;
}
function pick(o, keys) { const r = {}; for (const k of keys) if (k in o) r[k] = o[k]; return r; }

/** Effective attributes of a stack: stack.attrs or the definition's; wet (> 60) fuel and tinder drop to 30% (§10.1). */
export function attrsOf(stack) {
  const def = itemDef(stack.id, stack);
  const a = { ...(stack.attrs ?? def?.attrs ?? {}) };
  if ((stack.wet ?? 0) > 60) {
    for (const k of ['burn', 'tinder']) if (a[k]) a[k] = Math.round(a[k] * 0.3 * 100) / 100;
  }
  return a;
}

export function isFood(id) {
  const d = itemDef(id);
  return !!(d && d.food);
}

/** The take-along list in display order (15 items incl. sleeping_bag). p0 marks the first-version items. */
export function starterItems() {
  return STARTER_ORDER.map((id) => {
    const d = ITEMS[id];
    return { id, name: d.name, icon: d.icon, desc: d.desc, weight: d.weight, star: d.starter.star, score: d.starter.score,
      p: d.starter.p, p0: d.starter.p === 'P0', def: d, ...(d.ammoVariants ? { ammoVariants: d.ammoVariants } : {}) };
  });
}
