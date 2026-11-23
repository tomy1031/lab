// data/crafted.js — item definitions of everything 錬成 makes (DESIGN.md §11.5 templates, §11.8 ③ generic results).
// ItemDef schema: docs/dev-contracts.md. items.js merges these (ITEMS[id] ?? CRAFTED[id]).
//
// The attrs here are the typical values (made from the example materials of §11.5); a crafted stack carries its own
// inherited attributes in `stack.attrs` and its performance numbers in `stack.stats` (sim/crafting.js), so the
// numbers below are only the fallback for a stack without them.
// Results that are plain §11.3 materials stay in items.js and are not repeated here: charcoal (炭), ash (灰),
// glass_shard, bamboo_strip, wood_shavings (木くず), coconut_meat, charcoal_powder (§6.4).
// Extra (non-schema) keys: `place` ('ground' | 'water' | 'trap': set in the world), `bait` (bait multiplier),
// `light` (m), `generic` (a §11.8 ③ result), `perInstance` (what lives on the stack instead of the def).

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
/** tool block: kind (what systems test), view (js/player/viewmodel.js model) + numbers; durability only when it wears */
const T = (kind, view, o = {}) => ({ kind, view, sharp: 0, chop: 0, melee: 0, power: 0, range: 0, ...o });

export const CRAFTED = {};
function C(id, name, icon, cat, weight, attrs, tags, p, extra = {}) {
  const single = cat === 'tool' || cat === 'weapon' || cat === 'clothing' || (cat === 'container' && !extra.stack);
  CRAFTED[id] = { name, icon, cat, weight, attrs: A(attrs), tags, stack: single ? 1 : 10, q: [40, 60], p, crafted: true, ...extra };
}

// ---------------------------------------------------------------- A. 刃物・武器
C('flake', '石刃', '🪨', 'tool', 0.1, 'hard9 sharp8 spark5', ['stone'], 'P0', {
  tool: T('blade', 'stone', { durability: 27, sharp: 8, chop: 2, melee: 3, carve: -10, butcher: 0.8 }),
  desc: '打ち欠いた 石の 刃。切る・削る・さばける（削りの 品質 −10）。' });
C('knife_made', '手づくりナイフ', '🔪', 'tool', 0.3, 'hard9 sharp7 long5 burn6', ['stone', 'wood'], 'P0', {
  tool: T('blade', 'knife', { durability: 90, sharp: 7, chop: 2, melee: 8, carve: 0, butcher: 0.9 }),
  desc: '刃を 柄に くくった ナイフ。削り・解体・近接に。' });
C('axe_made', '石斧', '🪓', 'tool', 1.5, 'hard8 sharp5 heavy4 long5 burn6', ['stone', 'wood'], 'P0', {
  tool: T('axe', 'stone_axe', { durability: 100, sharp: 5, chop: 11, melee: 14 }),
  desc: '平たい 石の 刃を 柄に しばった 斧。木を 切り倒せる。' });
C('spear_wood', '木の 槍', '🔱', 'weapon', 0.9, 'hard5 sharp3 long8 burn5 flex2', ['wood'], 'P0', {
  tool: T('spear', 'spear', { durability: 37, sharp: 3, melee: 11, power: 11 }), fuel: 0.75,
  desc: '長い 棒の 先を 削った 槍。火で あぶると 硬く なる。' });
C('spear_tip', '穂先つきの 槍', '🔱', 'weapon', 1.1, 'hard9 sharp7 long8 burn5', ['wood', 'stone'], 'P0', {
  tool: T('spear', 'spear', { durability: 55, sharp: 7, melee: 23, power: 23, range: 15 }),
  desc: '鋭い 穂先を くくった 槍。突く・投げる（15m）。' });
C('harpoon', '銛', '🔱', 'weapon', 1.6, 'hard6 sharp5 long9 float7', ['wood', 'bone'], 'P0', {
  tool: T('harpoon', 'spear', { durability: 50, sharp: 5, melee: 13, power: 13 }),
  desc: 'かえしの ついた 魚突き。刺した 魚が 外れない。' });
C('bow_made', '手づくりの 弓', '🏹', 'weapon', 0.8, 'hard5 long8 flex7', ['wood'], 'P0', {
  tool: T('bow', 'bow', { durability: 90, melee: 2, power: 20, range: 32 }),
  desc: '曲がり木に 弦を 張った 弓。持ち込みの 弓より 弱い。' });
C('arrow', '矢', '➶', 'ammo', 0.03, 'hard4 sharp7 long5', ['wood', 'feather'], 'P0', {
  stack: 20, tool: T('arrow', 'stick', { durability: 1, sharp: 7, melee: 1 }),
  desc: '手づくりの 矢。矢じり・羽が ないと 弱く ぶれる。' });
C('club', 'こん棒', '🏏', 'weapon', 2.5, 'hard5 long4 heavy3 burn8', ['wood'], 'P0', {
  tool: T('club', 'club', { durability: 65, melee: 13 }), fuel: 2.0,
  desc: '太い 木を 削った こん棒。やぶを 叩けば ヘビよけ。' });
C('hammer', '石の ハンマー', '🔨', 'tool', 1.4, 'hard8 heavy6 long5', ['stone', 'wood'], 'P1', {
  tool: T('hammer', 'hammer', { durability: 110, melee: 10 }),
  desc: '杭打ち・建築が 速く なる（×0.85）。石を 割るのも うまく なる。' });
C('sling', '投石ひも', '🪢', 'weapon', 0.2, 'flex6 fiber5', ['cloth', 'fiber'], 'P2', {
  tool: T('sling', 'rope', { durability: 55, power: 12, range: 30 }),
  desc: '石を 回して 飛ばす ひも。威力 12。' });

// ---------------------------------------------------------------- B. 漁の 道具・罠
C('hook', '釣り針', '🪝', 'tool', 0.01, 'hard6 sharp5 long1', ['bone'], 'P0', {
  stack: 10, tool: T('hook', 'stick', { durability: 22, sharp: 5 }),
  desc: '骨・トゲ・釘で 作った 釣り針。' });
C('line', '釣り糸', '🧵', 'material', 0.02, 'fiber7 long8 flex6', ['fiber'], 'P0', {
  desc: '細い 繊維を なった 糸。竿に 張る。' });
C('rod_made', '手づくりの 竿', '🎣', 'tool', 1.6, 'hard6 long9 flex5 float7', ['wood', 'fiber'], 'P0', {
  tool: T('rod', 'rod', { durability: 100, melee: 1, range: 6 }),
  desc: '竹や 若木に 糸と 針を つけた 竿。' });
C('lure', 'ルアー', '🐟', 'tool', 0.03, 'shine7 sharp5 hard5', ['metal'], 'P1', {
  stack: 10, tool: T('lure', 'stick', { durability: 27, sharp: 5 }), bait: 0.82,
  desc: '光る 物の 擬似餌。エサが 減らない。' });
C('hand_net', 'タモ（手網）', '🥅', 'tool', 0.7, 'flex6 fiber6 long8', ['fiber', 'wood'], 'P1', {
  tool: T('hand_net', 'net', { durability: 55, range: 1.5 }),
  desc: '大魚の 取り込みと 潮だまりの 小魚に。' });
C('cast_net_made', '手づくりの 投網', '🕸️', 'tool', 2.0, 'fiber8 flex6 heavy4', ['fiber'], 'P1', {
  tool: T('net', 'net', { durability: 37, range: 3 }),
  desc: '縄を 編んで おもりを つけた 投網。' });
C('fish_trap', '魚かご（うけ）', '🧺', 'tool', 1.2, 'flex7 fiber3 long7 float4', ['wood', 'fiber'], 'P1', {
  tool: T('fish_trap', 'net', { durability: 20 }), place: 'water',
  desc: '川に 沈めて 魚を 待つ かご（§9.5）。' });
C('snare', 'くくり罠', '🪤', 'tool', 0.6, 'fiber6 flex6 long6 hard4', ['wood', 'fiber'], 'P1', {
  tool: T('snare', 'rope', { durability: 10 }), place: 'trap',
  desc: '獣道に 仕掛ける 輪の 罠（§11.6）。' });
C('deadfall', '石落とし', '🪤', 'tool', 3.5, 'heavy8 hard8', ['stone', 'wood'], 'P1', {
  tool: T('deadfall', 'stone', { durability: 10 }), place: 'trap',
  desc: '支え棒が 外れると 石が 落ちる 罠。エサが 要る。' });
C('crab_pot', 'カニかご', '🦀', 'tool', 1.0, 'flex7 fiber5 long7', ['fiber', 'plant'], 'P2', {
  tool: T('crab_pot', 'net', { durability: 20 }), place: 'water',
  desc: 'エサを 入れて 沈める かご。潮 1 回で カニ 1〜3。' });
C('float_made', 'ウキ', '🔴', 'material', 0.05, 'float7', ['wood'], 'P1', {
  desc: '竿に つける ウキ。アタリが 見やすい。' });

// ---------------------------------------------------------------- C. 紐・布・かご・服
C('cord', '縄', '🪢', 'material', 0.15, 'fiber8 long8 flex7', ['fiber'], 'P0', {
  fuel: 0.1, desc: '繊維を 3 本 なった 縄。結ぶ・編む・建てるの 基本。' });
C('rope_made', '丈夫な ロープ', '🪢', 'material', 0.5, 'fiber10 long10 flex7', ['fiber'], 'P1', {
  stack: 5, desc: '縄を 3 本 なった ロープ。fiber 9 以上なら 崖に 使える。' });
C('mat', '編みマット', '🟫', 'material', 1.8, 'fiber4 waterproof7 insul6 flex5 long6 burn5', ['mat', 'plant'], 'P0', {
  stack: 4, fuel: 1.0, desc: '葉や 繊維を 編んだ 面。屋根材・敷物・帆・壁・風よけに。' });
C('basket', 'かご', '🧺', 'container', 1.0, 'flex7 container4 fiber6 long8', ['fiber', 'plant'], 'P1', {
  container: { liters: 0, items: 10, heatproof: false, maxBoils: 0 }, place: 'ground',
  desc: '食料 10 個の 置き容器。水は もれる。' });
C('backpack', '背負いかご', '🎒', 'container', 1.5, 'flex7 container5 fiber6 long8', ['fiber', 'plant'], 'P1', {
  container: { liters: 0, items: 20, heatproof: false, maxBoils: 0 },
  desc: '背負う かご。所持上限 ＋4〜8 kg（stats.carry）。' });
C('leaf_cape', '葉の マント（みの）', '🍃', 'clothing', 1.5, 'waterproof7 insul6 fiber4 flex5', ['leaf', 'plant'], 'P0', {
  wear: { slot: 'cloak', insul: 1.0, rain: 0.6, sun: 0, days: 10 }, desc: '葉を 編んだ 雨具。雨よけ 0.4 + Q/250。' });
C('leaf_hat', '葉の 笠', '👒', 'clothing', 0.3, 'waterproof6 insul4 fiber4', ['leaf', 'plant'], 'P1', {
  wear: { slot: 'head', insul: 0, rain: 0.15, sun: 0.5, days: 8 }, desc: '日差しを 半分に する 笠。' });
C('sandals', '草ぞうり', '🩴', 'clothing', 0.3, 'fiber5 flex6 insul3', ['fiber', 'plant'], 'P1', {
  wear: { slot: 'feet', insul: 0, rain: 0, sun: 0, days: 6 }, desc: '靴が 壊れた あとの 足を 守る。' });
C('fur_vest', '毛皮の 上着', '🧥', 'clothing', 3.5, 'insul8 waterproof5 fiber3 flex5', ['hide'], 'P1', {
  wear: { slot: 'body', insul: 5.0, rain: 0.3, sun: 0, days: 60 }, desc: '皮を 縫った 上着。なめさないと 5 日で 腐る。' });
C('blanket', '掛け布団', '🛏️', 'clothing', 1.0, 'insul6 fiber3 flex5', ['plant'], 'P1', {
  wear: { slot: 'bed', insul: 3.0, rain: 0, sun: 0, days: 15 }, desc: '寝る ときに かける。保温 ＝ 平均 insul × 0.6。' });
C('bandage', '包帯', '🩹', 'medicine', 0.05, 'absorb6 fiber5 flex6', ['cloth'], 'P0', {
  med: { type: 'bandage', power: 6, use: 'apply' }, desc: '傷に 巻く。出血を 止め、感染率 ×0.2（§6.3）。' });
C('water_skin', '皮の 水袋', '🫗', 'container', 0.6, 'container7 waterproof7 flex5 insul5', ['hide'], 'P1', {
  container: { liters: 1.5, heatproof: false, maxBoils: 0 }, tool: T('container', 'bottle'),
  desc: '1.5L 入る 皮の 袋。Q < 40 は もれる。' });

// ---------------------------------------------------------------- D. 容器・水・火
C('shell_bowl', 'ヤシ殻の 器', '🥥', 'container', 0.2, 'container4 hard5 burn6 waterproof8 float4', ['plant'], 'P0', {
  stack: 4, container: { liters: 0.25, heatproof: false, maxBoils: 0 }, tool: T('container', 'coconut'), fuel: 1.0,
  desc: '0.25L の 器。火には かけられない（焼き石 煮沸は 可）。' });
C('bamboo_cup', '竹筒', '🎋', 'container', 0.8, 'container5 hard6 waterproof6 heatproof5 float7 burn5 long3', ['wood', 'plant'], 'P0', {
  container: { liters: 0.5, heatproof: true, maxBoils: 3 }, tool: T('container', 'bottle'), fuel: 0.6,
  desc: '0.5L の 水筒。直火に 3 回まで かけられる。' });
C('clay_pot_raw', '生乾きの 土器', '🏺', 'misc', 4.0, 'sticky3 waterproof6 heatproof8 heavy6', ['clay'], 'P1', {
  stack: 1, perInstance: 'stats.dried / stats.temper', desc: '成形した 粘土の 鍋。日陰で 12h 乾かしてから 火に かけて 焼く。' });
C('clay_pot', '土器の 鍋', '🏺', 'container', 3.0, 'container7 hard6 waterproof8 heatproof9 heavy5', ['clay'], 'P1', {
  container: { liters: 2, heatproof: true, maxBoils: 999 }, tool: T('pot', 'pot'),
  desc: '2L の 焼き物の 鍋。直火 可。空焚き・落下で 割れる。' });
C('can_pot', '空き缶の 小鍋', '🥫', 'container', 0.1, 'container4 heatproof8 hard5 shine7 waterproof10', ['metal'], 'P0', {
  container: { liters: 0.35, heatproof: true, maxBoils: 20 }, tool: T('pot', 'pot', { durability: 20 }),
  desc: '取っ手を つけた 空き缶。1 杯ずつ 煮沸できる。20 回で 穴。' });
C('water_filter', 'ろ過器', '⏳', 'tool', 1.2, 'container5 absorb7', ['plastic'], 'P0', {
  tool: T('filter', 'bottle', { durability: 50 }),
  desc: '筒に 層を 詰めた ろ過器。1 杯 2 分。50 杯で 炭を 交換（§7.6）。' });
C('solar_still', '太陽熱の 蒸留器', '☀️', 'misc', 2.0, 'waterproof8 container3', ['plastic'], 'P1', {
  stack: 1, place: 'ground', desc: '地面に 掘った 穴に 張る。晴れ 0.1 L/h の 真水。' });
C('rain_catcher', '雨水受け（小）', '🌧️', 'misc', 0.9, 'waterproof6 container4', ['leaf', 'wood'], 'P0', {
  stack: 1, place: 'ground', desc: '雨を 容器に 集める。葉 3 枚で 小雨 0.15 L/h、大雨 0.6 L/h。' });
C('tinder_bundle', '火口束', '🪺', 'fuel', 0.05, 'tinder8 burn8 fiber3', ['plant'], 'P0', {
  tinder: 1.15, fuel: 0.05, desc: '火口を 鳥の 巣状に まとめた 物。火口倍率 1.15（樹脂入り 1.3）。' });
C('char_cloth', '炭布', '⬛', 'fuel', 0.02, 'tinder10 burn7', ['cloth'], 'P1', {
  stack: 20, tinder: 1.25, fuel: 0.02, desc: '布を 蒸し焼きに した 火口。火打ち石の 小さな 火花でも 受ける。' });
C('hand_drill_kit', 'きりもみ棒と 火きり板', '🥢', 'tool', 0.6, 'hard4 long5 burn6', ['wood'], 'P0', {
  tool: T('hand_drill', 'stick', { durability: 8 }), desc: '手で 回して 火を おこす 棒と 板（§10.1）。' });
C('bow_drill_kit', '火きり弓セット', '🔥', 'tool', 1.5, 'hard5 long8 flex7', ['wood'], 'P0', {
  tool: T('bow_drill', 'stick', { durability: 15 }), desc: '弓で 棒を 回す 火おこしの 道具（§10.1）。' });
C('torch', 'たいまつ', '🔥', 'tool', 0.5, 'burn7 long5 hard4', ['wood'], 'P0', {
  tool: T('torch', 'torch', { melee: 3 }), light: 8, fuel: 0.25,
  desc: '15 分（油 あり 40 分）燃える。明かり 8m。獣・ヘビ・蚊よけ。' });
C('shell_lamp', '貝の ランプ', '🪔', 'misc', 0.9, 'container4 heatproof5 burn7', ['shell'], 'P1', {
  stack: 1, light: 4, place: 'ground', desc: '脂 1 つで 6 時間、4m を 照らす。屋内で 安全。' });
C('pitch', 'ピッチ', '⚫', 'material', 0.1, 'sticky10 waterproof9 burn7', ['plant'], 'P1', {
  fuel: 0.3, desc: '樹脂と 炭の 粉を 煮た 接着剤。「接着」に 使うと 耐久 ×1.5。' });
C('soap', '石けん', '🧼', 'medicine', 0.1, 'absorb4', [], 'P2', {
  med: { type: 'soap', power: 7, use: 'apply' }, desc: '灰と 脂の 石けん。水浴びの 衛生 ＋70。' });
C('oil', '油', '🫙', 'material', 0.1, 'burn8 waterproof6 sticky3', ['food'], 'P1', {
  fuel: 0.3, desc: '脂を 火で 溶かした 油。ランプ・防水に。' });

// ---------------------------------------------------------------- E. 薬・虫よけ・合図・その他
C('poultice', '薬草の 湿布', '🌿', 'medicine', 0.1, 'med6 sticky3', ['plant'], 'P0', {
  med: { type: 'poultice', power: 6, use: 'apply' }, perInstance: 'stats.herbs, stats.power',
  desc: '薬草を すりつぶした 湿布。入れた 薬草の 効果 ×(0.8 + Q/250)。' });
C('herb_tea', '薬草茶', '🍵', 'medicine', 0.25, 'med5', ['plant'], 'P0', {
  stack: 5, med: { type: 'tea', power: 5, use: 'tea' }, perInstance: 'stats.herbs',
  food: { food: 0, water: 20, B: 0, parasite: 0, decay: 1.0, thick: 1, rawPenalty: 0, mustCook: false, cookable: false },
  desc: '薬草を 煮出した 茶。体温 ＋0.4、気力 ＋3、薬草の 効果。' });
C('repellent', '虫よけ軟膏', '🧴', 'medicine', 0.1, 'scent6 sticky2 waterproof4', ['plant'], 'P1', {
  med: { type: 'repellent', power: 6, use: 'apply' }, desc: 'におう 草と 脂の 軟膏。蚊よけ 12h。' });
C('signal_mirror', '合図の 鏡', '🪞', 'tool', 0.1, 'shine8 hard5', ['metal'], 'P1', {
  tool: T('mirror', 'leaf'), desc: '晴れの 昼に 光を 送る。船・飛行機に 気づかれやすい。' });
C('digging_stick', '掘り棒', '⛏️', 'tool', 0.6, 'hard5 long5 sharp3 burn6', ['wood'], 'P1', {
  tool: T('shovel', 'shovel', { durability: 60, melee: 4 }), desc: '掘る 回数 ×0.5（へら付き ×0.35）。' });
C('splint', '添え木', '🪵', 'medicine', 0.5, 'hard4 long4', ['wood'], 'P1', {
  med: { type: 'splint', power: 5, use: 'apply' }, desc: 'ねんざ・骨折に 当てる（§6.3）。' });
C('crutch', '松葉づえ', '🩼', 'tool', 1.2, 'hard5 long8', ['wood'], 'P2', {
  tool: T('crutch', 'stick', { durability: 60, melee: 4 }), desc: '骨折でも 歩ける（移動 ×0.6）。' });
C('paddle', 'オール', '🛶', 'tool', 1.5, 'hard6 long9 float6', ['wood'], 'P1', {
  tool: T('paddle', 'shovel', { durability: 100, melee: 6 }), desc: 'いかだを こぐ。速さ ×(0.8 + Q/250)。' });
C('sail', '帆', '⛵', 'misc', 2.5, 'waterproof7 fiber6 long9', ['cloth', 'wood'], 'P1', {
  stack: 1, desc: 'いかだに 立てる 帆。追い風で 速く なる。' });
C('bait_ball', '練りエサ', '🍡', 'misc', 0.05, 'edible2 scent6', ['food'], 'P1', {
  stack: 20, bait: 1.2, desc: '釣り・罠の エサ（倍率 1.2）。毒入りは 毒エサ。' });
C('bone_needle', '骨の 針', '🪡', 'tool', 0.01, 'hard6 sharp6 long2', ['bone'], 'P1', {
  tool: T('needle', 'stick', { durability: 50, sharp: 6 }), desc: '縫う 型（毛皮の 上着・水袋）の Q ＋10。' });
C('whistle', '竹笛', '🎶', 'tool', 0.2, 'hard5 long2', ['wood'], 'P2', {
  tool: T('whistle', 'stick'), desc: '吹くと 150m 先の 仲間に 届く。気力 ＋1。' });

// ---------------------------------------------------------------- byproducts (§11.4)
C('bone_shard', '骨片', '🦴', 'material', 0.05, 'hard6 sharp5 long2', ['bone'], 'P0', {
  stack: 20, desc: '骨を 割った かけら。針・かえし・矢じりに。' });
C('cloth_strip', '細布', '🎗️', 'material', 0.03, 'fiber5 absorb6 insul2 burn6 tinder3 flex6', ['cloth'], 'P0', {
  stack: 20, tinder: 0.8, fuel: 0.05, desc: '布を 裂いた 細い 布。包帯・紐・火口に。' });
C('shell_powder', '砕いた 貝', '⚪', 'material', 0.05, 'absorb1 heavy1', ['shell'], 'P1', {
  stack: 20, desc: '貝殻の 粉。土器の 混ぜ物に（割れにくく なる）。' });

// ---------------------------------------------------------------- §11.8 ③ generic results
C('joined_pole', '継ぎ棒', '🎋', 'tool', 1.2, 'long10 hard4 burn5', ['wood'], 'P0', {
  generic: true, tool: T('pole', 'stick', { melee: 3, range: 3 }), fuel: 1.0,
  desc: '長い 物を つないだ 棒。高い 実を 落とす・深い 所を 探る・竿や 帆桁の 素材。' });
C('weighted_club', 'おもり付き棒', '🏏', 'weapon', 1.5, 'hard8 heavy6 long5', ['stone', 'wood'], 'P0', {
  generic: true, tool: T('club', 'club', { melee: 10 }), perInstance: 'stats.melee ＝ heavy + hard/2',
  desc: '棒に 重い 物を しばった もの。叩く・杭打ちに。' });
C('spike_bundle', 'トゲ束', '🌵', 'material', 0.1, 'sharp7 hard3', ['plant'], 'P0', {
  generic: true, desc: '鋭い 物を 束ねた もの。柵・落とし穴の 部品。踏むと 刺さる。' });
C('bundle', '束', '🎍', 'misc', 0.5, '', [], 'P0', {
  generic: true, stack: 1, perInstance: 'contents（中身）, stats.weight, stats.fuel',
  desc: '中身を 1 つに まとめた 束（重さ ×0.9）。ほどくと 戻る。燃料の 束は そのまま くべられる。' });
C('woven_cord', '編みひも', '🧶', 'material', 0.1, 'fiber4 flex6 long6', ['fiber'], 'P0', {
  generic: true, desc: '3〜5 本を なった ひも（§11.4 なう）。' });
C('carved_stick', '削った 棒', '🥢', 'material', 0.3, 'hard4 sharp3 long5 burn6', ['wood'], 'P0', {
  generic: true, tool: T('stick', 'stick', { sharp: 3, melee: 3 }), fuel: 0.5,
  desc: '先を とがらせた 棒。串・杭・箸・槍の 元。' });
C('chopped', '刻んだ もの', '🥗', 'material', 0.05, '', ['plant'], 'P0', {
  generic: true, stack: 20, perInstance: 'attrs, name（刻んだ ◯◯）', desc: '細かく 刻んだ もの。混ぜる・火口に。' });
C('paste_food', '練り物', '🍡', 'food', 0.2, 'edible3', ['food'], 'P0', {
  generic: true, perInstance: 'mix: { food, water, B, ids, p, poison }, fresh',
  food: { food: 0, water: 0, B: 0.1, parasite: 0, decay: 3.0, thick: 1.5, rawPenalty: -2, mustCook: false, cookable: true },
  desc: '食べ物を 練った 団子。生扱い（焼ける）。満腹 ＝ 入れた 物の 合計 ×0.9。' });
C('mystery_medicine', 'よく 分からない 薬', '🧪', 'medicine', 0.1, 'med3', ['plant'], 'P0', {
  generic: true, med: { type: 'mystery', power: 3, use: 'eat' }, perInstance: 'stats.herbs, stats.power (×0.5), mix (毒)',
  desc: '薬草を 混ぜた もの。入れた 薬草の 効果 ×0.5。毒が 入ると 害に なる。' });
C('poison_paste', '毒の ペースト', '☠️', 'material', 0.1, 'toxic7 sticky2', ['plant'], 'P0', {
  generic: true, desc: '毒を ねった もの。矢・槍に ぬる、毒エサに。' });
C('sticky_goo', 'ねばねば', '🍯', 'material', 0.1, 'sticky6 waterproof3', [], 'P0', {
  generic: true, desc: '接着・目止め・とりもちに。' });
C('fire_starter', '着火剤', '🔥', 'fuel', 0.1, 'tinder6 burn7', ['plant'], 'P0', {
  generic: true, tinder: 0.9, fuel: 0.2, desc: '燃える 物を 練った 着火剤。濡れた 薪でも 火が つく。' });
C('scent_ball', 'におい玉', '🟤', 'misc', 0.1, 'scent6', [], 'P0', {
  generic: true, bait: 1.1, desc: 'においの 強い 玉。エサ・虫よけ・動物の 誘導に。' });
C('mud_ball', '泥だんご', '🟤', 'misc', 0.5, 'heavy4 sticky2', [], 'P0', {
  generic: true, desc: '投げると 音で 動物の 気を そらす。仲間が 笑う。' });
C('shard', '破片', '🔹', 'material', 0.05, 'sharp6 hard6', ['stone'], 'P0', {
  generic: true, stack: 20, tool: T('blade', 'stone', { sharp: 6, chop: 1, melee: 2, butcher: 0.65 }),
  desc: '割った 破片。刃・矢じり・針に（§11.4 の sharp）。' });
C('crushed', 'つぶれた もの', '🫓', 'material', 0.1, 'fiber4', ['plant'], 'P0', {
  generic: true, stack: 20, perInstance: 'attrs, name（つぶれた ◯◯）, stats.tinder',
  desc: '叩いて つぶした もの。繊維が ほぐれて 紐や 火口に なる。' });
C('hot_stone', '焼き石', '🪨', 'misc', 1.0, 'hard8 heavy6 heatproof9', ['stone'], 'P1', {
  generic: true, stack: 4, perInstance: 'stats.hotMinutes（20）',
  desc: '20 分 熱い 石。容器に 入れて 煮沸、布で 包んで 寝床に（＋1.5℃・3h）。' });
C('shell_lime', '貝灰', '⚪', 'material', 0.1, 'absorb5', ['shell'], 'P2', {
  generic: true, stack: 20, desc: '焼いた 貝の 粉。水で 練ると しっくい（sticky 4）。' });
C('pottery', '焼き物', '🏺', 'container', 0.8, 'hard6 waterproof8 heatproof9 container4 heavy3', ['clay'], 'P1', {
  generic: true, stack: 4, container: { liters: 0.5, heatproof: true, maxBoils: 99 }, perInstance: 'name / attrs（器・皿・おもり）',
  desc: '粘土を 焼いた 物。形しだいで 器・皿・おもり。' });
C('filled_container', '◯◯入りの 容器', '📦', 'container', 0.3, '', [], 'P0', {
  generic: true, perInstance: 'vessel（容器）, contents（中身）, name', desc: '中身を 入れた 容器。取り出すと 元に 戻る。' });
C('tinder_box', '濡れない 火口入れ', '🧰', 'container', 0.2, 'waterproof8', [], 'P0', {
  generic: true, perInstance: 'vessel, contents, stats.tinder, stats.keepsDry', tinder: 1.0,
  desc: '防水の 容器に 乾いた 火口を 入れた もの。雨の 日の 火おこしの 定石。' });
