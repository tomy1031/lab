// Town cast, scene catalog and shared vocabularies for Kotoba Town.
// Imported by the game (browser) and by tools/validate.mjs (Node) — keep it dependency-free.

/** Gemini Live prebuilt voices (native-audio models). */
export const VOICES = [
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi',
  'Laomedeia', 'Achernar', 'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird',
  'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
];

export const GESTURES = [
  'bow_light', 'bow', 'nod', 'wave', 'point', 'offer', 'receive', 'think', 'laugh', 'surprised',
  'shake_head', 'beckon', 'phone',
];

/** Engine-owned lines every cast member can say (generated once per voice). */
export const UTILITY_LINES = {
  again: { ja: 'すみません、もう いちど おねがいします。', kana: 'すみません、もう いちど おねがいします。', en: 'Sorry, once more, please.' },
  slow: { ja: 'ゆっくりで いいですよ。', kana: 'ゆっくりで いいですよ。', en: "Take your time." },
  hmm: { ja: 'ええと……。', kana: 'ええと……。', en: 'Um…' },
  ok: { ja: 'はい。', kana: 'はい。', en: 'Yes.' },
  sodesuka: { ja: 'そうですか。', kana: 'そうですか。', en: 'I see.' },
};

const SKIN = { light: '#f3d2b8', fair: '#ecc5a6', medium: '#d9a985', tan: '#c08a63', deep: '#8d5a3c' };

/**
 * look:
 *  sex 'f'|'m', age (years), height (m), build (0.85 slim … 1.2 sturdy), skin (hex),
 *  hair { style, color }, outfit { type, top, bottom, accent }, extras [..]
 * hair styles: bob, short, long, ponytail, bun, crew, side_part, gray_short, bald_top, wavy
 * outfit types: suit, blouse, cardigan, shirt, store_uniform, station_uniform, museum_uniform,
 *               apron, hoodie, polo, konbini, teacher, casual
 * extras: glasses, cap, badge, beard, mustache, scarf, tie, earrings, apron, lanyard
 */
export const CAST = {
  mori_aya: {
    nameJa: '森 あや', kana: 'もり あや', roleEn: 'Next-door neighbour, works part-time at a flower shop',
    voice: 'Aoede', personaJa: '30代なかばの となりの 奥さん。やさしくて 話し好き。花屋で パートを している。',
    styleJa: 'やさしく、あたたかく、少し 話し好きな 感じで。',
    look: { sex: 'f', age: 35, height: 1.6, build: 1.0, skin: SKIN.fair, hair: { style: 'bob', color: '#4a3020' },
      outfit: { type: 'cardigan', top: '#e9b9a4', bottom: '#5d6b7a', accent: '#fff6e8' }, extras: ['earrings'] },
  },
  mori_shun: {
    nameJa: '森 しゅん', kana: 'もり しゅん', roleEn: "Aya's husband, bank employee",
    voice: 'Iapetus', personaJa: '40代の 銀行員。おだやかで ていねい。野球と 料理が 好き。',
    styleJa: 'おだやかに、ていねいに、落ち着いて。',
    look: { sex: 'm', age: 42, height: 1.74, build: 1.05, skin: SKIN.medium, hair: { style: 'side_part', color: '#1d1a18' },
      outfit: { type: 'shirt', top: '#dfe7f0', bottom: '#3b3f48', accent: '#7a8ca0' }, extras: ['glasses'] },
  },
  aoki: {
    nameJa: '青木 みお', kana: 'あおき みお', roleEn: 'Colleague, designer at the company',
    voice: 'Laomedeia', personaJa: '26さいの デザイナー。明るくて よく 笑う。新しい 人に 親切。',
    styleJa: '明るく、元気に、にこにこ した 感じで。',
    look: { sex: 'f', age: 26, height: 1.58, build: 0.95, skin: SKIN.light, hair: { style: 'ponytail', color: '#3a2618' },
      outfit: { type: 'blouse', top: '#f6f1e6', bottom: '#2f4a6b', accent: '#e8a33c' }, extras: ['lanyard'] },
  },
  ogawa: {
    nameJa: '小川 まさる', kana: 'おがわ まさる', roleEn: 'Department manager (部長)',
    voice: 'Charon', personaJa: '55さいの 部長。めがね。やさしいが ことばは ていねいで かたい。',
    styleJa: 'ゆっくり、ていねいに、少し かたく、落ち着いた 声で。',
    look: { sex: 'm', age: 55, height: 1.71, build: 1.1, skin: SKIN.medium, hair: { style: 'gray_short', color: '#8d8a86' },
      outfit: { type: 'suit', top: '#2e3440', bottom: '#2e3440', accent: '#8a2f3b' }, extras: ['glasses', 'tie'] },
  },
  fujita: {
    nameJa: '藤田 れん', kana: 'ふじた れん', roleEn: 'Colleague and friend, engineer',
    voice: 'Puck', personaJa: '29さいの エンジニア。音楽と サッカーと ラーメンが 大好き。気さく。',
    styleJa: '気さくに、リラックス して、友だちに 話す ように。',
    look: { sex: 'm', age: 29, height: 1.77, build: 1.0, skin: SKIN.fair, hair: { style: 'short', color: '#2a1d14' },
      outfit: { type: 'hoodie', top: '#5b7f6a', bottom: '#2b2f36', accent: '#f2e5c9' }, extras: [] },
  },
  hayakawa: {
    nameJa: '早川 ともこ', kana: 'はやかわ ともこ', roleEn: 'Japanese teacher at the language school',
    voice: 'Sulafat', personaJa: '40代の 日本語の 先生。はっきり ゆっくり 話す。よく ほめる。',
    styleJa: '先生らしく、はっきり、ゆっくり、やさしく。',
    look: { sex: 'f', age: 44, height: 1.6, build: 1.0, skin: SKIN.fair, hair: { style: 'bun', color: '#2b1e16' },
      outfit: { type: 'teacher', top: '#8fa7c4', bottom: '#3d3a3a', accent: '#f4efe4' }, extras: ['glasses', 'badge'] },
  },
  ana: {
    nameJa: 'アナ・シルバ', kana: 'アナ・シルバ', roleEn: 'Classmate from Brazil',
    voice: 'Autonoe', personaJa: 'ブラジルから 来た 23さいの クラスメート。日本語は まだ かんたんな 文だけ。元気。',
    styleJa: '元気に、明るく。日本語を 勉強中の 留学生らしく、少し ゆっくり。',
    look: { sex: 'f', age: 23, height: 1.64, build: 1.0, skin: SKIN.tan, hair: { style: 'wavy', color: '#2b1a10' },
      outfit: { type: 'casual', top: '#f0c94b', bottom: '#3a5c86', accent: '#ffffff' }, extras: ['earrings'] },
  },
  minh: {
    nameJa: 'グエン・ミン', kana: 'グエン・ミン', roleEn: 'Classmate from Vietnam',
    voice: 'Umbriel', personaJa: 'ベトナムから 来た 25さいの クラスメート。日本語は かんたんな 文だけ。のんびり。',
    styleJa: 'のんびり、おだやかに。日本語を 勉強中の 留学生らしく、少し ゆっくり。',
    look: { sex: 'm', age: 25, height: 1.69, build: 0.95, skin: SKIN.medium, hair: { style: 'crew', color: '#111111' },
      outfit: { type: 'polo', top: '#3f7fbf', bottom: '#d8cbb0', accent: '#ffffff' }, extras: [] },
  },
  nishimura: {
    nameJa: '西村 さき', kana: 'にしむら さき', roleEn: 'Department store clerk',
    voice: 'Despina', personaJa: 'デパートの 店員。とても ていねいな 接客の ことば。',
    styleJa: 'デパートの 店員らしく、とても ていねいに、やわらかく。',
    look: { sex: 'f', age: 32, height: 1.62, build: 0.95, skin: SKIN.light, hair: { style: 'bun', color: '#1e1610' },
      outfit: { type: 'store_uniform', top: '#20304f', bottom: '#20304f', accent: '#d95c5c' }, extras: ['scarf', 'badge'] },
  },
  okada: {
    nameJa: '岡田 ひろし', kana: 'おかだ ひろし', roleEn: 'Station staff',
    voice: 'Alnilam', personaJa: '駅員。50代。てきぱき して いて 親切。',
    styleJa: '駅員らしく、はきはき、はっきり。',
    look: { sex: 'm', age: 54, height: 1.72, build: 1.08, skin: SKIN.medium, hair: { style: 'short', color: '#4a4744' },
      outfit: { type: 'station_uniform', top: '#1f2a44', bottom: '#1f2a44', accent: '#c9a54a' }, extras: ['cap', 'badge'] },
  },
  ueda: {
    nameJa: '上田 なな', kana: 'うえだ なな', roleEn: 'Museum receptionist',
    voice: 'Erinome', personaJa: '美術館の 受付。20代後半。はきはき して ていねい。',
    styleJa: '受付らしく、はきはき、ていねいに。',
    look: { sex: 'f', age: 28, height: 1.63, build: 0.95, skin: SKIN.light, hair: { style: 'long', color: '#24180f' },
      outfit: { type: 'museum_uniform', top: '#3c4a3e', bottom: '#2c2f2c', accent: '#e9e3d3' }, extras: ['badge'] },
  },
  sakamoto: {
    nameJa: '坂本 じろう', kana: 'さかもと じろう', roleEn: 'Owner of the café',
    voice: 'Achird', personaJa: '喫茶店の マスター。60代。あごひげ。あたたかい おじいさん。',
    styleJa: 'あたたかく、ゆったり、やさしい おじいさんの ように。',
    look: { sex: 'm', age: 64, height: 1.68, build: 1.12, skin: SKIN.medium, hair: { style: 'bald_top', color: '#cfcac2' },
      outfit: { type: 'apron', top: '#efe9dc', bottom: '#3d2f26', accent: '#6b4a32' }, extras: ['beard', 'apron'] },
  },
  hara: {
    nameJa: '原 きよ', kana: 'はら きよ', roleEn: 'Elderly lady who walks in the park every day',
    voice: 'Vindemiatrix', personaJa: '70代の おばあさん。毎日 公園を さんぽ する。ゆっくり やさしく 話す。',
    styleJa: 'ゆっくり、やさしく、おばあさんらしく。',
    look: { sex: 'f', age: 74, height: 1.5, build: 1.0, skin: SKIN.fair, hair: { style: 'bun', color: '#d7d3cc' },
      outfit: { type: 'cardigan', top: '#9a7f9c', bottom: '#4b4553', accent: '#f1e7d0' }, extras: ['scarf'] },
  },
  noguchi: {
    nameJa: '野口 たくみ', kana: 'のぐち たくみ', roleEn: 'Convenience store clerk, university student',
    voice: 'Zubenelgenubi', personaJa: 'コンビニの アルバイト。20さいの 大学生。ていねいだが 気さく。',
    styleJa: 'コンビニの 店員らしく、明るく、ていねいに。',
    look: { sex: 'm', age: 20, height: 1.75, build: 0.92, skin: SKIN.light, hair: { style: 'wavy', color: '#3b2a1c' },
      outfit: { type: 'konbini', top: '#3a8f6b', bottom: '#2a2d33', accent: '#ffffff' }, extras: ['badge'] },
  },
  takeuchi: {
    nameJa: '竹内 えみ', kana: 'たけうち えみ', roleEn: 'Office worker you meet around town',
    voice: 'Kore', personaJa: '40代の 会社員。てきぱき して いて 親切。',
    styleJa: 'てきぱき、でも 親切に。',
    look: { sex: 'f', age: 43, height: 1.62, build: 1.0, skin: SKIN.fair, hair: { style: 'short', color: '#2a1c14' },
      outfit: { type: 'suit', top: '#6b6f78', bottom: '#4a4d55', accent: '#f2f0ea' }, extras: [] },
  },
};

/** Scene catalog: slots and props (zone = near | npc | far, relative to the learner). */
export const SCENES = {
  office: {
    nameEn: 'Office', slots: ['npc1', 'npc2', 'reception', 'phone'],
    props: { business_card: 'near', my_desk: 'near', pc: 'near', logo_wall: 'far', coffee_machine: 'far', whiteboard: 'far', plant: 'npc', clock: 'far', calendar: 'npc', phone_desk: 'npc', aoki_desk: 'npc', cup: 'npc', meeting_room: 'far', toilet_sign: 'far', elevator: 'far', door: 'far' },
  },
  classroom: {
    nameEn: 'Classroom', slots: ['teacher', 'npc1', 'npc2', 'phone'],
    props: { book: 'near', dictionary: 'near', notebook: 'near', pen: 'near', pencil: 'near', key: 'near', umbrella: 'npc', bag: 'npc', watch: 'npc', camera: 'npc', magazine: 'npc', newspaper: 'far', whiteboard: 'far', map_japan: 'far', clock: 'far', chocolate: 'near', coffee: 'npc', eraser: 'near' },
  },
  apartment: {
    nameEn: 'Apartment corridor', slots: ['npc1', 'npc2', 'phone'],
    props: { gift: 'near', door_neighbor: 'npc', intercom: 'near', nameplate: 'npc', my_door: 'near', bicycle: 'far', mailbox: 'far', umbrella_stand: 'npc', stairs: 'far' },
  },
  depato: {
    nameEn: 'Department store', slots: ['clerk', 'npc1', 'phone'],
    props: { wine_fr: 'npc', wine_it: 'npc', wine_jp: 'npc', tie_blue: 'near', tie_red: 'near', watch_case: 'npc', umbrella_rack: 'far', bag_shelf: 'far', floor_guide: 'near', escalator: 'far', elevator: 'far', register: 'npc', toilet_sign: 'far' },
  },
  museum: {
    nameEn: 'Art museum', slots: ['counter', 'npc1', 'phone'],
    props: { hours_sign: 'npc', ticket: 'npc', poster: 'far', brochure: 'near', clock: 'far', gate: 'far', locker: 'far', painting: 'far', cafe_sign: 'far' },
  },
  station: {
    nameEn: 'Train station', slots: ['staff', 'npc1', 'phone'],
    props: { departure_board: 'far', route_map: 'npc', ticket_machine: 'near', ticket_gate: 'npc', platform_sign: 'far', train: 'far', clock: 'far', bench: 'near', vending_machine: 'far', bus_stop_sign: 'far', platform_sign_2: 'far', post_office: 'far', bank: 'far', supermarket: 'far' },
  },
  cafe: {
    nameEn: 'Café', slots: ['counter', 'npc1', 'npc2', 'phone'],
    props: { menu_board: 'npc', cake_case: 'npc', coffee_cup: 'near', tea_cup: 'near', table: 'near', window: 'far', poster_concert: 'far', newspaper: 'far', register: 'npc' },
  },
  park: {
    nameEn: 'Park', slots: ['npc1', 'npc2', 'phone'],
    props: { sakura: 'npc', bench: 'near', pond: 'far', castle: 'far', vending_machine: 'far', food_stall: 'far', picnic_sheet: 'near', bento: 'near', camera: 'near', bicycle: 'far', drinks: 'near' },
  },
  home: {
    nameEn: 'Japanese home', slots: ['host', 'host2', 'phone'],
    props: { genkan: 'near', slippers: 'near', gift: 'near', sofa: 'npc', table: 'near', tea: 'near', cake: 'near', spoon: 'near', tv: 'far', photo: 'npc', clock: 'far', garden: 'far', kitchen: 'far', piano: 'far' },
  },
  konbini: {
    nameEn: 'Convenience store', slots: ['clerk', 'npc1', 'phone'],
    props: { register: 'npc', atm: 'far', copy_machine: 'far', drinks_fridge: 'far', spices: 'far', onigiri: 'near', bento: 'near', bread: 'npc', magazines: 'far', basket: 'near', toilet_sign: 'far', entrance: 'far', box: 'near', cat: 'npc' },
  },
};

export const TIMES = ['morning', 'noon', 'evening', 'night'];
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const WEATHERS = ['clear', 'cloudy', 'rain'];
