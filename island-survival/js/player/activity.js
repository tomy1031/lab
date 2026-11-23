// player/activity.js — the timed "doing something" layer: chopping, gathering, digging, fishing with a rod,
// net fishing, making fire by friction or with flint, hammering a structure. Each activity can be played with
// the mouse / keys / touch OR with hand gestures (gesture/motion.js events), and reports progress for the HUD.
//
// An activity is created by player/actions.js with a spec:
//   { kind, title, target (node), tool, params, onDone(result), onCancel() }
// and the controller feeds it `input` each frame: { click, hold, release, axisX, gestures: [events], draw, keys }.
// It exposes `progress` (0…1), `bar2` (optional second meter: tension / heat), `hint` (text), `phase`.

const clamp01 = (v) => Math.max(0, Math.min(1, v));

class Activity {
  constructor(spec, ctx) {
    this.spec = spec; this.ctx = ctx;
    this.progress = 0; this.bar2 = null; this.phase = 'go';
    this.done = false; this.t = 0; this.hint = ''; this.label = spec.title || '';
    this.result = null;
  }
  finish(result) { if (this.done) return; this.done = true; this.result = result; this.spec.onDone?.(result, this); }
  cancel() { if (this.done) return; this.done = true; this.spec.onCancel?.(this); }
  has(ev, type, pred) { return ev.some((e) => e.type === type && (!pred || pred(e))); }
}

// ------------------------------------------------------------------ hit-based work (chop / break / dig / hammer)
// params: { hits, staminaPerHit, anim: 'swing'|'hammer'|'pick', sound, gestureTypes: ['swing'] }
class HitWork extends Activity {
  constructor(spec, ctx) {
    super(spec, ctx);
    this.hits = 0;
    this.need = Math.max(1, Math.round(spec.params.hits));
    this.cool = 0;
    this.hint = ctx.gesture ? '手を握って、上から振り下ろす（何度も）' : 'クリック（長押しで連続）';
  }
  update(dt, input) {
    this.t += dt;
    this.cool -= dt;
    const g = input.gestures;
    const auto = input.hold && this.cool <= 0;
    const gHit = g.some((e) => e.type === 'swing' && (e.dir === 'down' || e.dir === 'left' || e.dir === 'right') && e.pose !== 'open') || g.some((e) => e.type === 'swing' && this.spec.params.anyStroke);
    if ((input.click || auto || gHit) && this.cool <= 0) {
      this.cool = this.spec.params.interval ?? 0.45;
      this.hits++;
      this.ctx.onHit?.(this);
      this.progress = clamp01(this.hits / this.need);
      if (this.hits >= this.need) this.finish({ ok: true });
    }
  }
}

// ------------------------------------------------------------------ hold to gather (pick berries, cut fibre …)
// params: { seconds }. Gesture: pinch / grab / swing near the target speeds it a lot.
class HoldWork extends Activity {
  constructor(spec, ctx) {
    super(spec, ctx);
    this.hint = ctx.gesture ? 'つまむ・つかむ動き（何度か）' : 'E またはクリックを長押し';
  }
  update(dt, input) {
    this.t += dt;
    const sec = this.spec.params.seconds ?? 1.2;
    let add = input.hold || input.holdE ? dt / sec : 0;
    for (const e of input.gestures) if (e.type === 'pinch' || e.type === 'grab' || (e.type === 'swing' && e.dir === 'down')) add += 0.34;
    if (add > 0) this.ctx.onTick?.(this, add);
    this.progress = clamp01(this.progress + add);
    if (!input.hold && !input.holdE && !input.gestures.length) this.progress = Math.max(0, this.progress - dt * 0.05);
    if (this.progress >= 1) this.finish({ ok: true });
  }
}

// ------------------------------------------------------------------ rod fishing
// phases: aim → (cast) → wait → bite → (hook within window) → reel (tension game) → done
// params: { biteMin, biteMax (s), window (s), fish: {pull 0…1, stamina} | null (nothing biting), lineStrength }
class RodFishing extends Activity {
  constructor(spec, ctx) {
    super(spec, ctx);
    this.phase = 'aim';
    this.power = 0;
    this.hint = ctx.gesture ? '腕を上げてから前へ振り下ろして投げる' : 'クリック長押しで力をためて、離して投げる';
  }
  update(dt, input) {
    this.t += dt;
    const P = this.spec.params, g = input.gestures, ctx = this.ctx;
    if (this.phase === 'aim') {
      if (input.hold) this.power = clamp01(this.power + dt * 0.9);
      this.bar2 = this.power;
      const gCast = g.find((e) => e.type === 'swing' && e.dir === 'down') || g.find((e) => e.type === 'push') || g.find((e) => e.type === 'throw');
      if ((input.release && this.power > 0.05) || gCast) {
        if (gCast) this.power = clamp01(0.45 + (gCast.speed || 6) / 25);
        this.phase = 'wait';
        this.wait = P.biteMin + Math.random() * (P.biteMax - P.biteMin) * (1.2 - this.power * 0.4);
        this.t = 0; this.bar2 = null;
        ctx.onCast?.(this, this.power);
        this.hint = '待つ…（ウキが沈んだら合わせる）';
      }
    } else if (this.phase === 'wait') {
      this.progress = 0;
      if (input.click || g.some((e) => e.type === 'swing' && e.dir === 'up')) { this.phase = 'aim'; this.power = 0; this.hint = '早すぎた。もう一度投げる'; ctx.onEarly?.(this); return; }
      if (this.t > this.wait) {
        if (!P.fish) { this.finish({ ok: false, why: 'nofish' }); return; }
        this.phase = 'bite'; this.t = 0;
        ctx.onBite?.(this);
        this.hint = ctx.gesture ? '今だ！ 手を素早く上へ引く' : '今だ！ クリック！';
      }
    } else if (this.phase === 'bite') {
      const hook = input.click || g.some((e) => (e.type === 'swing' && e.dir === 'up') || e.type === 'pull');
      if (hook) {
        this.phase = 'reel'; this.t = 0;
        this.tension = 0.4; this.fishLeft = P.fish.stamina ?? 1; this.dist = 1;
        ctx.onHook?.(this);
        this.hint = ctx.gesture ? '手で円を描いて巻く。張りすぎたら止める' : 'マウス長押しで巻く。赤くなったら離す';
      } else if (this.t > (P.window ?? 1.1)) {
        this.finish({ ok: false, why: 'missed' });
      }
    } else if (this.phase === 'reel') {
      // reeling raises tension and brings the fish closer; the fish pulls in bursts
      let reel = input.hold ? 1 : 0;
      for (const e of g) if (e.type === 'reel') reel += 2.2;
      if (g.some((e) => e.type === 'pull')) reel += 3;
      const burst = Math.max(0, Math.sin(this.t * (2.1 + P.fish.pull)) * P.fish.pull);
      this.tension += (reel * 0.55 + burst * 0.9 - 0.65) * dt;
      this.tension = clamp01(this.tension);
      this.dist -= reel * dt * 0.12 * (1.2 - burst * 0.6) * (0.6 + 0.4 * (1 - this.fishLeft));
      this.fishLeft = Math.max(0, this.fishLeft - dt * 0.12 * (reel > 0 ? 1.5 : 0.5));
      this.dist = Math.min(1, this.dist + burst * dt * 0.05);
      this.progress = clamp01(1 - this.dist);
      this.bar2 = this.tension;
      if (reel > 0 && Math.random() < dt * 4) ctx.onReel?.(this);
      if (this.tension >= 0.999 && Math.random() < dt * (3 - (P.lineStrength ?? 1))) { this.finish({ ok: false, why: 'snap' }); return; }
      if (this.dist <= 0) this.finish({ ok: true });
      if (this.t > 40) this.finish({ ok: false, why: 'escaped' });
    }
  }
}

// ------------------------------------------------------------------ net: throw, let it sink, pull in
class NetFishing extends Activity {
  constructor(spec, ctx) {
    super(spec, ctx);
    this.phase = 'aim';
    this.pulls = 0;
    this.hint = ctx.gesture ? '両手（または片手）を前へ突き出して投げる' : 'クリックで投げる';
  }
  update(dt, input) {
    this.t += dt;
    const g = input.gestures, P = this.spec.params;
    if (this.phase === 'aim') {
      if (input.click || g.some((e) => e.type === 'push' || e.type === 'throw' || (e.type === 'swing' && e.dir !== 'up'))) {
        this.phase = 'sink'; this.t = 0; this.ctx.onThrow?.(this); this.hint = '網が沈むのを待つ…';
      }
    } else if (this.phase === 'sink') {
      this.progress = clamp01(this.t / (P.sink ?? 2.5)) * 0.3;
      if (this.t > (P.sink ?? 2.5)) { this.phase = 'pull'; this.t = 0; this.hint = this.ctx.gesture ? 'こぶしで引く・つかむ動きをくり返す' : 'クリック連打でたぐり寄せる'; }
    } else if (this.phase === 'pull') {
      let add = input.click ? 1 : 0;
      for (const e of g) if (e.type === 'pull' || e.type === 'grab' || (e.type === 'swing' && e.dir === 'down')) add += 1;
      if (add) { this.pulls += add; this.ctx.onPull?.(this); }
      this.progress = 0.3 + clamp01(this.pulls / (P.pulls ?? 6)) * 0.7;
      if (this.pulls >= (P.pulls ?? 6)) this.finish({ ok: true, speed: this.t });
      if (this.t > 25) this.finish({ ok: true, speed: this.t, slow: true });
    }
  }
}

// ------------------------------------------------------------------ friction fire (hand drill / bow drill)
// params: { heatPerStroke, cool (per s), wetPenalty 0…1, need (strokes to ember) }
class FrictionFire extends Activity {
  constructor(spec, ctx) {
    super(spec, ctx);
    this.heat = 0; this.lastX = 0; this.dir = 0;
    this.phase = 'rub';
    this.hint = ctx.gesture ? '両手のひらを合わせて、前後にこすり続ける' : 'マウスを左右に素早く動かす（または A・D を交互に）';
  }
  update(dt, input) {
    this.t += dt;
    const P = this.spec.params;
    let strokes = 0;
    for (const e of input.gestures) if (e.type === 'rub') strokes++;
    // mouse / keys: count direction reversals of horizontal movement
    const ax = input.axisX;
    if (Math.abs(ax) > 2) { const d = Math.sign(ax); if (d !== this.dir) { if (this.dir !== 0) strokes++; this.dir = d; } }
    if (input.keyAlt) strokes++;
    if (strokes) this.ctx.onRub?.(this, strokes);
    const wet = P.wetPenalty ?? 0;
    this.heat += strokes * (P.heatPerStroke ?? 0.045) * (1 - wet * 0.7);
    this.heat -= dt * (P.cool ?? 0.11) * (1 + wet);
    this.heat = clamp01(this.heat);
    this.bar2 = this.heat;
    if (this.phase === 'rub') {
      this.progress = this.heat * 0.85;
      if (this.heat >= 0.999) { this.phase = 'ember'; this.t = 0; this.ctx.onEmber?.(this); this.hint = this.ctx.gesture ? '火種ができた！ 手を口元から前へ押し出して、そっと吹く' : '火種！ スペース長押しでそっと吹く'; }
      if (this.t > 70) this.finish({ ok: false, why: 'tired' });
    } else {
      const blow = input.keys?.Space || input.gestures.some((e) => e.type === 'push');
      this.progress = 0.85 + clamp01(this.t / 2.2) * 0.15 * (blow ? 1 : 0.2);
      if (blow) this.blowT = (this.blowT || 0) + dt;
      if ((this.blowT || 0) > 1.6 || input.gestures.some((e) => e.type === 'push')) this.finish({ ok: Math.random() < (P.catchChance ?? 0.85), why: 'blown' });
      if (this.t > 8) this.finish({ ok: false, why: 'ember_died' });
    }
  }
}

// ------------------------------------------------------------------ flint & steel / striking sparks
// params: { catchChance per spark, maxStrikes }
class SparkFire extends Activity {
  constructor(spec, ctx) {
    super(spec, ctx);
    this.strikes = 0; this.cool = 0;
    this.hint = ctx.gesture ? 'こぶし同士を素早く打ち合わせる' : 'クリックで火花を散らす';
  }
  update(dt, input) {
    this.t += dt; this.cool -= dt;
    const P = this.spec.params;
    const strike = (input.click || input.gestures.some((e) => e.type === 'strike' || (e.type === 'swing' && e.pose === 'fist'))) && this.cool <= 0;
    if (strike) {
      this.cool = 0.25; this.strikes++;
      this.ctx.onSpark?.(this);
      this.progress = clamp01(this.strikes / (P.maxStrikes ?? 12));
      if (Math.random() < (P.catchChance ?? 0.25)) { this.finish({ ok: true, strikes: this.strikes }); return; }
      if (this.strikes >= (P.maxStrikes ?? 12)) this.finish({ ok: false, why: 'no_catch' });
    }
  }
}

export const ACTIVITIES = { hit: HitWork, hold: HoldWork, rod: RodFishing, net: NetFishing, friction: FrictionFire, spark: SparkFire };

export function createActivity(spec, ctx) {
  const C = ACTIVITIES[spec.kind];
  if (!C) throw new Error(`unknown activity ${spec.kind}`);
  return new C(spec, ctx);
}
