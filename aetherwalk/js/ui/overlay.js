// js/ui/overlay.js — the PC preview overlay (#aw-overlay, DOM): HUD, toasts, titles, the menu canvas, the
// controls card, the fade when you fall. Hidden in VR and by AW.debug.hud(false) (body.aw-nohud). (OPUS-B)
import { hearts, gauge, C } from './text.js';

const CSS = `
body.awui-menu-open #aw-hint { display:none !important; }
#aw-overlay .awui { position:absolute; inset:0; font-family:"Zen Kaku Gothic New","Noto Sans JP","Hiragino Sans","IPAGothic",system-ui,sans-serif; color:#f4ecd8; }
#aw-overlay .awui-card { background:rgba(27,36,64,0.8); border:1px solid rgba(255,215,106,0.28); border-radius:14px; backdrop-filter:blur(4px); }
#aw-overlay .awui-tl { position:absolute; left:14px; top:14px; padding:10px 14px 12px; min-width:250px; }
#aw-overlay .awui-tl canvas { display:block; }
#aw-overlay .awui-tw { display:flex; justify-content:space-between; align-items:baseline; margin-top:6px; font-size:13px; }
#aw-overlay .awui-tw b { color:#7fe9ff; font-weight:700; } #aw-overlay .awui-tw i { color:#ffd76a; font-style:normal; font-weight:700; }
#aw-overlay .awui-bar { height:10px; border-radius:6px; background:rgba(244,236,216,0.14); margin-top:4px; overflow:hidden; position:relative; }
#aw-overlay .awui-bar > div { height:100%; width:0; background:#7fe9ff; border-radius:6px; transition:width .25s; }
#aw-overlay .awui-bar.t2 > div { background:#ffd76a; }
#aw-overlay .awui-bar span { position:absolute; top:0; bottom:0; width:2px; background:rgba(14,20,48,0.7); }
#aw-overlay .awui-bl { position:absolute; left:14px; bottom:14px; padding:10px 16px; display:grid; grid-template-columns:auto auto; gap:2px 22px; align-items:baseline; }
#aw-overlay .awui-cad { grid-column:1 / span 2; display:flex; align-items:baseline; gap:8px; }
#aw-overlay .awui-cad b { font-size:40px; font-weight:800; color:#fffbe8; line-height:1; }
#aw-overlay .awui-cad small { color:rgba(244,236,216,0.62); } #aw-overlay .awui-cad em { color:#ffd76a; font-style:normal; margin-left:6px; font-size:15px; }
#aw-overlay .awui-stat { font-size:19px; font-weight:700; } #aw-overlay .awui-stat small { font-size:11px; color:rgba(244,236,216,0.62); font-weight:500; margin-left:4px; }
#aw-overlay .awui-obj { position:absolute; left:50%; top:14px; transform:translateX(-50%); padding:8px 16px; display:flex; align-items:center; gap:12px; max-width:60vw; font-size:16px; }
#aw-overlay .awui-obj .arr { width:22px; height:22px; transition:transform .2s; }
#aw-overlay .awui-obj .dist { color:#ffd76a; font-weight:700; white-space:nowrap; }
#aw-overlay .awui-trial { position:absolute; left:50%; top:62px; transform:translateX(-50%); padding:8px 16px; width:min(420px,60vw); display:none; }
#aw-overlay .awui-trial .row { display:flex; justify-content:space-between; font-size:15px; } #aw-overlay .awui-trial .row b { color:#ffd76a; }
#aw-overlay .awui-toast { position:absolute; left:50%; top:30%; transform:translate(-50%,-50%); padding:12px 22px 12px 18px; border-left:5px solid #ffd76a; display:none; max-width:70vw; text-align:left; }
#aw-overlay .awui-toast .m { font-size:20px; font-weight:700; } #aw-overlay .awui-toast .s { font-size:13px; color:rgba(244,236,216,0.7); margin-top:2px; }
#aw-overlay .awui-title { position:absolute; left:0; right:0; top:16%; text-align:center; display:none; text-shadow:0 2px 16px rgba(14,20,48,0.8); }
#aw-overlay .awui-title .m { font-size:48px; font-weight:800; letter-spacing:.08em; color:#fffbe8; } #aw-overlay .awui-title .s { font-size:16px; color:#ffd76a; letter-spacing:.3em; margin-top:4px; }
#aw-overlay .awui-help { position:absolute; right:14px; bottom:14px; padding:10px 14px; font-size:12px; line-height:1.65; pointer-events:auto; cursor:pointer; max-width:300px; }
#aw-overlay .awui-help h4 { margin:0; font-size:13px; color:#ffd76a; letter-spacing:.08em; } #aw-overlay .awui-help kbd { font-family:inherit; border:1px solid rgba(255,215,106,0.35); border-radius:4px; padding:0 4px; font-size:11px; }
#aw-overlay .awui-help.min ul { display:none; } #aw-overlay .awui-help ul { margin:6px 0 0; padding-left:1em; }
#aw-overlay .awui-menu { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); display:none; pointer-events:auto; }
#aw-overlay .awui-menu canvas { width:min(640px,86vh,92vw); height:min(640px,86vh,92vw); display:block; cursor:pointer; border-radius:24px; }
#aw-overlay .awui-menu .close { position:absolute; right:-10px; top:-10px; width:34px; height:34px; border-radius:50%; border:1px solid rgba(255,215,106,0.5); background:#1b2440; color:#ffd76a; font-size:18px; cursor:pointer; }
#aw-overlay .awui-fade { position:absolute; inset:0; background:#fffbe8; opacity:0; transition:opacity .6s; }
#aw-overlay .awui-hurt { position:absolute; inset:0; opacity:0; transition:opacity .35s; background:radial-gradient(ellipse at center, rgba(255,255,255,0) 55%, rgba(244,236,216,0.55) 100%); }
#aw-overlay .awui-still { position:absolute; inset:0; opacity:0; transition:opacity 1s; background:rgba(107,103,112,0.28); mix-blend-mode:saturation; }
#aw-overlay .awui-warn { position:absolute; width:0; height:0; border-left:16px solid transparent; border-right:16px solid transparent; border-bottom:26px solid #ff3b5c; display:none; filter:drop-shadow(0 0 6px rgba(255,59,92,0.9)); }
#aw-overlay .awui-pause { position:absolute; left:50%; top:45%; transform:translate(-50%,-50%); padding:14px 28px; font-size:22px; display:none; }
#aw-overlay .awui-cool { position:absolute; left:50%; bottom:90px; transform:translateX(-50%); padding:8px 18px; display:none; font-size:16px; }
`;

export function createOverlay(ctx, S, ui) {
  const host = document.getElementById('aw-overlay');
  if (!host) return { update() {}, flash() {}, fade() {}, setVisible() {} };
  if (!document.getElementById('awui-style')) {
    const st = document.createElement('style'); st.id = 'awui-style'; st.textContent = CSS; document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'awui';
  root.innerHTML = `
    <div class="awui-still"></div><div class="awui-hurt"></div>
    <div class="awui-tl awui-card"><canvas width="300" height="40"></canvas>
      <div class="awui-tw"><span><b>追い風</b> TAILWIND</span><i></i></div>
      <div class="awui-bar"><div></div><span style="left:50%"></span></div></div>
    <div class="awui-obj awui-card"><svg class="arr" viewBox="-12 -12 24 24"><path d="M0,-10 L8,8 L0,3 L-8,8 Z" fill="#ffd76a" stroke="#0e1430" stroke-width="2"/></svg><span class="txt"></span><span class="dist"></span></div>
    <div class="awui-trial awui-card"><div class="row"><span class="n"></span><b class="v"></b></div><div class="awui-bar t2"><div></div></div></div>
    <div class="awui-bl awui-card">
      <div class="awui-cad"><b>0</b><small>spm</small><em></em></div>
      <div class="awui-stat st-steps">0<small>歩 STEPS</small></div><div class="awui-stat st-km">0.00<small>km</small></div>
      <div class="awui-stat st-kcal">0<small>kcal 目安</small></div><div class="awui-stat st-act">0<small>分 ACTIVE</small></div>
    </div>
    <div class="awui-toast awui-card"><div class="m"></div><div class="s"></div></div>
    <div class="awui-title"><div class="m"></div><div class="s"></div></div>
    <div class="awui-cool awui-card"></div>
    <div class="awui-pause awui-card">一時停止 PAUSED</div>
    <div class="awui-help awui-card min"><h4>操作 CONTROLS ▾</h4><ul>
      <li><kbd>W</kbd> 歩く <kbd>Shift</kbd>+<kbd>W</kbd> 走る <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>W</kbd> 全力</li>
      <li><kbd>A</kbd>/<kbd>D</kbd> 向き <kbd>S</kbd> 後ろ歩き · マウスで見回す</li>
      <li>左クリック 振る（横→縦→突き）· 右クリック 盾／弓</li>
      <li><kbd>C</kbd> しゃがむ <kbd>Z</kbd>/<kbd>X</kbd> 左右によける <kbd>G</kbd> 腕を広げる</li>
      <li><kbd>E</kbd> つかむ <kbd>Q</kbd> 投げる <kbd>F</kbd> 食べる・使う <kbd>1</kbd>〜<kbd>6</kbd> ホルスター</li>
      <li><kbd>Tab</kbd> 手首メニュー <kbd>M</kbd> 地図 <kbd>H</kbd> HUD <kbd>P</kbd> 一時停止</li>
      <li><span style="color:#ff3b5c">赤い予告</span>が出たら：頭の線はしゃがむ、足もとの帯は横へ</li></ul></div>
    <div class="awui-menu"><canvas width="640" height="640"></canvas><button class="close" type="button">×</button></div>
    <div class="awui-warn"></div>
    <div class="awui-fade"></div>`;
  host.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const heartsCv = $('.awui-tl canvas'), hg = heartsCv.getContext('2d');
  const tierEl = $('.awui-tw i'), barEl = $('.awui-tl .awui-bar'), barFill = $('.awui-tl .awui-bar > div'), barMark = $('.awui-tl .awui-bar span');
  const objEl = $('.awui-obj'), objTxt = $('.awui-obj .txt'), objDist = $('.awui-obj .dist'), objArr = $('.awui-obj .arr');
  const trialEl = $('.awui-trial'), trialN = $('.awui-trial .n'), trialV = $('.awui-trial .v'), trialFill = $('.awui-trial .awui-bar > div');
  const cadB = $('.awui-cad b'), cadEm = $('.awui-cad em');
  const stSteps = $('.st-steps'), stKm = $('.st-km'), stKcal = $('.st-kcal'), stAct = $('.st-act');
  const toastEl = $('.awui-toast'), toastM = $('.awui-toast .m'), toastS = $('.awui-toast .s');
  const titleEl = $('.awui-title'), titleM = $('.awui-title .m'), titleS = $('.awui-title .s');
  const helpEl = $('.awui-help'), menuEl = $('.awui-menu'), menuCv = $('.awui-menu canvas'), menuG = menuCv.getContext('2d');
  const fadeEl = $('.awui-fade'), hurtEl = $('.awui-hurt'), stillEl = $('.awui-still'), warnEl = $('.awui-warn'), pauseEl = $('.awui-pause'), coolEl = $('.awui-cool');
  helpEl.addEventListener('click', () => helpEl.classList.toggle('min'));
  $('.awui-menu .close').addEventListener('click', (e) => { e.stopPropagation(); ui.closeMenu(); });
  menuCv.addEventListener('click', (e) => {
    const r = menuCv.getBoundingClientRect();
    ui.wrist.click((e.clientX - r.left) / r.width * 640, (e.clientY - r.top) / r.height * 640);
  });
  menuCv.addEventListener('mousedown', (e) => e.stopPropagation());
  S.domMenu = { dirty: true };

  const set = (el, v) => { if (el._v !== v) { el._v = v; el.textContent = v; } };
  const css = (el, k, v) => { const key = '_s' + k; if (el[key] !== v) { el[key] = v; el.style[k] = v; } };
  const pct = (k) => Math.round(100 * Math.max(0, Math.min(1, k)));
  objEl.dataset.disp = 'flex';
  const show = (el, b) => { const d = b ? (el.dataset.disp || 'block') : 'none'; if (el._d !== d) { el._d = d; el.style.display = d; } };
  let sigH = '', hurtT = 0, warnT = 0, fadeOn = false, lastToast = null, lastTitle = null;

  return {
    root,
    flash() { hurtT = 0.35; hurtEl.style.opacity = '1'; },
    fade(on) { fadeOn = on; fadeEl.style.opacity = on ? '1' : '0'; },
    warn(angle, t) {
      warnT = t;
      // a chevron on the screen edge toward the attacker (relative to where you look)
      const r = 0.42 * Math.min(window.innerWidth, window.innerHeight);
      const x = window.innerWidth / 2 + Math.sin(angle) * r, y = window.innerHeight / 2 - Math.cos(angle) * r;
      warnEl.style.left = `${x - 16}px`; warnEl.style.top = `${y - 13}px`;
      warnEl.style.transform = `rotate(${angle}rad)`;
      warnEl.style.display = 'block';
    },
    update(dt, vr) {
      root.style.display = vr ? 'none' : '';
      if (vr) return;
      const v = S.vitals;
      const sh = `${v.hp}|${v.maxHp}`;
      if (sh !== sigH) {
        sigH = sh;
        const rows = Math.ceil(v.maxHp / 4) > 8 ? 2 : 1;
        heartsCv.height = rows * 34 + 4; heartsCv.width = 300;
        hg.clearRect(0, 0, 300, heartsCv.height);
        hearts(hg, 0, 2, 32, v.hp, v.maxHp, 8);
      }
      const sp = pct(v.stamina / Math.max(1, v.maxStamina));
      if (barFill._p !== sp) { barFill._p = sp; barFill.style.width = sp + '%'; }
      const mk = Math.round(5000 / v.maxStamina);
      if (barMark._p !== mk) { barMark._p = mk; barMark.style.left = mk + '%'; }
      barEl.classList.toggle('t2', v.tier >= 2);
      set(tierEl, v.tier ? `追い風 ${v.tier === 2 ? 'II' : 'I'}` : '');
      // objective
      const o = S.objective;
      if (o && o.text) {
        show(objEl, true);
        set(objTxt, o.text);
        set(objDist, S.objDist == null ? '' : S.objDist >= 1000 ? `${(S.objDist / 1000).toFixed(1)} km` : `${Math.round(S.objDist)} m`);
        const deg = Math.round((S.objBearing || 0) * 57.3 / 3) * 3;
        if (objArr._d !== deg) { objArr._d = deg; objArr.style.transform = 'rotate(' + deg + 'deg)'; }
        css(objArr, 'display', S.objDist == null ? 'none' : '');
      } else show(objEl, false);
      // trial / boss gauge
      if (S.trial) {
        show(trialEl, true); set(trialN, S.trial.name); set(trialV, S.trial.label);
        const tp = pct(S.trial.k);
        if (trialFill._p !== tp) { trialFill._p = tp; trialFill.style.width = tp + '%'; }
      } else if (S.boss && S.boss.phase === 2) {
        const bp = pct(S.boss.k);
        show(trialEl, true); set(trialN, '殻をはがせ — その場で駆け足 140+ spm');
        if (trialFill._p !== bp) { trialFill._p = bp; trialFill.style.width = bp + '%'; set(trialV, bp + '%'); }
      } else show(trialEl, false);
      css(stillEl, 'opacity', S.boss && S.boss.phase === 2 ? '1' : '0');
      // movement + stats
      if (cadB._n !== S.cadence) { cadB._n = S.cadence; cadB.textContent = String(S.cadence); }
      set(cadEm, S.gait === 'idle' ? '' : S.gait === 'walk' ? '歩き WALK' : S.gait === 'jog' ? '駆け足 JOG' : '全力 SPRINT');
      if (stSteps._n !== S.stepsToday) { stSteps._n = S.stepsToday; stSteps.firstChild.nodeValue = S.stepsToday.toLocaleString(); }
      const km = Math.round(S.kmToday * 100);
      if (stKm._n !== km) { stKm._n = km; stKm.firstChild.nodeValue = (km / 100).toFixed(2); }
      const kc = Math.round(S.kcalToday);
      if (stKcal._n !== kc) { stKcal._n = kc; stKcal.firstChild.nodeValue = String(kc); }
      const am = Math.floor(S.activeToday / 60);
      if (stAct._n !== am) { stAct._n = am; stAct.firstChild.nodeValue = String(am); }
      // toast / title (the queue lives in createToasts)
      const t = S.currentToast;
      if (t !== lastToast) {
        lastToast = t;
        if (t) {
          toastM.textContent = t.text || ''; toastS.textContent = t.sub || '';
          toastEl.style.borderLeftColor = t.kind === 'warn' ? '#ffb347' : t.kind === 'quest' ? '#7fe9ff' : '#ffd76a';
        }
        show(toastEl, !!t);
      }
      if (t) toastEl.style.opacity = String(Math.min(1, t.left / 300));
      const ti = S.currentTitle;
      if (ti !== lastTitle) { lastTitle = ti; if (ti) { titleM.textContent = ti.text || ''; titleS.textContent = ti.sub || ''; } show(titleEl, !!ti); }
      if (ti) titleEl.style.opacity = String(Math.min(1, ti.left / 500));
      // menu
      const open = ui.menuOpen;
      show(menuEl, open);
      if (open && S.domMenu.dirty) { S.domMenu.dirty = false; menuG.clearRect(0, 0, 640, 640); menuG.drawImage(ui.wrist.panel.canvas, 0, 0); }
      show(pauseEl, !!ctx.paused && !open && ctx.pauseReason !== 'hidden');
      if (S.cooldown) { show(coolEl, true); set(coolEl, `クールダウン — ゆっくり歩こう ${Math.ceil(S.cooldown.left)} 秒  COOL DOWN`); } else show(coolEl, false);
      if (hurtT > 0) { hurtT -= dt; if (hurtT <= 0) hurtEl.style.opacity = '0'; }
      if (warnT > 0) { warnT -= dt; if (warnT <= 0) warnEl.style.display = 'none'; }
    },
  };
}
