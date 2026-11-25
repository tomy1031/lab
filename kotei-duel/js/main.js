// js/main.js — KOTEI DUEL: the flow of the game around the rules engine.
//   title (a demo duel plays itself behind it) → chapter intro → duel → result → lessons → quiz → next chapter
// The same 3D table is played on a PC / phone (mouse, touch) and in VR (Meta Quest controllers or hands).
// Every event of the engine is "presented" here: the table is synced, an effect plays, a sound, a log line —
// then the engine goes on. Cut-ins ask the player; lessons and hints open as dialogs; chapter 1 is a step-by-step
// tutorial that only lets you do the move the guide asks for.
import * as THREE from 'three';
import { Core } from './core.js';
import { Room, TABLE_H } from './room.js';
import { Table, hologram, Z } from './table.js';
import { FX } from './fx.js';
import { Avatar } from './avatar.js';
import { Pointer } from './input.js';
import { Sound } from './audio.js';
import { PageUI } from './ui.js';
import { VRUI } from './vrui.js';
import { Duel, C } from './engine.js';
import { cardFace } from './faces.js';
import { html, plain } from './text.js';
import { CARDS, KINDS, TAGS } from './data/cards.js';
import { CHAPTERS, CHAPTER_BY_ID, TRACKS } from './data/chapters.js';
import { LESSONS, LESSON_BY_ID } from './data/lessons.js';
import { QUIZ, QUIZ_PER_DUEL } from './data/quiz.js';
import { TUTORIAL, SPEAKERS, HINTS } from './data/tutorial.js';

const $ = (id) => document.getElementById(id);
const STORE = 'koteiduel.v1';
const params = new URLSearchParams(location.search);
class Abort extends Error {}

const DEFAULTS = { ruby: true, en: true, speed: 1, music: true, sound: true, lessons: 'full', easy: false, unlockAll: false };
const SETTING_UI = [
  ['ruby', 'ふりがな', [[true, 'あり'], [false, 'なし']]],
  ['en', '英語の 補助 English', [[true, 'あり'], [false, 'なし']]],
  ['speed', '演出の 速さ', [[1, 'ふつう'], [0.55, 'はやい'], [1.5, 'ゆっくり']]],
  ['lessons', '試合中の 教訓', [['full', 'くわしく'], ['short', 'みじかく（題名だけ）']]],
  ['easy', 'むずかしさ', [[false, 'ふつう（信頼 20）'], [true, 'やさしい（信頼 24）']]],
  ['music', '音楽', [[true, 'あり'], [false, 'なし']]],
  ['sound', '効果音', [[true, 'あり'], [false, 'なし']]],
  ['unlockAll', '章', [[false, 'クリアで 順番に ひらく'], [true, 'すべて ひらく（研修の先生用）']]],
];

function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function save(d) { try { localStorage.setItem(STORE, JSON.stringify(d)); } catch { /* private mode */ } }

const RULES_TEXT = [
  '{机|つくえ}の **V{字|じ}** に、**{工程|こうてい}カード** を{左|ひだり}から{順番|じゅんばん}に{置|お}いて、**リリース** まで{進|すす}めます。リリースのあと、{決|き}まったターンのあいだ **{信頼|しんらい}** を{守|まも}れば{勝|か}ちです。',
  '{工程|こうてい}を{置|お}くと **バグ** が{入|はい}ります。バグは、{工程|こうてい}が 1 つ{進|すす}むたびに **{大|おお}きさが 2 {倍|ばい}**（1→2→4→8）。**レビュー** ですぐ{直|なお}すのが{一番|いちばん}{安|やす}い（{工数|こうすう} 1）。V{字|じ}の **{向|む}かい{側|がわ}のテスト** を{置|お}くとバグが{見|み}つかり、**{大|おお}きさと{同|おな}じ{工数|こうすう}** で{直|なお}せます。{残|のこ}したままリリースすると **{本番障害|ほんばんしょうがい}** になります。',
  '{相手|あいて}（お{客|きゃく}さま・トラブルの{化身|けしん}）は **トラブル** を{出|だ}します。トラブルは{毎|まい}ターン、**{圧力|あつりょく}** の{数|かず}だけ{信頼|しんらい}を{減|へ}らします。**なかま** で「{対応|たいおう}」して{圧力|あつりょく}を{下|さ}げます。{出|で}たばかり（NEW）のトラブルは「すぐ{報告|ほうこく}」で{消|け}せます。',
  '**そなえ** をふせておくと、{相手|あいて}のカードに **わりこみ** できます（{変更管理|へんこうかんり}、{議事録|ぎじろく} など）。{工程|こうてい}に **{承認|しょうにん}**（ハンコ）をもらうと、あいまいな{要望|ようぼう}でこわされません。',
  '{信頼|しんらい}が 0 になると{負|ま}け。**{納期|のうき}** のターンまでにリリースできないと、{毎|まい}ターン{信頼|しんらい}が{減|へ}ります。',
];
const HOWTO_PC = 'カードやマスを **{押|お}して{選|えら}ぶ** → {光|ひか}っている{所|ところ}を{押|お}すか、{右|みぎ}のボタンを{押|お}す。{右|みぎ}クリックで{選|えら}ぶのをやめる。';
const HOWTO_VR = 'レーザーで **{指|さ}して{引|ひ}き{金|がね}**（ハンドトラッキングは{親指|おやゆび}と{人差|ひとさ}し{指|ゆび}でつまむ）。B / Y で{選|えら}ぶのをやめる。{右|みぎ}の{板|いた}に「ターン{終了|しゅうりょう}」。';

class App {
  constructor() {
    this.store = load();
    this.settings = { ...DEFAULTS, ...(this.store.settings || {}) };
    this.progress = { cleared: {}, lessons: {}, hints: {}, quiz: { right: 0, total: 0 }, ...(this.store.progress || {}) };
    document.body.classList.toggle('noruby', !this.settings.ruby);
    document.body.classList.toggle('noen', !this.settings.en);
    this.core = new Core();
    this.scene = this.core.scene;
    this.camera = this.core.camera;
    this.renderer = this.core.renderer;
    this.rig = this.core.rig;
    this.room = new Room(this.scene, this.renderer);
    this.sound = new Sound();
    this.sound.muted = !this.settings.sound;
    this.sound.musicOn = this.settings.music;
    this.table = new Table(this);
    this.camera.add(this.table.handGroup);
    this.fx = new FX(this);
    this.avatar = new Avatar(this.scene);
    this.pointer = new Pointer(this);
    this.ui = new PageUI(this);
    this.vr = new VRUI(this);
    this.vr.onAction = (id) => this.onButton(id);
    this.sel = null;
    this.D = null;
    this.duelN = 0;
    this.mode = 'title';
    this.core.onFrame = (dt) => this.frame(dt);
    this.core.onVRStart = () => this.onVRStart();
    this.core.onVRExit = () => this.onVRExit();
    this.core.onCalibrated = () => { this.table.vr = true; this.toastVR('{机|つくえ}を あなたに{合|あ}わせました'); };
    this.bindPage();
    this.renderTitle();
    this.ui.show('start');
    $('loading').classList.add('hidden');
    this.core.offline();
    if (params.has('chapter')) this.startChapter(params.get('chapter'));
    else if (!params.has('nodemo')) this.runDemo();
  }

  // ---------- small helpers used by the UI ----------
  targets() { return this.ui.dialogOpen ? [] : this.table.targets(); }
  cardData(id) { return C(id) || {}; }
  speaker(id) { return SPEAKERS[id] || SPEAKERS.hendy; }
  wait(sec) {
    const k = this.demo ? 0.35 : this.settings.speed;
    // (tests: ?fast — still give the page one turn of its event loop, so frames are drawn and effects end)
    return new Promise((r) => setTimeout(r, params.has('fast') ? 0 : sec * 1000 * k));
  }
  get xrActive() { return this.core.xrActive; }
  saveAll() { this.store.settings = this.settings; this.store.progress = this.progress; save(this.store); }
  isUnlocked(ch) { if (this.settings.unlockAll || params.has('unlock') || ch.no === 1) return true; const prev = CHAPTERS.find((c) => c.no === ch.no - 1); return !!(prev && this.progress.cleared[prev.id]); }
  idleHint() {
    const D = this.D;
    if (!D || this.mode !== 'duel') return this.xrActive ? HOWTO_VR : HOWTO_PC;
    if (D.side !== 'p') return '{相手|あいて}のターンです。';
    const next = D.track[D.ptr];
    const tips = [];
    if (!D.released && next && D.canPlace(D.ptr)) tips.push(`V{字|じ}の{光|ひか}っているマス（${C(next).name}）を{押|お}すと{置|お}けます。`);
    if (D.canReview()) tips.push('{新|あたら}しい{工程|こうてい}に{見|み}つかっていないバグがあります。**レビュー**（{工数|こうすう} 1）で{直|なお}せます。');
    if (D.p.team.some((u) => !u.acted && !u.tired) && D.e.field.length) tips.push('なかまを{選|えら}んで、トラブルを{押|お}すと「{対応|たいおう}」できます。');
    if (!tips.length) tips.push('できることがなければ「ターン{終了|しゅうりょう}」。');
    return tips.join('\n') + '\n\n' + (this.xrActive ? HOWTO_VR : HOWTO_PC);
  }

  // ---------- title page ----------
  bindPage() {
    $('btn-play').onclick = () => { this.sound.init(); this.startChapter(this.nextChapter()); };
    $('btn-vr').onclick = async () => { this.sound.init(); await this.core.enterVR(); };
    $('btn-rules').onclick = () => this.showRules();
    $('btn-book').onclick = () => this.showBook();
    $('btn-cards').onclick = () => this.showCards();
    $('menu-btn').onclick = () => this.menu();
    this.core.vrSupported().then((ok) => {
      $('btn-vr').disabled = !ok;
      $('vr-note').innerHTML = html(ok ? 'Meta Quest などの VR ゴーグルで、{座|すわ}ったまま {机|つくえ}に{向|む}かって {遊|あそ}べます。' : 'この ブラウザでは VR が {使|つか}えません（Quest の ブラウザなら VR で {遊|あそ}べます）。PC・スマホで どうぞ。', this.settings.ruby);
    });
    addEventListener('keydown', (e) => {
      if (this.mode !== 'duel' || this.ui.dialogOpen || e.target?.tagName === 'SELECT') return;
      if (e.key === 'Escape') this.clearSel();
      if (e.key === 'e' || e.key === 'E') this.onButton('end');
      if (e.key === 'r' || e.key === 'R') this.onButton('review');
    });
  }
  nextChapter() {
    const open = CHAPTERS.filter((c) => this.isUnlocked(c));
    const first = open.find((c) => !this.progress.cleared[c.id]);
    return (first || open[open.length - 1] || CHAPTERS[0]).id;
  }
  renderTitle() {
    const r = this.settings.ruby;
    const el = $('chapters');
    el.innerHTML = '';
    for (const ch of CHAPTERS) {
      const b = document.createElement('button');
      b.className = 'chap';
      const open = this.isUnlocked(ch);
      b.disabled = !open;
      const stars = this.progress.cleared[ch.id] || 0;
      b.innerHTML = `<span class="no">${ch.no}</span><b>${html(ch.title, r)}</b><span class="stars">${open ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒'}</span>
        <small>${html(ch.enemy.name, r)}・${html(TRACKS[ch.track].label, r)}<br>${html(ch.goal, r)}</small>`;
      b.onclick = () => { this.sound.init(); this.startChapter(ch.id); };
      el.appendChild(b);
    }
    const st = $('settings');
    st.innerHTML = '';
    for (const [k, label, opts] of SETTING_UI) {
      const row = document.createElement('label');
      row.className = 'setrow';
      row.innerHTML = `<span>${label}</span>`;
      const sel = document.createElement('select');
      for (const [v, t] of opts) { const o = document.createElement('option'); o.value = JSON.stringify(v); o.textContent = t; sel.appendChild(o); }
      sel.value = JSON.stringify(this.settings[k]);
      sel.onchange = () => this.setSetting(k, JSON.parse(sel.value));
      row.appendChild(sel);
      st.appendChild(row);
    }
  }
  setSetting(k, v) {
    this.settings[k] = v;
    this.saveAll();
    if (k === 'ruby') { document.body.classList.toggle('noruby', !v); this.vr.setRuby(v); this.table.reset(); if (this.D) { this.table.setTrack(this.D); this.table.sync(this.D); } }
    if (k === 'en') document.body.classList.toggle('noen', !v);
    if (k === 'sound') this.sound.muted = !v;
    if (k === 'music') { this.sound.musicOn = v; this.sound.music(v && this.mode === 'duel', this.tense); }
    if (k === 'unlockAll' || k === 'ruby') this.renderTitle();
    this.refresh();
  }

  async showRules() {
    const how = this.xrActive ? HOWTO_VR : HOWTO_PC;
    const body = RULES_TEXT.map((t, i) => `${i + 1}. ${t}`).join('\n') + '\n\n' + how;
    await this.dialog({ tag: 'あそびかた', title: '2 {分|ふん}でわかるルール', body, en: 'Place stages on the V up to Release, then protect Trust during operation. Bugs double each stage; find them with the paired test, fix them early. Respond to troubles with members; set guards to cut in.', buttons: [{ id: 'ok', label: 'わかった', primary: true }], dismiss: 'ok', color: '#7fe3ff', bodySize: 0.032 });
  }
  async showBook() {
    const r = this.settings.ruby;
    const got = LESSONS.filter((l) => this.progress.lessons[l.id]).length;
    const items = LESSONS.map((l) => {
      const open = this.progress.lessons[l.id];
      return `<div class="lesson ${open ? '' : 'locked'}"><b>${l.id.replace('L', '')}. ${open ? html(l.title, r) : '？？？（まだ ひらいていない {教訓|きょうくん}）'.replace(/\{([^|]+)\|([^}]+)\}/g, r ? '<ruby>$1<rt>$2</rt></ruby>' : '$1')}</b>
        ${open ? `<p>${html(l.body, r)}</p><p class="en">${l.en}</p><small>${html(l.source, r)}</small>` : ''}</div>`;
    }).join('');
    if (this.xrActive) {
      const open = LESSONS.filter((l) => this.progress.lessons[l.id]);
      let i = 0;
      while (open.length) {
        const l = open[i];
        const c = await this.dialog({ tag: `{教訓|きょうくん}{図鑑|ずかん} ${i + 1} / ${open.length}（{全部|ぜんぶ}で ${LESSONS.length}）`, title: l.title, body: l.body, en: l.en, color: '#ffcf3f', buttons: [{ id: 'prev', label: '← {前|まえ}' }, { id: 'next', label: '{次|つぎ} →' }, { id: 'close', label: 'とじる', primary: true }] });
        if (c === 'close') break;
        i = (i + (c === 'next' ? 1 : open.length - 1)) % open.length;
      }
      if (!open.length) await this.dialog({ tag: '{教訓|きょうくん}{図鑑|ずかん}', title: 'まだ {教訓|きょうくん}がありません', body: 'デュエルで{教訓|きょうくん}を{集|あつ}めましょう。', buttons: [{ id: 'ok', label: 'とじる', primary: true }] });
      return;
    }
    await this.dialog({ tag: '{教訓|きょうくん}{図鑑|ずかん}', title: `{集|あつ}めた{教訓|きょうくん} ${got} / ${LESSONS.length}`, html: `<div class="book">${items}</div>`, color: '#ffcf3f', buttons: [{ id: 'ok', label: 'とじる', primary: true }], dismiss: 'ok' });
  }
  async showCards() {
    const r = this.settings.ruby;
    const groups = ['stage', 'unit', 'skill', 'guard', 'doc', 'trouble', 'event', 'plot'];
    const out = groups.map((k) => {
      const list = CARDS.filter((c) => c.kind === k);
      return `<h4 style="margin:14px 0 6px;color:var(--accent)">${html(KINDS[k].label, r)}（${KINDS[k].en}） ${list.length}</h4>` + list.map((c) => `<div class="lesson"><b>${html(c.name, r)}</b> <small>${c.en}${c.cost != null ? ' ・コスト ' + c.cost : ''}${c.power ? ' ・力 ' + c.power : ''}${c.pressure ? ' ・圧力 ' + c.pressure : ''}${c.tag ? ' ・' + html(TAGS[c.tag].label, r) : ''}</small><p>${html(c.text, r)}</p><p style="color:#ffe9a6">💡 ${html(c.flavor, r)}</p><p class="en">${c.flavorEn}</p></div>`).join('');
    }).join('');
    await this.dialog({ tag: 'カード{一覧|いちらん}', title: `{全部|ぜんぶ}で ${CARDS.length - 1} {枚|まい}`, html: `<div class="book">${out}</div>`, color: '#7fe3ff', buttons: [{ id: 'ok', label: 'とじる', primary: true }], dismiss: 'ok' });
  }

  // a dialog on the page or in VR
  dialog(spec) { return this.xrActive ? this.vr.dialog(spec) : this.ui.dialog(spec); }
  bubble(spec) { if (this.xrActive) this.vr.showBubble(spec); this.ui.bubble(spec); }
  hideBubble() { this.vr.hideBubble(); this.ui.hideBubble(); }
  banner(text, opts = {}) { this.ui.banner(text, { ...opts, ms: (opts.ms || 1200) * (this.demo ? 0.5 : this.settings.speed) }); if (this.xrActive) this.fx.banner3d(text, { color: opts.color, sub: opts.sub, life: 1.4 * this.settings.speed }); }
  toastVR(msg) { if (this.xrActive) this.fx.banner3d(msg, { color: '#7fe3ff', life: 1.6 }); else this.core.toast(plain(msg)); }
  log(text, cls) { if (!this.demo) this.ui.log(text, cls); }

  // ---------- VR session ----------
  onVRStart() {
    this.table.vr = true;
    this.vr.setVisible(true);
    this.ui.closeDialog?.('close');
    $('start').classList.add('hidden');
    if (this.mode !== 'duel') this.vrMenu();
    this.refresh();
  }
  onVRExit() {
    this.table.vr = false;
    this.vr.setVisible(false);
    this.vr.closeDialog('close');
    this.ui.show(this.mode === 'duel' ? 'duel' : 'start');
    this.refresh();
  }
  async vrMenu() {
    if (this.vrMenuOpen) return;
    this.vrMenuOpen = true;
    try {
      while (this.xrActive && this.mode !== 'duel') {
        const btns = CHAPTERS.map((ch) => ({ id: ch.id, label: `${ch.no}. ${plain(ch.title)} ${this.isUnlocked(ch) ? '★'.repeat(this.progress.cleared[ch.id] || 0) : '🔒'}`, disabled: !this.isUnlocked(ch) }));
        btns.push({ id: 'rules', label: 'あそびかた' }, { id: 'book', label: '{教訓|きょうくん}{図鑑|ずかん}' }, { id: 'ruby', label: this.settings.ruby ? 'ふりがな：あり' : 'ふりがな：なし' }, { id: 'en', label: this.settings.en ? 'English：あり' : 'English：なし' }, { id: 'exit', label: 'VR を{終|お}わる' });
        const c = await this.vr.dialog({ tag: 'KOTEI DUEL　{工程|こうてい}デュエル', title: '{章|しょう}をえらぶ', body: 'V{字|じ}の{約束|やくそく}を{守|まも}って、プロジェクトを{成功|せいこう}させよう。', buttons: btns, color: '#ffcf3f' });
        if (!this.xrActive) break;
        if (c === 'exit') { this.core.exitVR(); break; }
        if (c === 'rules') await this.showRules();
        else if (c === 'book') await this.showBook();
        else if (c === 'ruby' || c === 'en') this.setSetting(c, !this.settings[c]);
        else if (CHAPTER_BY_ID[c]) { this.vrMenuOpen = false; this.startChapter(c); return; }
      }
    } finally { this.vrMenuOpen = false; }
  }

  // ---------- demo (behind the title) ----------
  async runDemo() {
    const { playTurn } = await import('./bot.js').catch(() => ({}));
    if (!playTurn) return;
    this.demo = true;
    const n = ++this.duelN;
    let seed = 7;
    while (this.duelN === n) {
      const D = this.newDuel('ch4', seed++, n);
      try {
        await D.start();
        while (!D.over && this.duelN === n) {
          while (document.hidden && this.duelN === n) await new Promise((r) => setTimeout(r, 500));
          await playTurn(D, 'good');
          await this.wait(0.6);
          await new Promise((r) => requestAnimationFrame(() => r()));
          if (D.over) break;
          await D.endTurn();
        }
        await this.wait(2.5);
      } catch (e) { if (!(e instanceof Abort)) { console.error(e); break; } }
    }
  }

  newDuel(chId, seed, n, rules) {
    const D = new Duel(chId, {
      seed,
      rules,
      emit: async (ev, DD) => { if (this.duelN !== n) throw new Abort(); await this.present(ev, DD); if (this.duelN !== n) throw new Abort(); },
      ask: async (kind, info, DD) => { if (this.duelN !== n) throw new Abort(); return this.ask(kind, info, DD); },
    });
    this.D = D;
    this.sel = null;
    this.table.reset();
    this.fx.clear();
    this.table.setTrack(D);
    this.avatar.set(D.ch.enemy.art);
    this.avatar.setMood('normal');
    return D;
  }

  // ---------- a chapter ----------
  async startChapter(chId) {
    const ch = CHAPTER_BY_ID[chId] || CHAPTERS[0];
    this.duelN++;
    this.demo = false;
    this.mode = 'intro';
    this.ui.show('none');
    this.hideBubble();
    this.ui.clearLog();
    this.sound.init();
    const n = this.duelN;
    const seed = params.has('seed') ? +params.get('seed') : (Date.now() % 100000) + 1;
    const D = this.newDuel(ch.id, seed, n, this.settings.easy ? { trust: 24 } : undefined);
    this.chapter = ch;
    this.ui.enemy(ch);
    this.tut = ch.tutorial && !params.has('notut') ? { i: 0 } : null;
    this.tense = ['ch5', 'ch6', 'ch7', 'ch9'].includes(ch.id);
    this.table.sync(D);
    // intro
    const intro = (ch.intro || []).join('\n');
    const go = await this.dialog({
      tag: `{第|だい} ${ch.no} {章|しょう}　${plain(ch.place)}`, title: ch.title,
      body: `${intro}\n\n**{相手|あいて}**：${ch.enemy.name}\n**V{字|じ}**：${TRACKS[ch.track].label}（${D.track.map((id) => C(id).name).join(' → ')}）\n**{目標|もくひょう}**：${ch.goal}`,
      en: `${ch.en}. ${ch.introEn || ''} Goal: ${ch.goalEn || ''}`,
      color: '#ffcf3f', bodySize: 0.032,
      buttons: [{ id: 'go', label: 'デュエル {開始|かいし}！', primary: true }, { id: 'rules', label: 'あそびかたを {見|み}る' }, { id: 'back', label: 'もどる' }],
    });
    if (this.duelN !== n) return;
    if (go === 'back') { this.toTitle(); return; }
    if (go === 'rules') await this.showRules();
    if (this.duelN !== n) return;
    this.mode = 'duel';
    this.ui.show(this.xrActive ? 'none' : 'duel');
    this.sound.music(true, this.tense);
    this.log(`{第|だい} ${ch.no} {章|しょう}「${ch.title}」 {開始|かいし}`, 't');
    this.avatar.act('play');
    this.bubbleSay(ch.enemy.say, 'kami');
    try {
      await D.start();
      this.refresh();
      await this.tutCheck();
      if (D.over) await this.finish();
    } catch (e) { if (!(e instanceof Abort)) throw e; }
  }

  bubbleSay(text, speaker = 'kami') {
    if (!text) return;
    this.log(`${plain(this.speaker(speaker).name)}：${text}`, 'e');
    if (this.xrActive) this.fx.banner3d(text, { color: '#d7c2ff', life: 2.2 });
    else this.ui.banner(text, { color: '#d7c2ff', ms: 2200 });
  }

  toTitle() {
    this.duelN++;
    document.getElementById('banner').classList.add('hidden');
    this.mode = 'title';
    this.D = null;
    this.tut = null;
    this.hideBubble();
    this.sound.music(false);
    this.table.reset();
    this.fx.clear();
    this.renderTitle();
    if (this.xrActive) { this.ui.show('none'); this.vrMenu(); }
    else this.ui.show('start');
    if (!params.has('nodemo')) this.runDemo();
  }

  async menu() {
    if (this.mode !== 'duel') return;
    const c = await this.dialog({ tag: 'メニュー', title: this.chapter ? `{第|だい} ${this.chapter.no} {章|しょう}「${this.chapter.title}」` : 'メニュー', body: '', buttons: [{ id: 'resume', label: 'つづける', primary: true }, { id: 'rules', label: 'あそびかた' }, { id: 'book', label: '{教訓|きょうくん}{図鑑|ずかん}' }, { id: 'ruby', label: this.settings.ruby ? 'ふりがな：あり → なし' : 'ふりがな：なし → あり' }, { id: 'retry', label: 'はじめから やり{直|なお}す' }, { id: 'title', label: 'タイトルへ' }, ...(this.xrActive ? [{ id: 'fit', label: '{机|つくえ}を{合|あ}わせる' }, { id: 'exit', label: 'VR を{終|お}わる' }] : [])], dismiss: 'resume' });
    if (c === 'rules') await this.showRules();
    else if (c === 'book') await this.showBook();
    else if (c === 'ruby') this.setSetting('ruby', !this.settings.ruby);
    else if (c === 'retry') this.startChapter(this.chapter.id);
    else if (c === 'title') this.toTitle();
    else if (c === 'fit') this.core.recalibrate();
    else if (c === 'exit') this.core.exitVR();
  }

  // ---------- after the duel ----------
  async finish() {
    const D = this.D, ch = this.chapter;
    const n = this.duelN;
    this.mode = 'result';
    this.sel = null;
    this.refresh();
    this.sound.music(false);
    const win = D.over === 'win';
    this.sound.play(win ? 'win' : 'lose');
    this.avatar.act(win ? 'happy' : 'win');
    this.banner(win ? 'PROJECT COMPLETE！ プロジェクト{成功|せいこう}' : 'プロジェクト{失敗|しっぱい}…　{次|つぎ}はこうしよう', { color: win ? '#ffcf3f' : '#ff9aa8', ms: 2400 });
    await this.wait(1.6);
    if (this.duelN !== n) return;
    // the tutorial's last words
    if (this.tut) {
      const last = TUTORIAL.find((s) => s.when.over === D.over);
      if (last) await this.tutShow(last, true);
    }
    const stars = D.stars();
    if (win) { this.progress.cleared[ch.id] = Math.max(this.progress.cleared[ch.id] || 0, stars); }
    // every lesson of the chapter opens on a win (the ones seen in the duel are already in)
    const newLessons = [];
    for (const id of win ? ch.lessons : []) if (!this.progress.lessons[id]) { this.progress.lessons[id] = true; newLessons.push(id); }
    this.saveAll();
    const words = (win ? ch.win : ch.lose) || [];
    const s = D.stats;
    const body = `${words.join('\n')}\n\n` +
      (win ? `**{評価|ひょうか}**：${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}（★2：{信頼|しんらい} 12 {以上|いじょう}／★3：{本番障害|ほんばんしょうがい} 0 で{納期|のうき}どおり）\n` : '') +
      `{信頼|しんらい} ${D.trust}／ターン ${D.turn}／レビュー ${s.reviews}／{承認|しょうにん} ${s.approvals}／テストで{見|み}つけたバグ ${s.found}／{本番障害|ほんばんしょうがい} ${s.incidents}／{納期|のうき}おくれ ${s.lateTurns}／そなえ{発動|はつどう} ${s.guards}` +
      (newLessons.length ? `\n\n**{新|あたら}しい{教訓|きょうくん}**：${newLessons.map((id) => LESSON_BY_ID[id].title).join('、')}` : '');
    await this.dialog({ tag: win ? 'クリア！' : 'ざんねん', title: win ? `{第|だい} ${ch.no} {章|しょう} クリア！` : `{第|だい} ${ch.no} {章|しょう}　もう{一度|いちど}！`, body, en: win ? ch.winEn : ch.loseEn, color: win ? '#ffcf3f' : '#ff9aa8', bodySize: 0.033, buttons: [{ id: 'quiz', label: 'ふりかえりクイズへ', primary: true }] });
    if (this.duelN !== n) return;
    await this.quiz(ch, D.seed);
    if (this.duelN !== n) return;
    const next = CHAPTERS.find((c) => c.no === ch.no + 1);
    const btns = [];
    if (win && next) btns.push({ id: 'next', label: `{次|つぎ}の{章|しょう}へ：${next.title}`, primary: true });
    btns.push({ id: 'retry', label: win ? 'もう{一度|いちど}' : 'もう{一度|いちど} {挑戦|ちょうせん}する', primary: !win });
    btns.push({ id: 'book', label: '{教訓|きょうくん}{図鑑|ずかん}を{見|み}る' }, { id: 'title', label: 'タイトルへ' });
    for (;;) {
      const c = await this.dialog({ tag: 'つぎは？', title: win && !next ? 'ぜんぶの{章|しょう}をクリア！ おめでとう！' : 'どうしますか？', body: win && !next ? 'V{字|じ}の{約束|やくそく}を{守|まも}って、ゴッドマートのアプリを{届|とど}けました。{日本|にほん}の{現場|げんば}でも、{同|おな}じように{進|すす}めれば{大丈夫|だいじょうぶ}です。' : '', buttons: btns, color: '#7fe3ff' });
      if (this.duelN !== n) return;
      if (c === 'book') { await this.showBook(); continue; }
      if (c === 'next') return this.startChapter(next.id);
      if (c === 'retry') return this.startChapter(ch.id);
      return this.toTitle();
    }
  }

  async quiz(ch, seed) {
    const pool = QUIZ.filter((q) => q.chapter === ch.id);
    if (!pool.length) return;
    // pick QUIZ_PER_DUEL questions by the duel's seed (a different set each time)
    const order = pool.map((q, i) => ({ q, k: Math.sin((seed + 1) * (i + 3) * 12.9898) * 43758.5453 % 1 })).sort((a, b) => a.k - b.k).map((x) => x.q).slice(0, QUIZ_PER_DUEL);
    let right = 0;
    for (let i = 0; i < order.length; i++) {
      const q = order[i];
      const a = await this.dialog({ tag: `ふりかえりクイズ ${i + 1} / ${order.length}`, title: q.q, body: '', en: q.en ? q.en.split(' — ')[0] : '', color: '#7fe3ff', buttons: q.choices.map((c, k) => ({ id: String(k), label: `${'ABCD'[k]}. ${c}` })) });
      if (a == null || a === 'close') return;
      const ok = +a === q.answer;
      if (ok) right++;
      this.sound.play(ok ? 'good' : 'bad');
      this.progress.quiz.total++; if (ok) this.progress.quiz.right++;
      await this.dialog({ tag: ok ? '{正解|せいかい}！' : 'ざんねん', title: ok ? '{正解|せいかい}です！' : `{正解|せいかい}は ${'ABCD'[q.answer]}. ${q.choices[q.answer]}`, body: q.explain, en: q.en || '', color: ok ? '#2fd08f' : '#ff9aa8', buttons: [{ id: 'ok', label: i + 1 < order.length ? '{次|つぎ}の{問題|もんだい}' : 'けっかを{見|み}る', primary: true }] });
    }
    this.saveAll();
    await this.dialog({ tag: 'クイズの けっか', title: `${order.length} {問中|もんちゅう} ${right} {問|もん} {正解|せいかい}`, body: right === order.length ? 'すばらしい！ {全部|ぜんぶ}{正解|せいかい}です。' : 'よくできました。まちがえた{所|ところ}は、{教訓|きょうくん}{図鑑|ずかん}で{見|み}なおしましょう。', color: '#2fd08f', buttons: [{ id: 'ok', label: 'OK', primary: true }] });
  }

  // =====================================================================
  // presenting the engine's events
  // =====================================================================
  async present(ev, D) {
    const T = this.table;
    const demo = this.demo;
    const name = (id) => (C(id) ? C(id).name : id);
    // cards that are shown in the air while they act: keep them out of the discard pile until they are done
    const showAt = (key, id, pos, scale = 1.7) => {
      const from = T.cards.get(key);
      T.ensure(key, cardFace(id), from ? null : { pos: pos.clone(), quat: new THREE.Quaternion(), scale: 0.6 });
      T.over.set(key, { pos, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0)), scale, k: 9 });
    };
    if (ev.type === 'enemyPlay') showAt('c:' + ev.uid, ev.id, new THREE.Vector3(0, TABLE_H + 0.3, -0.25));
    if (ev.type === 'play' && ev.kind === 'skill') showAt('c:' + ev.uid, ev.id, new THREE.Vector3(0, TABLE_H + 0.3, 0.1));
    if (ev.type === 'chain') showAt('c:' + ev.uid, ev.card, new THREE.Vector3(ev.side === 'p' ? 0.2 : -0.2, TABLE_H + 0.33, -0.02));
    T.sync(D);
    this.ui.hud(D);
    const at = (k) => T.posOf(k) || new THREE.Vector3(0, TABLE_H, 0);
    const up = (v, y = 0.05) => v.clone().add(new THREE.Vector3(0, y, 0));
    // tutorial: enemy-side steps
    if (this.tut && !demo) await this.tutEnemy(ev, D);
    switch (ev.type) {
      case 'deal': this.sound.play('draw'); await this.wait(0.5); break;
      case 'setup': await this.wait(0.3); break;
      case 'turn':
        this.sound.play('phase');
        if (ev.side === 'p') { this.banner(`ターン ${ev.turn}　あなたの ターン`, { color: '#7fe3ff', ms: 900 }); this.log(`── ターン ${ev.turn}　あなた（{工数|こうすう} ${ev.effort}）`, 't'); }
        else { this.banner(`{相手|あいて}の ターン`, { color: '#d7c2ff', ms: 900 }); this.log(`── ターン ${ev.turn}　{相手|あいて}`, 't'); this.avatar.act('play'); }
        await this.wait(0.75);
        break;
      case 'main': this.refresh(); break;
      case 'draw':
        this.sound.play('draw');
        if (ev.who === 'p') this.log(`カードを ${ev.n} {枚|まい}ひいた${ev.cards.length === 1 ? '：' + name(ev.cards[0].id) : ''}`);
        await this.wait(0.3 + 0.1 * ev.n);
        break;
      case 'late':
        this.sound.play('warn');
        this.banner(`{納期|のうき}おくれ！　{信頼|しんらい} −${ev.n}`, { color: '#ff5a4f', sub: '{遅|おく}れるほど{増|ふ}えていきます' });
        this.log(`{納期|のうき}に{遅|おく}れた（{信頼|しんらい} −${ev.n}）`, 'e');
        await this.wait(1.0);
        break;
      case 'trust': {
        const p = new THREE.Vector3(-0.2, TABLE_H + 0.15, 0.45);
        if (ev.n < 0) { this.sound.play('hit'); this.ui.trustHit(); this.pointer.pulse(0.8, 120); this.fx.float(p, `{信頼|しんらい} ${ev.n}`, '#ff5a7a', 1.2); this.log(`{信頼|しんらい} ${ev.n}（のこり ${ev.value}）`, 'e'); }
        else { this.sound.play('good'); this.fx.float(p, `{信頼|しんらい} +${ev.n}`, '#2fd08f', 1.1); this.log(`{信頼|しんらい} +${ev.n}（${ev.value}）`); }
        await this.wait(0.45);
        break;
      }
      case 'spend': this.ui.hud(D); break;
      case 'effort': this.fx.float(new THREE.Vector3(0.2, TABLE_H + 0.15, 0.45), `{工数|こうすう} ${ev.n > 0 ? '+' : ''}${ev.n}`, '#ffcf3f'); this.log(`{工数|こうすう} ${ev.n > 0 ? '+' : ''}${ev.n}`); await this.wait(0.35); break;
      case 'effortNext': this.log(`{次|つぎ}のターンの{工数|こうすう} ${ev.n > 0 ? '+' : ''}${ev.n}`, 'e'); this.fx.float(new THREE.Vector3(0.2, TABLE_H + 0.15, 0.45), `{次|つぎ}の{工数|こうすう} ${ev.n > 0 ? '+' : ''}${ev.n}`, '#ff9a3d'); await this.wait(0.4); break;
      case 'deadline': this.fx.float(new THREE.Vector3(0.4, TABLE_H + 0.15, 0.4), `{納期|のうき} ${ev.n > 0 ? '+' : ''}${ev.n}`, ev.n > 0 ? '#2fd08f' : '#ff5a4f'); this.log(`{納期|のうき} ${ev.n > 0 ? '+' : ''}${ev.n}（ターン ${ev.value} まで）`, ev.n < 0 ? 'e' : ''); this.sound.play(ev.n > 0 ? 'good' : 'warn'); await this.wait(0.5); break;
      case 'place': {
        const p = T.slotPos(ev.idx);
        const st = C(ev.id);
        this.sound.play('summon');
        this.fx.rise(hologram(cardFace(ev.id), 0.15), p, 1.5);
        this.fx.ring(p, '#7fe3ff', 0.18);
        this.banner(st.group === 'release' ? 'リリース！' : st.group === 'test' ? `テスト{開始|かいし}！ ${st.name}` : `{着工|ちゃっこう}！ ${st.name}`, { color: st.group === 'test' ? '#2fd08f' : '#7fe3ff', sub: st.inject ? `バグが ${st.inject} {入|はい}る` : '' });
        this.log(`{工程|こうてい}「${st.name}」を{置|お}いた（コスト ${ev.cost}）`);
        for (const h of ev.holes) {
          this.fx.burst(T.slotPos(h.idx), '#ff5a4f', 24);
          this.log(`「${C(h.id).name}」をとばした → **{穴|あな}**にバグ ${h.bugs.length}（テストで{見|み}つからない）`, 'e');
        }
        if (ev.holes.length) { this.banner('{工程|こうてい}をとばした！', { color: '#ff5a4f', sub: '{穴|あな}のバグは テストで{見|み}つかりません' }); this.sound.play('warn'); }
        await this.wait(ev.holes.length ? 1.4 : 1.0);
        break;
      }
      case 'grow': {
        this.sound.play('bug');
        for (const it of ev.items) { const b = T.bugs.get(it.bid); if (b) this.fx.float(up(b.position, 0.04), `×2 → ${it.to}`, it.to >= 4 ? '#ff5a4f' : '#ffb0b0', 0.6); }
        this.log(`{見|み}つかっていないバグが **2 {倍|ばい}**に{育|そだ}った（${ev.items.map((x) => x.to).join('・')}）`, 'e');
        await this.wait(0.8);
        break;
      }
      case 'bugs': {
        this.sound.play('bug');
        const p = T.slotPos(ev.idx);
        this.fx.float(up(p, 0.06), `バグ +${ev.bugs.length}`, '#ff5a4f', 0.8);
        const who = ev.card ? `「${name(ev.card)}」で ` : '';
        this.log(`${who}「${name(D.track[ev.idx])}」にバグ +${ev.bugs.length}`, ev.card && C(ev.card)?.kind !== 'skill' ? 'e' : '');
        await this.wait(0.6);
        break;
      }
      case 'blocked': {
        const p = T.slotPos(ev.idx);
        this.sound.play('guard');
        this.fx.ring(p, '#ff5a4f', 0.16);
        this.fx.float(up(p, 0.08), '{合意|ごうい}ずみです！', '#ffcf3f', 0.9);
        this.log(`{承認|しょうにん}ずみなので「${name(ev.card)}」をはね{返|かえ}した`, 'g');
        await this.wait(0.8);
        break;
      }
      case 'test': {
        this.sound.play('catch');
        const lines = (T.pairLines || []).filter((l) => l.userData.test === ev.idx);
        for (const l of lines) this.fx.runLine(l, '#2fd08f', 1.1);
        const pairNames = ev.pairs.map((i) => C(D.track[i]).name).join('・');
        this.banner(`{発見|はっけん}！ ${C(ev.id).name} ⇔ ${pairNames}`, { color: '#2fd08f', sub: ev.items.length ? `バグ ${ev.items.length} こを{見|み}つけた（{大|おお}きさ ${ev.items.map((x) => x.size).join('・')}）` : 'バグは{見|み}つからなかった（よくできました）', ms: 1600 });
        this.log(`「${C(ev.id).name}」が ${pairNames} のバグを ${ev.items.length} こ{見|み}つけた`);
        await this.wait(1.4);
        break;
      }
      case 'found': this.sound.play('catch'); this.log(`バグを ${ev.items.length} こ{見|み}つけた`); await this.wait(0.5); break;
      case 'fixed': {
        this.sound.play('good');
        for (const it of ev.items) { const p = T.slotPos(it.idx); this.fx.burst(up(p, 0.02), '#7fe3ff', 10, 0.3); }
        const how = ev.how === 'review' ? 'レビュー' : ev.how === 'fix' ? '{修正|しゅうせい}' : `「${name(ev.card)}」`;
        const p0 = T.slotPos(ev.items[0].idx);
        this.fx.float(up(p0, 0.08), ev.cost ? `${how}！ {工数|こうすう} ${ev.cost}` : `${how}！`, '#7fe3ff', 0.9);
        this.log(`${how}でバグを ${ev.items.length} こ{直|なお}した${ev.cost ? `（{工数|こうすう} ${ev.cost}）` : ''}`);
        await this.wait(0.6);
        break;
      }
      case 'approve': {
        const p = T.slotPos(ev.idx);
        if (ev.on) { this.sound.play('place'); this.fx.float(up(p, 0.08), '{承認|しょうにん}！', '#ff5a4f', 0.9); this.log(`「${name(D.track[ev.idx])}」に{承認|しょうにん}のハンコ`); }
        else { this.sound.play('bad'); this.fx.float(up(p, 0.08), '{承認|しょうにん}が{消|き}えた', '#ff9aa8', 0.9); this.log(`「${name(D.track[ev.idx])}」の{承認|しょうにん}が{消|き}された`, 'e'); }
        await this.wait(0.6);
        break;
      }
      case 'broken': {
        const p = T.slotPos(ev.idx);
        this.sound.play('bad');
        this.fx.burst(p, '#ff9a3d', 24, 0.6);
        this.banner(`{手戻|てもど}り！「${C(ev.id).name}」が こわされた`, { color: '#ff9a3d', sub: 'もう{一度|いちど} {置|お}き{直|なお}しです' });
        this.log(`「${name(ev.card)}」で「${C(ev.id).name}」がこわされた（{手戻|てもど}り）`, 'e');
        await this.wait(1.2);
        break;
      }
      case 'play': {
        const c = C(ev.id);
        const key = 'c:' + ev.uid;
        if (ev.kind === 'skill') {
          this.sound.play('spell');
          this.banner(`わざ「${c.name}」`, { color: '#2fd08f', ms: 1000 });
          this.log(`わざ「${c.name}」を{使|つか}った（コスト ${ev.cost}）`);
          await this.wait(0.9);
        } else if (ev.kind === 'unit') {
          this.sound.play('summon');
          await this.wait(0.25);
          this.fx.rise(hologram(cardFace(ev.id), 0.14), at(key), 1.3);
          this.log(`なかま「${c.name}」がチームに{入|はい}った`);
          await this.wait(0.7);
        } else if (ev.kind === 'guard') { this.sound.play('place'); this.log(`そなえを 1 {枚|まい}ふせた`, 'g'); await this.wait(0.5); }
        else { this.sound.play('place'); this.log(`{資料|しりょう}「${c.name}」を{置|お}いた`); await this.wait(0.5); }
        break;
      }
      case 'skillDone': T.over.delete('c:' + ev.uid); T.sync(D); await this.wait(0.2); break;
      case 'leave': this.log(`「${name(ev.id)}」を{捨|す}てて{入|い}れかえた`); await this.wait(0.3); break;
      case 'enemyPlay': {
        const c = C(ev.id);
        this.avatar.act('play');
        this.ui.enemyAct();
        this.sound.play(ev.kind === 'event' ? 'trap' : 'spell');
        const key = 'c:' + ev.uid;
        const kindName = plain(KINDS[c.kind].label);
        this.banner(`${plain(D.ch.enemy.name)}の${kindName}「${c.name}」`, { color: '#d7c2ff', sub: c.text, ms: 1500 });
        this.log(`{相手|あいて}の${kindName}「${c.name}」：${c.text}`, 'e');
        await this.wait(1.3);
        T.over.delete(key);
        break;
      }
      case 'eventDone': T.sync(D); await this.wait(0.2); break;
      case 'plotSet': this.sound.play('place'); this.log('{相手|あいて}が カードを 1 {枚|まい}ふせた（たくらみ）', 'e'); await this.wait(0.5); break;
      case 'summon': {
        const key = 'c:' + ev.uid;
        this.sound.play('summon');
        await this.wait(0.2);
        this.fx.rise(hologram(cardFace(ev.id), 0.15), at(key), 1.3);
        if (ev.token) this.log(`**{本番障害|ほんばんしょうがい}**（{圧力|あつりょく} ${ev.pressure}）が{出|で}た！`, 'e');
        await this.wait(0.7);
        break;
      }
      case 'pressure': {
        const p = T.troublePos(ev.uid);
        this.fx.float(up(p, 0.12), ev.n < 0 ? `{圧力|あつりょく} ${Math.max(ev.n, -99)}` : `{圧力|あつりょく} +${ev.n}`, ev.n < 0 ? '#2fd08f' : '#ff5a4f', 0.8);
        if (ev.n > 0) { this.sound.play('warn'); this.log(`トラブルの{圧力|あつりょく}が +${ev.n}（${ev.value}）`, 'e'); }
        await this.wait(0.35);
        break;
      }
      case 'resolved': {
        const p = T.troublePos(ev.uid);
        this.sound.play('good');
        this.fx.burst(up(p, 0.04), '#ffcf3f', 22);
        this.fx.float(up(p, 0.16), '{解決|かいけつ}！', '#ffcf3f', 1);
        this.avatar.act('hit');
        this.log(`トラブル「${name(ev.id)}」を{解決|かいけつ}した！`);
        await this.wait(0.6);
        break;
      }
      case 'respond': {
        const a = at('c:' + ev.unit), b = T.troublePos(ev.uid);
        this.sound.play('hit');
        this.fx.beam(up(a, 0.03), up(b, 0.03), '#7fe3ff');
        const u = D.p.team.find((x) => x.uid === ev.unit);
        this.log(`なかま「${name(u?.id)}」が{対応|たいおう}（{力|ちから} ${ev.power}）`);
        await this.wait(0.45);
        break;
      }
      case 'attackTry': {
        this.avatar.act('attack');
        const key = 'c:' + ev.uid;
        const p = at(key);
        T.over.set(key, { pos: p.clone().add(new THREE.Vector3(0, 0.06, 0.12)), quat: T.cards.get(key)?.target.quat, scale: 1.1, k: 14 });
        await this.wait(0.35);
        T.over.delete(key);
        break;
      }
      case 'attack': {
        const p = T.troublePos(ev.uid);
        this.fx.shock(p, new THREE.Vector3(0, TABLE_H, 0.5));
        this.log(`「${name(ev.id)}」の{攻撃|こうげき}（{圧力|あつりょく} ${ev.n}）`, 'e');
        await this.wait(0.3);
        break;
      }
      case 'chain': {
        const c = C(ev.card);
        const mine = ev.side === 'p';
        this.sound.play('trap');
        this.banner(mine ? `そなえ{発動|はつどう}！「${c.name}」` : `たくらみ{発動|はつどう}！「${c.name}」`, { color: mine ? '#ff6fa8' : '#ff5a4f', sub: c.text, ms: 1700 });
        this.log(mine ? `わりこみ：そなえ「${c.name}」を{発動|はつどう}` : `わりこみ：{相手|あいて}のたくらみ「${c.name}」が{発動|はつどう}`, mine ? 'g' : 'e');
        await this.wait(1.4);
        break;
      }
      case 'chainResolved': {
        const key = [...this.table.over.keys()].find((k) => this.table.cards.get(k)?.card?.id === ev.card);
        if (key) this.table.over.get(key).scale = 1.9;
        if (ev.negates) {
          this.sound.play('guard');
          this.fx.float(new THREE.Vector3(0, TABLE_H + 0.45, 0.0), '{無効|むこう}！', ev.side === 'p' ? '#ff6fa8' : '#ff5a4f', 1.6);
          this.log(`「${name(ev.card)}」が{相手|あいて}の{行動|こうどう}を{無効|むこう}にした`, ev.side === 'p' ? 'g' : 'e');
        }
        await this.wait(0.7);
        if (key) this.table.over.delete(key);
        break;
      }
      case 'negated': await this.wait(0.3); break;
      case 'prevented': this.fx.float(new THREE.Vector3(0, TABLE_H + 0.2, 0.4), `ダメージ 0！`, '#ff6fa8', 1.1); this.log('ダメージを 0 にした', 'g'); await this.wait(0.5); break;
      case 'overflow': this.log(`トラブルの{場|ば}がいっぱい → {信頼|しんらい}に{直接|ちょくせつ} ${ev.pressure}`, 'e'); await this.wait(0.3); break;
      case 'releaseTry': this.banner('リリース{作業|さぎょう}…', { color: '#ffcf3f', ms: 800 }); await this.wait(0.6); break;
      case 'releaseFailed': this.sound.play('bad'); this.banner('リリース{失敗|しっぱい}…', { color: '#ff5a4f', sub: '{次|つぎ}のターンに もう{一度|いちど}' }); this.log('リリースに{失敗|しっぱい}した（{次|つぎ}のターンに もう{一度|いちど}{置|お}ける）', 'e'); await this.wait(1.2); break;
      case 'released': {
        this.sound.play('win');
        this.fx.rocket(T.slotPos(ev.idx));
        this.banner('リリース！ {本番|ほんばん}{稼働|かどう}', { color: '#ffcf3f', sub: ev.bugs.length ? `{残|のこ}ったバグ ${ev.bugs.length} こが {本番障害|ほんばんしょうがい}に…` : 'バグ 0 で リリース！ すばらしい', ms: 1800 });
        this.log(`リリースした！ {運用|うんよう}あと ${ev.opsLeft} ターン`, 't');
        await this.wait(1.6);
        break;
      }
      case 'incident': {
        const b = T.bugs.get(ev.bid);
        const p = b ? b.position.clone() : T.slotPos(ev.idx);
        this.sound.play('bad');
        this.fx.burst(p, '#ff5a1f', 16, 0.5);
        this.fx.beam(p, new THREE.Vector3(0, TABLE_H + 0.02, Z.enemy), '#ff5a1f', 0.5);
        await this.wait(0.4);
        break;
      }
      case 'ops': this.log(ev.left > 0 ? `{運用|うんよう} あと ${ev.left} ターン` : '{運用|うんよう}を{守|まも}りきった！', 't'); await this.wait(0.3); break;
      case 'tire': this.sound.play('warn'); this.log('なかまが つかれた（{次|つぎ}のターン{対応|たいおう}できない）', 'e'); await this.wait(0.5); break;
      case 'buff': this.sound.play('good'); this.fx.float(new THREE.Vector3(-0.5, TABLE_H + 0.12, Z.team), `{力|ちから} +${ev.n}`, '#7fe3ff'); this.log(`なかま{全員|ぜんいん}の{力|ちから} +${ev.n}（このターン）`); await this.wait(0.4); break;
      case 'extra': this.log(`このターン、{工程|こうてい}をもう 1 つ{置|お}ける（バグ +${ev.bug}）`); await this.wait(0.3); break;
      case 'discard': this.log(`{手札|てふだ}を ${ev.cards.length} {枚|まい}{捨|す}てた${ev.why ? '（{手札|てふだ}は 7 {枚|まい}まで）' : ''}`, ev.why ? '' : 'e'); await this.wait(0.4); break;
      case 'plotBroken': this.sound.play('guard'); this.log(`{相手|あいて}のたくらみを ${ev.plots.length} {枚|まい}こわした`, 'g'); await this.wait(0.5); break;
      case 'enemyEnd': this.avatar.setMood('normal'); break;
      case 'lesson': if (!demo) await this.showLesson(ev.id, ev.reason); break;
      case 'moment': if (!demo) await this.hint(ev.key); break;
      case 'over': break;
    }
    this.ui.hud(D);
    if (D.side === 'p' && !D.busy) this.refresh();
  }

  // a lesson card opens
  async showLesson(id, reason) {
    const l = LESSON_BY_ID[id];
    if (!l) return;
    const isNew = !this.progress.lessons[id];
    this.progress.lessons[id] = true;
    this.saveAll();
    if (this.tut) return; // the tutorial shows its lessons at its own steps
    this.sound.play('lesson');
    if (this.settings.lessons === 'short') { this.banner(`{教訓|きょうくん}：${l.title}`, { color: '#ffcf3f', sub: isNew ? '{図鑑|ずかん}に{入|はい}った' : '', ms: 2000 }); this.log(`{教訓|きょうくん}「${l.title}」`, 't'); return; }
    this.log(`{教訓|きょうくん}「${l.title}」`, 't');
    await this.dialog({ tag: `{現場|げんば}の{教訓|きょうくん}${isNew ? '　NEW' : ''}`, title: l.title, body: l.body, en: l.en, src: '{出典|しゅってん}：' + l.source, icon: l.icon, color: '#ffcf3f', buttons: [{ id: 'ok', label: 'わかった', primary: true }] });
  }

  async hint(key) {
    if (this.tut) return;
    const no = this.chapter?.no || 0;
    for (const h of HINTS) {
      if (h.on !== key || this.progress.hints[h.id]) continue;
      const hc = CHAPTER_BY_ID[h.chapter];
      if (hc && hc.no > no) continue;
      this.progress.hints[h.id] = true;
      this.saveAll();
      await new Promise((res) => this.bubble({ speaker: 'hendy', say: h.say, en: h.en, ok: 'OK', onOk: () => { this.hideBubble(); res(); } }));
    }
  }

  // the engine asks: cut in with a guard?
  async ask(kind, info, D) {
    if (kind !== 'guard') return null;
    if (this.demo) return info.options[0].uid;
    const act = info.act;
    const what = act.type === 'damage' ? `{信頼|しんらい}への ダメージ ${act.n}` : act.type === 'attack' ? `「${C(act.card).name}」の{攻撃|こうげき}` : act.card && C(act.card) ? `「${C(act.card).name}」` : '{相手|あいて}の{行動|こうどう}';
    let allowOnly = null;
    if (this.tut) {
      const st = TUTORIAL[this.tut.i];
      if (st && st.want.type === 'guard') {
        allowOnly = st.want.card;
        this.bubble({ speaker: st.speaker, say: st.say, en: st.en });
      }
    }
    this.sound.play('trap');
    const btns = info.options.map((o) => ({ id: String(o.uid), label: `「${C(o.id).name}」を {発動|はつどう}する`, primary: true, disabled: allowOnly && o.id !== allowOnly }));
    btns.push({ id: 'no', label: '{発動|はつどう}しない', disabled: !!allowOnly });
    const cards = [];
    if (act.card && C(act.card) && act.card !== 'approve') cards.push(act.card);
    for (const o of info.options) cards.push(o.id);
    const c = await this.dialog({ tag: 'わりこみ！', title: `${what}に わりこみますか？`, body: info.options.map((o) => `「${C(o.id).name}」：${C(o.id).text}`).join('\n'), en: 'Cut in with a face-down guard?', cards, color: '#ff6fa8', buttons: btns, bodySize: 0.034 });
    if (this.tut && allowOnly) { this.hideBubble(); const st = TUTORIAL[this.tut.i]; this.tut.i++; if (st.lesson) this.tutLesson = st.lesson; }
    if (c === 'no' || c == null) return -1;
    return +c;
  }

  // =====================================================================
  // the tutorial (chapter 1)
  // =====================================================================
  tutStep() { return this.tut ? TUTORIAL[this.tut.i] : null; }
  // show player-side steps whose turn has come (OK steps advance by themselves)
  async tutCheck() {
    if (!this.tut || !this.D) return;
    const D = this.D;
    for (;;) {
      const st = this.tutStep();
      if (!st || st.when.over || D.over) { this.hideBubble(); return; }
      if (st.when.side !== D.side || st.when.turn !== D.turn) { this.hideBubble(); return; }
      if (st.want.type === 'next') { await this.tutShow(st, true); this.tut.i++; continue; }
      await this.tutShow(st, false);
      return;
    }
  }
  async tutShow(st, ok) {
    this.tutFocus = st.focus;
    this.refresh();
    if (ok) {
      await new Promise((res) => this.bubble({ speaker: st.speaker, say: st.say, en: st.en, ok: 'OK', onOk: () => { this.hideBubble(); res(); } }));
      if (st.lesson) await this.tutLessonShow(st.lesson);
    } else this.bubble({ speaker: st.speaker, say: st.say, en: st.en });
  }
  async tutLessonShow(id) {
    const l = LESSON_BY_ID[id];
    if (!l) return;
    this.progress.lessons[id] = true; this.saveAll();
    this.sound.play('lesson');
    await this.dialog({ tag: '{現場|げんば}の{教訓|きょうくん}', title: l.title, body: l.body, en: l.en, src: '{出典|しゅってん}：' + l.source, icon: l.icon, color: '#ffcf3f', buttons: [{ id: 'ok', label: 'わかった', primary: true }] });
  }
  // enemy-side steps, shown when what they talk about happens
  async tutEnemy(ev, D) {
    const st = this.tutStep();
    if (!st || st.when.side !== 'e' || st.when.turn !== D.turn || D.side !== 'e') return;
    if (st.want.type === 'guard') return; // shown by ask()
    if (st.auto) {
      const [k, id] = st.auto.split(':');
      if (!(k === 'enemyPlay' && ev.type === 'summon' && ev.id === id)) return;
      await this.wait(0.8);
    } else if (!['chainResolved', 'attack', 'enemyEnd'].includes(ev.type)) return;
    this.tut.i++;
    await this.tutShow(st, true);
  }
  // is this action what the tutorial wants now?
  tutAllows(a) {
    if (!this.tut) return true;
    const st = this.tutStep();
    if (!st) return true;
    const w = st.want, D = this.D;
    if (w.type !== a.type && !(w.type === 'attack' && a.type === 'respond')) return false;
    if (w.type === 'place') return D.track[a.idx] === w.stage;
    if (w.type === 'play') { const h = D.p.hand.find((x) => x.uid === a.uid); if (!h || h.id !== w.card) return false; if (w.target) { const t = D.e.field.find((x) => x.uid === a.target); return !!t && t.id === w.target; } return true; }
    if (w.type === 'attack') { const u = D.p.team.find((x) => x.uid === a.unit); const t = D.e.field.find((x) => x.uid === a.target); return !!u && !!t && u.id === w.unit && t.id === w.target; }
    if (w.type === 'fix') return D.placed[a.idx]?.id === w.stage;
    return true;
  }
  tutTargetKeys() {
    // the keys (table objects) the current step points at
    const st = this.tutStep();
    const D = this.D;
    if (!st || !D) return new Set();
    const f = st.focus || '';
    const out = new Set();
    const [k, v] = f.split(':');
    if (k === 'track' || k === 'v') D.track.forEach((id, i) => { if (v === 'all' || id === v) out.add((D.placed[i] ? 'v:' : 'plan:') + i); });
    if (k === 'hand') D.p.hand.forEach((h) => { if (h.id === v) out.add('c:' + h.uid); });
    if (k === 'team') D.p.team.forEach((u) => { if (u.id === v) out.add('c:' + u.uid); });
    if (k === 'back') D.p.back.forEach((u) => { if (u.id === v) out.add('c:' + u.uid); });
    if (k === 'field') D.e.field.forEach((t) => { if (t.id === v) out.add('c:' + t.uid); });
    if (k === 'bug') D.placed.forEach((s) => { if (s && s.id === v) s.bugs.forEach((b) => out.add('bug:' + b.bid)); });
    if (st.want.type === 'attack') D.e.field.forEach((t) => { if (t.id === st.want.target) out.add('c:' + t.uid); });
    if (st.want.type === 'play' && st.want.target) D.e.field.forEach((t) => { if (t.id === st.want.target) out.add('c:' + t.uid); });
    return out;
  }

  // =====================================================================
  // selecting and acting (PC and VR)
  // =====================================================================
  clearSel() { this.sel = null; this.refresh(); }

  onPick(hit) {
    const D = this.D;
    if (this.mode !== 'duel' || !D) return;
    if (!hit) { this.clearSel(); return; }
    const sel = this.sel;
    const myTurn = D.canAct();
    // a second click on a target of the current selection does the action
    if (sel && myTurn) {
      if (sel.kind === 'team' && hit.kind === 'field') return this.doAction({ type: 'respond', unit: sel.uid, target: hit.uid });
      if (sel.kind === 'hand' && hit.kind === 'field') {
        const targets = D.skillTargets(sel.id);
        if (targets && targets.includes(hit.uid)) return this.doAction({ type: 'play', uid: sel.uid, target: hit.uid });
      }
      if (sel.kind === 'hand' && (hit.kind === 'team' || hit.kind === 'back')) {
        const c = C(sel.id);
        const zone = c.kind === 'unit' ? 'team' : c.kind === 'guard' || c.kind === 'doc' ? 'back' : null;
        const full = zone === 'team' ? D.p.team.length >= D.R.teamSlots : zone === 'back' ? D.p.back.length >= D.R.backSlots : false;
        if (zone === hit.kind && full) { const list = D.p[zone]; return this.doAction({ type: 'play', uid: sel.uid, replace: list.findIndex((x) => x.uid === hit.uid) }); }
      }
      if (sel.kind === 'hand' && hit.kind === 'hand' && sel.uid === hit.uid) {
        const c = C(sel.id);
        if (!D.skillTargets(sel.id) || !D.skillTargets(sel.id).length || c.kind !== 'skill') { const a = this.primaryAction(); if (a) return this.doAction(a); }
      }
      if (sel.kind === 'plan' && hit.kind === 'plan' && sel.idx === hit.idx) return this.doAction({ type: 'place', idx: hit.idx });
      if (sel.kind === 'bug' && hit.kind === 'bug' && sel.bid === hit.bid) return this.doAction({ type: 'fix', idx: hit.idx, bid: hit.bid });
    }
    this.sel = { ...hit, id: hit.id || (hit.kind === 'plan' || hit.kind === 'slot' ? D.track[hit.idx] : hit.id) };
    if (hit.kind === 'plan' && hit.idx !== D.ptr) this.hint('canSkip');
    this.sound.play('click');
    this.refresh();
  }

  // the main thing to do with the selection (button and second click)
  primaryAction() {
    const D = this.D, s = this.sel;
    if (!D || !s) return null;
    if (s.kind === 'hand') {
      const c = C(s.id);
      const t = D.skillTargets(s.id);
      if (t) return null; // needs a target
      return { type: 'play', uid: s.uid };
    }
    if (s.kind === 'plan') return { type: 'place', idx: s.idx };
    if (s.kind === 'bug') return { type: 'fix', idx: s.idx, bid: s.bid };
    return null;
  }

  // buttons for the current selection (+ end turn)
  computeButtons() {
    const D = this.D, s = this.sel;
    const out = [];
    if (!D || this.mode !== 'duel') return out;
    const my = D.canAct();
    const tutW = this.tut ? this.tutStep()?.want : null;
    const can = (a) => my && this.tutAllows(a);
    if (s && s.kind === 'hand') {
      const h = D.p.hand.find((x) => x.uid === s.uid);
      if (h) {
        const c = C(h.id);
        const t = D.skillTargets(h.id);
        const verb = c.kind === 'unit' ? 'チームに{出|だ}す' : c.kind === 'guard' ? 'ふせる' : c.kind === 'doc' ? '{置|お}く' : '{使|つか}う';
        const prob = D.playProblem(h.uid);
        if (t) out.push({ id: 'none', label: t.length ? '{光|ひか}っているトラブルを{押|お}して{使|つか}う' : '{対象|たいしょう}のトラブルがいません', sub: `コスト ${c.cost}`, disabled: true });
        else if (prob === 'teamFull' || prob === 'backFull') out.push({ id: 'none', label: '{場|ば}がいっぱい：{入|い}れかえるカードを{押|お}す', sub: `コスト ${c.cost}`, disabled: true });
        else out.push({ id: 'play', label: verb, sub: prob === 'effort' ? `{工数|こうすう}が{足|た}りない（${c.cost}）` : `コスト ${c.cost}`, primary: true, disabled: !!prob || !can({ type: 'play', uid: h.uid }), focus: tutW?.type === 'play' && tutW.card === h.id && !tutW.target });
      }
    }
    if (s && s.kind === 'plan') {
      const prob = D.placeProblem(s.idx);
      const holes = D.skipsIfPlaced(s.idx);
      const cost = D.stageCost(D.track[s.idx]);
      const why = { released: 'リリースずみ', order: '{置|お}けない', once: '{工程|こうてい}は 1 ターンに 1 つ', needMake: '{先|さき}に{製造|せいぞう}が{必要|ひつよう}', skipMake: '{製造|せいぞう}はとばせない', effort: `{工数|こうすう}が{足|た}りない（${cost}）` }[prob];
      out.push({ id: 'place', label: holes.length ? `とばして{置|お}く（{穴|あな} ${holes.length}）` : '{置|お}く', sub: why || `コスト ${cost}`, primary: !holes.length, warn: holes.length > 0, disabled: !!prob || !can({ type: 'place', idx: s.idx }), focus: tutW?.type === 'place' });
    }
    if (s && (s.kind === 'slot' || s.kind === 'bugq')) {
      const lm = D.latestMake();
      if (lm && lm.idx === s.idx) out.push({ id: 'review', label: 'レビュー', sub: D.reviewed ? 'このターンはもう{使|つか}った' : D.reviewTarget() ? '{工数|こうすう} 1：{見|み}つかっていないバグを 1 つ{直|なお}す' : '{直|なお}すバグがない', disabled: !D.canReview() || !can({ type: 'review' }), focus: tutW?.type === 'review' });
      const st = D.placed[s.idx];
      if (st && !st.skipped && ['design', 'make'].includes(C(st.id).group)) out.push({ id: 'approve', label: st.approved ? '{承認|しょうにん}ずみ' : '{承認|しょうにん}（ハンコ）', sub: st.approved ? '' : '{工数|こうすう} 1：あいまいなカードで こわされない', disabled: !D.canApprove(s.idx) || !can({ type: 'approve', idx: s.idx }) });
    }
    if (s && s.kind === 'bug') {
      const st = D.placed[s.idx]; const b = st?.bugs.find((x) => x.bid === s.bid);
      if (b) out.push({ id: 'fix', label: 'バグを{直|なお}す', sub: `{工数|こうすう} ${D.fixCost(b)}（{大|おお}きさ ${b.size}）`, primary: true, disabled: !D.canFix(s.idx, s.bid) || !can({ type: 'fix', idx: s.idx, bid: s.bid }), focus: tutW?.type === 'fix' });
    }
    if (s && s.kind === 'team') {
      const u = D.p.team.find((x) => x.uid === s.uid);
      if (u) out.push({ id: 'none', label: u.tired ? 'つかれていて{対応|たいおう}できない' : u.acted ? 'このターンは{対応|たいおう}ずみ' : D.e.field.length ? '{光|ひか}っているトラブルを{押|お}して{対応|たいおう}' : 'トラブルがいません', sub: `{力|ちから} ${D.unitPower(u)}`, disabled: true });
    }
    // review is always reachable from the panel when possible
    if (!(s && (s.kind === 'slot' || s.kind === 'bugq')) && D.canReview()) out.push({ id: 'review', label: 'レビュー（{新|あたら}しい{工程|こうてい}）', sub: '{工数|こうすう} 1', disabled: !can({ type: 'review' }), focus: tutW?.type === 'review' });
    const left = D.anythingLeft();
    out.push({ id: 'end', label: D.side === 'p' ? 'ターン{終了|しゅうりょう}' : '{相手|あいて}のターン…', sub: D.side === 'p' && left ? `まだできることがあります（{工数|こうすう} ${D.effort}）` : '', disabled: !my || !this.tutAllows({ type: 'endTurn' }), focus: tutW?.type === 'endTurn' });
    return out;
  }

  onButton(id) {
    const D = this.D;
    if (id === 'menu') return this.menu();
    if (id === 'fit') return this.core.recalibrate();
    if (!D || this.mode !== 'duel') return;
    if (id === 'end') return this.doAction({ type: 'endTurn' });
    if (id === 'review') return this.doAction({ type: 'review' });
    if (id === 'approve' && this.sel) return this.doAction({ type: 'approve', idx: this.sel.idx });
    if (id === 'play' || id === 'place' || id === 'fix') { const a = this.primaryAction(); if (a) return this.doAction(a); }
  }

  async doAction(a) {
    const D = this.D;
    if (!D || !D.canAct()) return;
    if (!this.tutAllows(a)) {
      this.sound.play('bad');
      this.toastVR('いまは、{光|ひか}っている{所|ところ}を{押|お}しましょう');
      return;
    }
    const n = this.duelN;
    this.sel = null;
    this.hideBubble();
    // the tutorial moves on as soon as its move is made (the enemy's turn may have its own steps)
    let tutLesson = null;
    if (this.tut) {
      const st = this.tutStep();
      if (st && st.want.type !== 'next' && st.want.type !== 'guard' && (st.want.type === a.type || (st.want.type === 'attack' && a.type === 'respond'))) { this.tut.i++; tutLesson = st.lesson || null; }
    }
    let ok = false;
    try {
      if (a.type === 'place') ok = await D.place(a.idx);
      else if (a.type === 'play') ok = await D.play(a.uid, { target: a.target, replace: a.replace });
      else if (a.type === 'review') ok = await D.review();
      else if (a.type === 'approve') ok = await D.approve(a.idx);
      else if (a.type === 'fix') ok = await D.fix(a.idx, a.bid);
      else if (a.type === 'respond') ok = await D.respond(a.unit, a.target);
      else if (a.type === 'endTurn') { this.sound.play('phase'); ok = await D.endTurn(); }
    } catch (e) { if (e instanceof Abort) return; throw e; }
    if (this.duelN !== n) return;
    if (tutLesson && !D.over) await this.tutLessonShow(tutLesson);
    if (this.tutLesson) { const l = this.tutLesson; this.tutLesson = null; await this.tutLessonShow(l); }
    this.refresh();
    if (D.over) return this.finish();
    await this.tutCheck();
    if (D.side === 'e' && !D.busy && !D.over) { /* nothing */ }
  }

  // highlights and panel for the current state
  refresh() {
    const D = this.D;
    if (!D) { this.table.setHighlights(new Map()); return; }
    this.table.sync(D);
    this.ui.hud(D);
    const hl = new Map();
    const my = D.canAct() && this.mode === 'duel' && !this.demo;
    if (my) {
      // the next stage glows when it can be placed
      if (!D.released) for (let i = D.ptr; i < D.track.length; i++) if (D.canPlace(i)) hl.set('plan:' + i, i === D.ptr ? '#7fe3ff' : '#ffcf3f');
      // playable hand cards
      for (const h of D.p.hand) if (!D.playProblem(h.uid, { replace: 0 })) hl.set('c:' + h.uid, '#2fd08f');
      // members that can respond
      for (const u of D.p.team) if (!u.acted && !u.tired && D.e.field.length) hl.set('c:' + u.uid, '#7fe3ff');
      // found bugs you can fix
      for (const { b, s } of D.allBugs()) if (b.found && D.canFix(s.idx, b.bid)) hl.set('bug:' + b.bid, '#ff5a4f');
      const s = this.sel;
      if (s) {
        hl.set(s.kind === 'plan' ? 'plan:' + s.idx : s.kind === 'slot' ? 'v:' + s.idx : 'c:' + s.uid, '#ffffff');
        if (s.kind === 'team') for (const t of D.e.field) hl.set('c:' + t.uid, '#ff6fa8');
        if (s.kind === 'hand') {
          const t = D.skillTargets(s.id);
          if (t) for (const uid of t) hl.set('c:' + uid, '#ff6fa8');
          const c = C(s.id);
          if (c.kind === 'unit' && D.p.team.length >= D.R.teamSlots) for (const u of D.p.team) hl.set('c:' + u.uid, '#ff9a3d');
          if ((c.kind === 'guard' || c.kind === 'doc') && D.p.back.length >= D.R.backSlots) for (const b of D.p.back) hl.set('c:' + b.uid, '#ff9a3d');
        }
      }
      // tutorial: only the focus glows (gold)
      if (this.tut) {
        const keys = this.tutTargetKeys();
        hl.clear();
        for (const k of keys) hl.set(k, '#ffcf3f');
        if (s) hl.set(s.kind === 'plan' ? 'plan:' + s.idx : 'c:' + s.uid, '#ffffff');
      }
    }
    this.table.setHighlights(hl);
    const btns = this.computeButtons();
    const info = this.infoFor(this.hover || this.sel);
    if (!this.xrActive) {
      this.ui.info(info);
      this.ui.actions(btns, (id) => this.onButton(id));
    } else {
      this.vr.showInfo(info, btns.filter((b) => b.id !== 'end'));
      this.vr.showHud(D, [btns.find((b) => b.id === 'end') || { id: 'end', label: 'ターン{終了|しゅうりょう}' }, { id: 'menu', label: 'メニュー' }].map((b) => ({ ...b, primary: b.id === 'end' && !b.disabled })));
    }
  }

  // what the info panel shows for a hit
  infoFor(h) {
    const D = this.D;
    if (!h || !D) return null;
    if (h.kind === 'hand') return { id: h.id };
    if (h.kind === 'team') { const u = D.p.team.find((x) => x.uid === h.uid); return u ? { id: u.id, opts: { unit: u, D }, note: u.tired ? 'つかれている（{次|つぎ}のターンまで{対応|たいおう}できない）' : u.acted ? 'このターンは{対応|たいおう}ずみ' : '' } : null; }
    if (h.kind === 'back') { const b = D.p.back.find((x) => x.uid === h.uid); return b ? { id: b.id, note: b.down ? 'ふせてある（{条件|じょうけん}が{起|お}きたら わりこめる）' : '' } : null; }
    if (h.kind === 'field') { const t = D.e.field.find((x) => x.uid === h.uid); return t ? { id: t.id, opts: { trouble: t, D }, note: `{今|いま}の{圧力|あつりょく} ${Math.max(0, t.pressure)}${t.isNew ? '（NEW：「すぐ{報告|ほうこく}」で{消|け}せる）' : ''}` } : null; }
    if (h.kind === 'plot') return { text: '{相手|あいて}がふせたカード（たくらみ）。リリースや{承認|しょうにん}のときに{発動|はつどう}することがある。「リハーサル」でこわせる。', en: 'An enemy Plot. It may trigger when you release or approve.' };
    if (h.kind === 'ehand') return { text: `{相手|あいて}の{手札|てふだ}（${D.e.hand.length} {枚|まい}）`, en: 'Enemy hand' };
    if (h.kind === 'plan') {
      const holes = D.skipsIfPlaced(h.idx);
      const pairOf = Object.entries(D.pair).find(([, v]) => v.includes(D.track[h.idx]));
      return { id: D.track[h.idx], note: (h.idx === D.ptr ? '**{次|つぎ}に{置|お}く{工程|こうてい}**です。' : holes.length ? `ここに{置|お}くと **${holes.map((i) => C(D.track[i]).name).join('・')}** をとばします（{穴|あな}にバグ 2 こずつ。テストで{見|み}つかりません）。` : 'まだ{置|お}けません。') + (pairOf ? `\nV{字|じ}のペア：「${C(pairOf[0]).name}」が このバグを{見|み}つけます。` : '') };
    }
    if (h.kind === 'slot') {
      const st = D.placed[h.idx];
      if (!st) return null;
      const unfound = st.bugs.filter((b) => !b.found).length, found = st.bugs.length - unfound;
      const pairOf = Object.entries(D.pair).find(([, v]) => v.includes(st.id));
      return { id: st.id, opts: { hole: st.skipped }, note: `バグ：{見|み}つかった ${found}・{見|み}つかっていない ${unfound}${st.approved ? '\n{承認|しょうにん}ずみ（ハンコ）' : ''}${pairOf ? `\nV{字|じ}のペア：「${C(pairOf[0]).name}」が{見|み}つけます` : ''}` };
    }
    if (h.kind === 'bug' || h.kind === 'bugq') {
      const st = D.placed[h.idx]; const b = st?.bugs.find((x) => x.bid === h.bid);
      if (!b) return null;
      return { text: b.found ? `**バグ（{大|おお}きさ ${b.size}）**：{見|み}つかっています。{直|なお}すには{工数|こうすう} ${D.fixCost(b)}。{早|はや}く{直|なお}すほど{安|やす}い。` : `**{見|み}つかっていないバグ（{大|おお}きさ ${b.size}）**：「${C(st.id).name}」の{中|なか}。{工程|こうてい}を{置|お}くたびに 2 {倍|ばい}。レビューで{直|なお}すか、ペアのテストで{見|み}つける。`, en: b.found ? 'A found bug. Fixing costs its size.' : 'A hidden bug. It doubles at every stage — review it now or find it with the paired test.' };
    }
    if (h.kind === 'pile') return { text: { deck: `{山札|やまふだ}：のこり ${D.p.deck.length} {枚|まい}`, discard: `{捨|す}て{札|ふだ}：${D.p.discard.length} {枚|まい}`, edeck: `{相手|あいて}の{山札|やまふだ}：${D.e.deck.length} {枚|まい}`, ediscard: `{相手|あいて}の{捨|す}て{札|ふだ}：${D.e.discard.length} {枚|まい}` }[h.pile] };
    return null;
  }

  // ---------- every frame ----------
  frame(dt) {
    const xr = this.xrActive;
    const targets = this.table.targets();
    const all = xr ? [...this.vr.targets(), ...(this.vr.modalOpen ? [] : targets)] : targets;
    this.pointer.update(all, xr);
    const hov = this.pointer.hovered;
    // hover: lift / outline the card and show it in the panel
    const hoverKey = hov && hov.kind !== 'board' ? this.keyOf(hov) : null;
    if (hoverKey !== this.table.hoverKey) {
      this.table.hoverKey = hoverKey;
      if (hoverKey && !this.ui.dialogOpen) this.sound.play('hover');
      this.hover = hov && hov.kind !== 'board' && hov.kind !== 'pile' ? hov : hov?.kind === 'pile' ? hov : null;
      if (this.mode === 'duel' && this.D) {
        const info = this.infoFor(this.hover || this.sel);
        if (!xr) this.ui.info(info); else this.vr.showInfo(info, this.computeButtons().filter((b) => b.id !== 'end'));
      }
      if (this.D) this.table.sync(this.D);
    }
    if (xr) this.vr.hover(hov && hov.kind === 'board' ? hov : null);
    for (const e of this.pointer.take()) {
      if (e.type === 'B' || e.type === 'Y' || e.type === 'back') { if (this.vr.modalOpen) continue; this.clearSel(); continue; }
      if (e.type !== 'select') continue;
      if (xr && e.hit && e.hit.kind === 'board') { this.vr.handle(e.hit); continue; }
      if (!xr && this.ui.dialogOpen) continue;
      if (xr && this.vr.modalOpen) continue;
      this.onPick(e.hit && e.hit.kind !== 'board' ? e.hit : null);
    }
    this.table.tick(dt);
    this.fx.tick(dt);
    this.avatar.tick(dt);
    this.room.tick(dt);
    if (xr) this.vr.update();
    // PC camera: frame the table (the side panel covers the right; on phones the sheet covers the bottom)
    if (!xr) this.framePC();
  }
  keyOf(h) {
    if (h.kind === 'plan') return 'plan:' + h.idx;
    if (h.kind === 'slot') return (this.D?.placed[h.idx]?.skipped ? 'hole:' : 'v:') + h.idx;
    if (h.kind === 'bug' || h.kind === 'bugq') return 'bug:' + h.bid;
    if (h.uid != null) return 'c:' + h.uid;
    return null;
  }
  framePC() {
    const w = innerWidth, h = innerHeight;
    const side = w / h > 1 ? Math.min(360, w * 0.34) : 0;
    const bottom = w / h > 1 ? 0 : h * 0.4;
    const key = `${w}x${h}`;
    if (this.viewKey !== key || (this.mode !== 'duel') !== this.viewTitle) {
      this.viewKey = key;
      this.viewTitle = this.mode !== 'duel';
      const cam = this.camera;
      if (this.mode === 'duel' || this.mode === 'result' || this.mode === 'intro') cam.setViewOffset(w, h, side / 2, bottom / 2, w, h);
      else cam.setViewOffset(w, h, -Math.min(580, w) / 2 * (w > 700 ? 0.55 : 0), 0, w, h);
      cam.updateProjectionMatrix();
    }
    // the camera position: higher for the duel, a lower cinematic view for the title
    const aspect = (w - side) / (h - bottom);
    const far = aspect < 0.8 ? 1.5 : aspect < 1.25 ? 1.22 : 1;
    const c = this.core;
    if (this.mode === 'title') { c.pcLook.set(0, TABLE_H + 0.1, -0.35); c.pcHeight = 0.55; c.pcDist = 1.25; c.pcFar = far; c.orbit.yaw = Math.sin(performance.now() / 9000) * 0.3; c.orbit.pitch = 0; }
    else { c.pcLook.set(0, TABLE_H, 0.02); c.pcHeight = 1.12; c.pcDist = 0.62; c.pcFar = far; c.orbit.yaw = 0; c.orbit.pitch = 0; }
  }
}

window.__app = new App();
