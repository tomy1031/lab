// js/ui/menu.js — GT Showroom Menu Controller + Controller-Free Hand Cursor (Pinch & Dwell Click) + Results Screen
import { CARS } from '../data/cars.js';
import { COURSES } from '../data/courses.js';
import { formatTime } from './hud.js';

export class MenuUI {
  constructor(callbacks) {
    this.cb = callbacks;
    this.selectedCourseId = COURSES[0].id;
    this.selectedCarId = CARS[0].id;
    this.difficulty = 'pro';
    this.totalLaps = 3;

    this.el = {
      lobby: document.getElementById('screen-lobby'),
      pause: document.getElementById('screen-pause'),
      results: document.getElementById('screen-results'),
      guide: document.getElementById('modal-guide'),
      courseList: document.getElementById('course-list'),
      carList: document.getElementById('car-list'),
      carTitle: document.getElementById('car-detail-title'),
      carSub: document.getElementById('car-detail-sub'),
      carDesc: document.getElementById('car-detail-desc'),
      carSpecs: document.getElementById('car-detail-specs'),
      statSpeed: document.getElementById('stat-speed'),
      statAccel: document.getElementById('stat-accel'),
      statHandling: document.getElementById('stat-handling'),
      statStability: document.getElementById('stat-stability'),
      courseBadge: document.getElementById('course-detail-badge'),
      btnVR: document.getElementById('btn-vr'),
      btnHand: document.getElementById('btn-hand'),
      handStatus: document.getElementById('hand-status-text'),
      btnStart: document.getElementById('btn-start-race'),
      btnMute: document.getElementById('btn-mute'),
      btnGuide: document.getElementById('btn-guide'),
      btnCloseGuide: document.getElementById('btn-close-guide'),
      btnCam: document.getElementById('btn-cam'),
      btnPauseHud: document.getElementById('btn-pause-hud'),
      btnResume: document.getElementById('btn-resume'),
      btnRestart: document.getElementById('btn-restart'),
      btnQuit: document.getElementById('btn-quit'),
      resTitle: document.getElementById('results-title'),
      resSub: document.getElementById('results-sub'),
      resTable: document.getElementById('results-table'),
      btnResReplay: document.getElementById('btn-res-replay'),
      btnResLobby: document.getElementById('btn-res-lobby'),
      handCursor: document.getElementById('hand-cursor'),
      handCursorRing: document.getElementById('hand-cursor-ring'),
      touchControls: document.getElementById('touch-controls'),
    };

    this._dwellTarget = null;
    this._dwellTimer = 0;

    this.renderCards();
    this.bindEvents();
    this.selectCourse(this.selectedCourseId, false);
    this.selectCar(this.selectedCarId, false);
  }

  renderCards() {
    // 5 Cambodia Courses
    this.el.courseList.innerHTML = COURSES.map((c) => `
      <button class="select-card course-card ${c.isCyber ? 'cyber-card' : ''}" data-course="${c.id}" type="button">
        <div class="card-top">
          <span class="card-tag">${c.isCyber ? 'CYBERPUNK 2099' : c.weather}</span>
          <span class="card-stars">${'★'.repeat(c.difficulty)}${'☆'.repeat(5 - c.difficulty)}</span>
        </div>
        <div class="card-name">${c.jpName}</div>
        <div class="card-en">${c.name}</div>
      </button>
    `).join('');

    // 6 Playable GT Vehicles
    this.el.carList.innerHTML = CARS.map((car) => `
      <button class="select-card car-card" data-car="${car.id}" type="button">
        <div class="card-top">
          <span class="swatch" style="background:${car.color}; border-color:${car.accent};"></span>
          <span class="card-tag">${car.drivetrain} • ${car.powerPs}PS</span>
        </div>
        <div class="card-name">${car.name}</div>
        <div class="card-en">${car.jpName}</div>
      </button>
    `).join('');
  }

  bindEvents() {
    this.el.courseList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-course]');
      if (btn) this.selectCourse(btn.dataset.course, true);
    });
    this.el.carList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-car]');
      if (btn) this.selectCar(btn.dataset.car, true);
    });

    document.querySelectorAll('[data-diff]').forEach((b) => {
      b.addEventListener('click', () => {
        this.difficulty = b.dataset.diff;
        document.querySelectorAll('[data-diff]').forEach((x) => x.classList.toggle('active', x === b));
        this.cb.onClickSound?.();
      });
    });

    document.querySelectorAll('[data-laps]').forEach((b) => {
      b.addEventListener('click', () => {
        this.totalLaps = Number(b.dataset.laps) || 3;
        document.querySelectorAll('[data-laps]').forEach((x) => x.classList.toggle('active', x === b));
        this.cb.onClickSound?.();
      });
    });

    this.el.btnStart.addEventListener('click', () => this.cb.onStartRace?.());
    this.el.btnVR.addEventListener('click', () => this.cb.onToggleVR?.());
    this.el.btnHand.addEventListener('click', () => this.cb.onToggleHands?.());
    this.el.btnMute.addEventListener('click', () => this.cb.onToggleMute?.());
    this.el.btnGuide.addEventListener('click', () => {
      this.el.guide.classList.remove('hidden');
      this.cb.onClickSound?.();
    });
    this.el.btnCloseGuide.addEventListener('click', () => {
      this.el.guide.classList.add('hidden');
      this.cb.onClickSound?.();
    });

    this.el.btnCam.addEventListener('click', () => this.cb.onCycleCamera?.());
    this.el.btnPauseHud.addEventListener('click', () => this.cb.onTogglePause?.());
    this.el.btnResume.addEventListener('click', () => this.cb.onTogglePause?.());
    this.el.btnRestart.addEventListener('click', () => this.cb.onRestartRace?.());
    this.el.btnQuit.addEventListener('click', () => this.cb.onReturnLobby?.());
    this.el.btnResReplay.addEventListener('click', () => this.cb.onRestartRace?.());
    this.el.btnResLobby.addEventListener('click', () => this.cb.onReturnLobby?.());
  }

  selectCourse(id, notify = true) {
    this.selectedCourseId = id;
    const course = COURSES.find((c) => c.id === id) || COURSES[0];
    document.body.classList.toggle('theme-cyber', course.isCyber);
    this.el.courseList.querySelectorAll('[data-course]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.course === id);
    });
    this.el.courseBadge.innerHTML = `
      <span class="loc-pin">${course.location}</span>
      <strong>${course.jpName}</strong> — ${course.subtitle}
    `;
    if (notify) {
      this.cb.onClickSound?.();
      this.cb.onSelectCourse?.(id);
    }
  }

  selectCar(id, notify = true) {
    this.selectedCarId = id;
    const car = CARS.find((c) => c.id === id) || CARS[0];
    this.el.carList.querySelectorAll('[data-car]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.car === id);
    });
    this.el.carTitle.textContent = car.name;
    this.el.carSub.textContent = `${car.category}  |  ${car.engine}`;
    this.el.carDesc.textContent = car.description;
    this.el.carSpecs.textContent = `${car.powerPs} PS  •  ${car.weightKg} kg  •  ${car.drivetrain}`;
    this.el.statSpeed.style.width = `${car.stats.speed}%`;
    this.el.statAccel.style.width = `${car.stats.accel}%`;
    this.el.statHandling.style.width = `${car.stats.handling}%`;
    this.el.statStability.style.width = `${car.stats.stability}%`;
    if (notify) {
      this.cb.onClickSound?.();
      this.cb.onSelectCar?.(id);
    }
  }

  setScreen(name) {
    // name: 'lobby' | 'race' | 'pause' | 'results' | 'vr'
    this.el.lobby.classList.toggle('hidden', name !== 'lobby');
    this.el.pause.classList.toggle('hidden', name !== 'pause');
    this.el.results.classList.toggle('hidden', name !== 'results');
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.el.touchControls.classList.toggle('hidden', !(name === 'race' && isTouch));
  }

  setVRButtonState(supported, presenting) {
    if (presenting) {
      this.el.btnVR.textContent = 'VR 終了';
      this.el.btnVR.classList.add('active');
    } else if (supported) {
      this.el.btnVR.textContent = 'VRモードで遊ぶ (WebXR)';
      this.el.btnVR.classList.remove('active');
    } else {
      this.el.btnVR.textContent = 'VR (WebXR対応端末で有効)';
      this.el.btnVR.classList.remove('active');
    }
  }

  setHandStatus(status, errMsg = '') {
    const map = {
      off: 'ハンド操作: OFF（クリックでカメラ起動）',
      camera: 'カメラ起動中...',
      model: 'ハンドAIモデル読込中...',
      ready: 'ハンド操作: ON（手だけで全操作可能）',
      error: `ハンド操作エラー: ${errMsg}`,
    };
    this.el.handStatus.textContent = map[status] || '';
    this.el.btnHand.classList.toggle('active', status === 'ready');
    this.el.btnHand.textContent = status === 'ready' ? 'ハンド操作 ON ✓' : 'ハンドジェスチャー操作';
  }

  showResults(standings, course) {
    const player = standings.find((c) => c.isPlayer);
    const pos = player ? player.position : 1;
    const suffix = pos === 1 ? 'st — CHAMPION!' : pos === 2 ? 'nd — PODIUM!' : pos === 3 ? 'rd — PODIUM!' : 'th PLACE';
    this.el.resTitle.textContent = `${pos}${suffix}`;
    this.el.resSub.textContent = `${course.jpName}  •  BEST LAP ${formatTime(player?.bestLap || 0)}`;

    this.el.resTable.innerHTML = standings.map((c, idx) => `
      <div class="res-row ${c.isPlayer ? 'me' : ''}">
        <span class="res-pos">${idx + 1}</span>
        <span class="res-name">${c.name}</span>
        <span class="res-car">${c.spec.name}</span>
        <span class="res-time">${c.finished ? formatTime(c.finishTime) : `+${Math.max(0.2, ((standings[0].totalDist - c.totalDist) / 55)).toFixed(2)}s`}</span>
      </div>
    `).join('');

    this.setScreen('results');
  }

  // Controller-free Webcam Hand Cursor for ALL UI screens (supports BOTH Pinch-to-Click and 0.9s Dwell-to-Click)
  updateHandCursor(dt, handTracker, uiActive) {
    const el = this.el.handCursor;
    if (!uiActive || !handTracker || !handTracker.ready || !handTracker.cursor.visible) {
      el.classList.add('hidden');
      this._dwellTarget = null;
      this._dwellTimer = 0;
      return;
    }

    const c = handTracker.cursor;
    const px = c.x * window.innerWidth;
    const py = c.y * window.innerHeight;
    el.classList.remove('hidden');
    el.style.transform = `translate(${px}px, ${py}px)`;
    el.classList.toggle('pinching', c.pinch);

    const hit = document.elementFromPoint(px, py)?.closest('button');
    if (hit && !hit.disabled) {
      if (hit === this._dwellTarget) {
        this._dwellTimer += dt;
      } else {
        this._dwellTarget = hit;
        this._dwellTimer = 0;
      }
      const prog = Math.min(1, this._dwellTimer / 0.9);
      this.el.handCursorRing.style.strokeDashoffset = String(100 - prog * 100);
      if (c.clicked || this._dwellTimer >= 0.9) {
        this._dwellTimer = -0.35; // brief cooldown so it doesn't double-fire
        hit.click();
      }
    } else {
      this._dwellTarget = null;
      this._dwellTimer = 0;
      this.el.handCursorRing.style.strokeDashoffset = '100';
    }
  }
}
