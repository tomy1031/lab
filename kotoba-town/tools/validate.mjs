#!/usr/bin/env node
// Validate lesson scenario files against docs/SCENARIO_SPEC.md.
//   node kotoba-town/tools/validate.mjs            (all data/lessons/l*.json)
//   node kotoba-town/tools/validate.mjs l03 l04    (only these)
// Prints problems and per-variant stats; exits 1 on any error. Prints "OK" when clean.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAST, SCENES, GESTURES, VOICES, TIMES, SEASONS, WEATHERS } from '../js/content/cast.js';
import { variantLines, resolveCharacter } from '../js/content/lines.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'lessons');
const only = process.argv.slice(2).map((a) => a.replace(/\.json$/, ''));
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => /^l\d\d\.json$/.test(f) && (!only.length || only.includes(f.slice(0, 3))))
  : [];

let errors = 0;
let warnings = 0;
const err = (where, msg) => { errors++; console.log(`  ✗ ${where}: ${msg}`); };
const warn = (where, msg) => { warnings++; console.log(`  ! ${where}: ${msg}`); };
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const jaLen = (s) => [...(s || '')].length;
const KANA_ONLY = /^[぀-ゟ゠-ヿ　-〿！-～\s0-9A-Za-z・ー〜～…、。！？「」（）().,!?:%\-]+$/;

if (!files.length) { console.log('no lesson files found'); process.exit(1); }

for (const file of files.sort()) {
  console.log(`${file}`);
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); } catch (e) { err(file, `JSON: ${e.message}`); continue; }
  const L = file.slice(0, 3);
  const n = Number(file.slice(1, 3));
  if (data.lesson !== n) err(L, `lesson must be ${n}`);
  for (const k of ['titleJa', 'titleEn', 'summaryEn']) if (!isStr(data[k])) err(L, `missing ${k}`);
  const gids = new Set();
  if (!Array.isArray(data.grammar) || !data.grammar.length) err(L, 'grammar[] required');
  for (const g of data.grammar || []) {
    if (!/^g\d+$/.test(g.id || '')) err(L, `grammar id "${g.id}" must be g1, g2 …`);
    if (gids.has(g.id)) err(L, `duplicate grammar ${g.id}`);
    gids.add(g.id);
    for (const k of ['pattern', 'meaningEn', 'exampleJa', 'exampleEn']) if (!isStr(g[k])) err(`${L}.${g.id}`, `missing ${k}`);
  }
  if (!Array.isArray(data.vocab) || data.vocab.length < 8) warn(L, 'vocab[] should have 10–25 words');
  for (const v of data.vocab || []) if (!isStr(v.ja) || !isStr(v.kana) || !isStr(v.en)) err(L, `vocab entry incomplete: ${JSON.stringify(v)}`);
  if (!Array.isArray(data.tipsEn) || !data.tipsEn.length) warn(L, 'tipsEn[] recommended');
  if (!data.research || !Array.isArray(data.research.sources) || !data.research.sources.length) err(L, 'research.sources[] required');
  if (!isStr(data.research?.notesEn)) err(L, 'research.notesEn required');
  if (!Array.isArray(data.variants) || data.variants.length !== 3) err(L, 'exactly 3 variants required');

  const targeted = new Set();
  const vids = new Set();
  for (const v of data.variants || []) {
    const V = v.id || '?';
    if (!new RegExp(`^${L}[abc]$`).test(V)) err(V, `variant id must be ${L}a/${L}b/${L}c`);
    if (vids.has(V)) err(V, 'duplicate variant id');
    vids.add(V);
    for (const k of ['titleJa', 'titleEn', 'briefEn', 'roleEn']) if (!isStr(v[k])) err(V, `missing ${k}`);
    const scene = SCENES[v.scene];
    if (!scene) err(V, `unknown scene "${v.scene}"`);
    const s = v.setup || {};
    if (s.time && !TIMES.includes(s.time)) err(V, `setup.time "${s.time}"`);
    if (s.season && !SEASONS.includes(s.season)) err(V, `setup.season "${s.season}"`);
    if (s.weather && !WEATHERS.includes(s.weather)) err(V, `setup.weather "${s.weather}"`);
    if (!Array.isArray(v.missionsEn) || v.missionsEn.length < 2 || v.missionsEn.length > 4) err(V, 'missionsEn needs 2–4 items');
    for (const m of v.missionsEn || []) {
      if (!isStr(m.text)) err(V, 'mission without text');
      for (const g of m.grammar || []) if (!gids.has(g)) err(V, `mission grammar ${g} unknown`);
    }
    // characters
    const chars = {};
    if (!Array.isArray(v.characters) || !v.characters.length) err(V, 'characters[] required');
    let newChars = 0;
    for (const c of v.characters || []) {
      const r = resolveCharacter(c);
      if (!r) { err(V, `unknown character ${JSON.stringify(c)}`); continue; }
      if (typeof c === 'object') {
        newChars++;
        if (CAST[c.id]) err(V, `inline character id "${c.id}" collides with cast`);
        for (const k of ['nameJa', 'kana', 'roleEn', 'voice', 'personaJa']) if (!isStr(c[k])) err(V, `inline character ${c.id} missing ${k}`);
        if (!c.look || !c.look.sex || !c.look.hair || !c.look.outfit) err(V, `inline character ${c.id} needs look {sex, hair, outfit …}`);
      }
      if (!VOICES.includes(r.voice)) err(V, `character ${r.id} voice "${r.voice}" is not a Gemini voice`);
      chars[r.id] = r;
    }
    if (newChars > 1) warn(V, 'more than one new character');
    const pos = v.positions || {};
    for (const [cid, slot] of Object.entries(pos)) {
      if (!chars[cid]) err(V, `positions: ${cid} not in characters`);
      if (scene && !scene.slots.includes(slot)) err(V, `positions: slot "${slot}" not in scene ${v.scene} (${scene.slots.join(', ')})`);
    }
    if (v.call && !Object.values(pos).includes('phone')) warn(V, 'call:true but nobody is in the "phone" slot');

    // nodes
    const nodes = {};
    for (const nd of v.nodes || []) {
      if (!isStr(nd.id)) { err(V, 'node without id'); continue; }
      if (nodes[nd.id]) err(V, `duplicate node ${nd.id}`);
      nodes[nd.id] = nd;
    }
    if (!nodes[v.start]) err(V, `start "${v.start}" is not a node`);
    for (const nd of Object.values(nodes)) {
      const W = `${V}.${nd.id}`;
      const exits = ['listen', 'next', 'nextRandom'].filter((k) => nd[k] !== undefined).length;
      if (nd.end) { if (exits) err(W, 'end node must not have listen/next'); }
      else if (exits !== 1) err(W, 'needs exactly one of listen / next / nextRandom (or end:true)');
      if (nd.say !== undefined && !Array.isArray(nd.say)) err(W, 'say must be an array');
      if ((nd.say || []).length > 3) warn(W, 'more than 3 lines in one node');
      for (const line of nd.say || []) {
        if (!chars[line.who]) err(W, `say.who "${line.who}" not in characters`);
        for (const l of [line, ...(line.alts || [])]) {
          if (!isStr(l.ja) || !isStr(l.kana) || !isStr(l.en)) err(W, `line needs ja, kana, en: ${JSON.stringify(l).slice(0, 80)}`);
          if (jaLen(l.ja) > 45) err(W, `line longer than 45 chars: ${l.ja}`);
          if (l.kana && !KANA_ONLY.test(l.kana)) err(W, `kana must not contain kanji: ${l.kana}`);
        }
        if (line.gesture && !GESTURES.includes(line.gesture)) err(W, `unknown gesture ${line.gesture}`);
        if (line.gesture === 'point' && (!line.target || !scene?.props[line.target])) err(W, `point gesture needs a prop target of scene ${v.scene}`);
      }
      if (nd.focus && scene && !scene.props[nd.focus]) err(W, `focus "${nd.focus}" is not a prop of ${v.scene}`);
      if (nd.next && !nodes[nd.next]) err(W, `next "${nd.next}" missing`);
      if (nd.nextRandom) {
        if (!Array.isArray(nd.nextRandom) || nd.nextRandom.length < 2) err(W, 'nextRandom needs ≥2 ids');
        for (const id of nd.nextRandom || []) if (!nodes[id]) err(W, `nextRandom "${id}" missing`);
      }
      const li = nd.listen;
      if (li) {
        if (!isStr(li.promptEn)) err(W, 'listen.promptEn required');
        if (!Array.isArray(li.grammar) || !li.grammar.length) err(W, 'listen.grammar required');
        for (const g of li.grammar || []) { if (!gids.has(g)) err(W, `listen grammar ${g} unknown`); targeted.add(g); }
        if (!isStr(li.hintJa)) err(W, 'listen.hintJa required');
        if (!Array.isArray(li.modelAnswers) || !li.modelAnswers.length || li.modelAnswers.length > 3) err(W, 'listen.modelAnswers needs 1–3');
        if (!Array.isArray(li.branches) || li.branches.length < 2 || li.branches.length > 4) err(W, 'listen.branches needs 2–4');
        const bids = new Set();
        for (const b of li.branches || []) {
          if (!/^[a-z0-9_]+$/.test(b.id || '')) err(W, `branch id "${b.id}" must be snake_case`);
          if (bids.has(b.id)) err(W, `duplicate branch ${b.id}`);
          bids.add(b.id);
          if (!isStr(b.whenEn)) err(W, `branch ${b.id} needs whenEn`);
          if (!isStr(b.exampleJa)) err(W, `branch ${b.id} needs exampleJa`);
          if (!nodes[b.next]) err(W, `branch ${b.id} next "${b.next}" missing`);
        }
        if (!nodes[li.fallback]) err(W, `listen.fallback "${li.fallback}" missing`);
      }
    }
    // reachability + every path ends
    const succ = (nd) => nd.end ? [] : nd.listen ? [...new Set([...nd.listen.branches.map((b) => b.next), nd.listen.fallback])] : nd.nextRandom ? nd.nextRandom : nd.next ? [nd.next] : [];
    const seen = new Set();
    const stack = [v.start];
    while (stack.length) { const id = stack.pop(); if (seen.has(id) || !nodes[id]) continue; seen.add(id); stack.push(...succ(nodes[id])); }
    for (const id of Object.keys(nodes)) if (!seen.has(id)) warn(`${V}.${id}`, 'unreachable node');
    // can every reachable node reach an end?
    const canEnd = new Set(Object.values(nodes).filter((x) => x.end).map((x) => x.id));
    for (let changed = true; changed;) {
      changed = false;
      for (const nd of Object.values(nodes)) if (!canEnd.has(nd.id) && succ(nd).some((s2) => canEnd.has(s2))) { canEnd.add(nd.id); changed = true; }
    }
    for (const id of seen) if (!canEnd.has(id)) err(`${V}.${id}`, 'cannot reach an end node');
    if (![...seen].some((id) => nodes[id]?.end)) err(V, 'no reachable end node');
    // longest listen count along simple paths (bounded DFS)
    let maxListens = 0; let minListens = Infinity;
    const dfs = (id, depth, visited) => {
      const nd = nodes[id]; if (!nd) return;
      const d = depth + (nd.listen ? 1 : 0);
      if (nd.end) { maxListens = Math.max(maxListens, d); minListens = Math.min(minListens, d); return; }
      for (const s2 of succ(nd)) if (!visited.has(s2)) { visited.add(s2); dfs(s2, d, visited); visited.delete(s2); }
    };
    dfs(v.start, 0, new Set([v.start]));
    if (v.freeTalk) {
      if (!isStr(v.freeTalk.openerJa) || !isStr(v.freeTalk.openerEn) || !isStr(v.freeTalk.topicEn)) err(V, 'freeTalk needs openerJa, openerEn, topicEn');
      if (v.freeTalk.openerJa && jaLen(v.freeTalk.openerJa) > 45) err(V, 'freeTalk.openerJa longer than 45 chars');
    }
    const lines = variantLines(v);
    if (lines.length > 22) err(V, `${lines.length} spoken lines — keep it to 12–18 (voice budget)`);
    else if (lines.length > 18) warn(V, `${lines.length} spoken lines (target 12–18)`);
    if (minListens < 3) warn(V, `a path with only ${minListens} learner turn(s) (aim 4–6)`);
    console.log(`  · ${V} [${v.scene}] ${Object.keys(nodes).length} nodes, ${lines.length} lines, learner turns ${minListens}–${maxListens}`);
  }
  for (const g of gids) if (!targeted.has(g)) warn(L, `grammar ${g} is never targeted by a listen`);
}

console.log(errors ? `\n${errors} error(s), ${warnings} warning(s)` : warnings ? `\nOK (${warnings} warning(s))` : '\nOK');
process.exit(errors ? 1 : 0);
