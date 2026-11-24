// js/areas.js — the places you can fly: famous presets, your downloaded areas (kept in this browser),
// and the download / delete of an area's tiles.
import { Plan, normArea } from './plan.js';
import { getTile, tileCache, Missing } from './tiles.js';
import { fetchBuildings, buildingsKey } from './buildings.js';

export const PRESETS = [
  { name: '富士山', sub: '日本・静岡／山梨', lat: 35.3606, lon: 138.7274, start: { alt: 5200, heading: 200, back: 9000 } },
  { name: '東京', sub: '日本・皇居と丸の内', lat: 35.6812, lon: 139.7671, buildings: true, bRadius: 2500, start: { alt: 700, heading: 200, back: 3500 } },
  { name: '横浜 みなとみらい', sub: '日本・神奈川', lat: 35.4560, lon: 139.6380, buildings: true, start: { alt: 500, heading: 300, back: 2500 } },
  { name: 'グランドキャニオン', sub: 'アメリカ・アリゾナ', lat: 36.0570, lon: -112.1400, start: { alt: 2900, heading: 10, back: 3000 } },
  { name: 'ニューヨーク', sub: 'アメリカ・マンハッタン', lat: 40.7580, lon: -73.9855, buildings: true, bRadius: 2500, start: { alt: 700, heading: 20, back: 4000 } },
  { name: 'ヨセミテ', sub: 'アメリカ・カリフォルニア', lat: 37.7300, lon: -119.5700, start: { alt: 2600, heading: 70, back: 4000 } },
  { name: 'ハワイ ダイヤモンドヘッド', sub: 'アメリカ・オアフ島', lat: 21.2620, lon: -157.8060, buildings: true, start: { alt: 700, heading: 290, back: 3000 } },
  { name: 'マッターホルン', sub: 'スイス・ツェルマット', lat: 45.9763, lon: 7.6586, start: { alt: 4700, heading: 230, back: 6000 } },
  { name: 'パリ', sub: 'フランス・エッフェル塔とセーヌ川', lat: 48.8580, lon: 2.3200, buildings: true, start: { alt: 600, heading: 80, back: 3500 } },
  { name: 'モンサンミシェル', sub: 'フランス・ノルマンディー', lat: 48.6361, lon: -1.5115, buildings: true, bRadius: 1500, start: { alt: 400, heading: 180, back: 2500 } },
  { name: 'ヴェネツィア', sub: 'イタリア', lat: 45.4380, lon: 12.3350, buildings: true, start: { alt: 600, heading: 120, back: 3000 } },
  { name: 'エベレスト', sub: 'ネパール／中国・ヒマラヤ', lat: 27.9881, lon: 86.9250, start: { alt: 8000, heading: 0, back: 9000 } },
  { name: 'ガイランゲルフィヨルド', sub: 'ノルウェー', lat: 62.1050, lon: 7.0950, start: { alt: 900, heading: 270, back: 3000 } },
  { name: 'カッパドキア', sub: 'トルコ', lat: 38.6430, lon: 34.8290, start: { alt: 1600, heading: 0, back: 2500 } },
  { name: 'ドバイ', sub: 'UAE・ブルジュ・ハリファ', lat: 25.1972, lon: 55.2744, buildings: true, start: { alt: 700, heading: 40, back: 3500 } },
  { name: '桂林', sub: '中国・漓江のカルスト', lat: 24.9500, lon: 110.4300, start: { alt: 900, heading: 180, back: 3000 } },
  { name: 'シドニー', sub: 'オーストラリア・オペラハウス', lat: -33.8568, lon: 151.2153, buildings: true, start: { alt: 600, heading: 60, back: 3000 } },
  { name: 'リオデジャネイロ', sub: 'ブラジル・コルコバードの丘', lat: -22.9519, lon: -43.2105, buildings: true, start: { alt: 900, heading: 120, back: 3500 } },
  { name: 'マチュピチュ', sub: 'ペルー・アンデス', lat: -13.1631, lon: -72.5450, start: { alt: 3000, heading: 330, back: 3000 } },
  { name: 'テーブルマウンテン', sub: '南アフリカ・ケープタウン', lat: -33.9628, lon: 18.4098, buildings: true, start: { alt: 1400, heading: 10, back: 4000 } },
];

const KEY = 'sky-atlas:areas';

export class AreaStore {
  constructor() {
    this.list = [];
    try { this.list = JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch { this.list = []; }
    this.list = this.list.filter((a) => a && typeof a.lat === 'number');
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.list)); } catch { /* storage blocked: lives for this visit */ }
  }
  get(id) { return this.list.find((a) => a.id === id) || null; }
  put(rec) {
    const i = this.list.findIndex((a) => a.id === rec.id);
    if (i >= 0) this.list[i] = rec; else this.list.unshift(rec);
    this.save();
  }
  remove(id) {
    this.list = this.list.filter((a) => a.id !== id);
    this.save();
  }
}

export const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

// download every tile of an area into the tile store. Resumable: tiles already stored are skipped.
// onProgress({ done, total, bytes, failed, phase })
export async function downloadArea(areaIn, { onProgress = () => {}, signal } = {}) {
  const plan = new Plan(areaIn);
  const area = plan.area;
  const jobs = plan.jobs();
  const total = jobs.length + (plan.buildings ? 1 : 0);
  const st = { done: 0, total, bytes: 0, failed: 0, phase: 'tiles' };
  try { await navigator.storage?.persist?.(); } catch { /* not granted: the browser may still keep it */ }
  const c = await tileCache();
  if (!c) throw new Error('このブラウザでは保存できません（Cache Storage が使えない）');
  let last = 0;
  const tick = (force) => {
    const now = performance.now();
    if (force || now - last > 120) { last = now; onProgress({ ...st }); }
  };
  // one job: try its URLs best-first, keep the first that exists
  const runJob = async (job) => {
    for (const url of job.urls) {
      for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
        try {
          const blob = await getTile(url, { store: true, signal });
          st.bytes += blob.size;
          return true;
        } catch (e) {
          if (e instanceof Missing) break; // next source
          if (e.name === 'AbortError') throw e;
          if (attempt >= 3) { st.failed++; return false; }
          await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        }
      }
    }
    return true; // no source has it (e.g. ocean): nothing to show there, that is fine
  };
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      await runJob(job);
      st.done++;
      tick();
    }
  };
  const conc = plan.aerial && plan.aerial.conc < 6 ? 5 : 6;
  await Promise.all(Array.from({ length: conc }, worker));
  if (plan.buildings) {
    st.phase = 'buildings';
    tick(true);
    try {
      const n = await fetchBuildings(plan, { signal, store: true });
      st.buildings = n;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      st.failed++;
      st.buildingsError = String(e.message || e);
    }
    st.done++;
  }
  st.phase = 'done';
  tick(true);
  return { area, plan, ...st };
}

// delete an area: remove its tiles unless another saved area still uses them
export async function deleteArea(store, id) {
  const rec = store.get(id);
  store.remove(id);
  if (!rec) return 0;
  const c = await tileCache();
  if (!c) return 0;
  const keep = new Set();
  for (const other of store.list) for (const u of new Plan(other).allUrls()) keep.add(u);
  const plan = new Plan(rec);
  const drop = [...plan.allUrls()].filter((u) => !keep.has(u));
  if (plan.buildings) drop.push(buildingsKey(plan.area));
  // in parallel batches: one by one, a few thousand deletes take half a minute
  let n = 0;
  for (let i = 0; i < drop.length; i += 64) {
    const done = await Promise.all(drop.slice(i, i + 64).map((u) => c.delete(u).catch(() => false)));
    n += done.filter(Boolean).length;
  }
  return n;
}

export async function storageInfo() {
  try {
    const e = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    return { usage: e.usage || 0, quota: e.quota || 0, persisted };
  } catch { return null; }
}

export { normArea };
