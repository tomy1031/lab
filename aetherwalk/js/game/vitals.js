// js/game/vitals.js — HP (1 heart = 4), tailwind stamina (§2.4), damage/heal, buffs (OPUS-B)
import { clamp, emit, setting } from './util.js';

export const BASE_HP = 12, MAX_HP_CAP = 32, BASE_STAMINA = 100;

export function createVitals(ctx, G) {
  let lastSig = '';
  let regenT = 0, stillT = 0;

  const v = {
    hp: BASE_HP, maxHp: BASE_HP, stamina: 0, maxStamina: BASE_STAMINA,
    tier: 0, speedMul: 1, damageMul: 1, invulnerable: false,
    invulnT: 0, god: false, frostT: 0, blessT: 0, dead: false,

    damage(amount, info = {}) {
      if (v.dead || !(amount > 0)) return 0;
      if (v.god || v.invulnT > 0) return 0;
      let a = amount;
      if (v.blessT > 0) a = Math.max(1, Math.ceil(a / 2));
      a = Math.min(a, v.hp);
      v.hp -= a;
      v.invulnT = 1.0;
      v.invulnerable = true;
      const dir = info.dir || null;
      emit(ctx, 'player:damage', { amount: a, hp: v.hp, source: info.source || 'enemy', type: info.type || 'hit', dir, enemyId: info.enemyId ?? null });
      // knockback ≤ 0.5 m in total (the player caps it); the setting turns it off
      if (dir && setting(ctx, 'knockback', true) && ctx.player && typeof ctx.player.addImpulse === 'function') {
        const k = info.knock ?? 2.2;
        const l = Math.hypot(dir.x, dir.z) || 1;
        try { ctx.player.addImpulse(dir.x / l * k, dir.z / l * k); } catch (e) { /* ignore */ }
      }
      if (v.hp <= 0) { v.hp = 0; G.die && G.die(info); }
      sig();
      return a;
    },
    heal(n) {
      if (v.dead) return 0;
      const before = v.hp;
      v.hp = clamp(v.hp + (n === 'full' ? v.maxHp : n), 0, v.maxHp);
      const d = v.hp - before;
      if (d > 0) emit(ctx, 'player:heal', { amount: d, hp: v.hp });
      sig();
      return d;
    },
    addStamina(n) {
      if (n === 'full') v.stamina = v.maxStamina;
      else v.stamina = clamp(v.stamina + n, 0, v.maxStamina);
      tier();
    },
    spendStamina(n) {
      if (v.stamina + 1e-6 < n) return false;
      v.stamina = Math.max(0, v.stamina - n);
      tier();
      return true;
    },
    /** recompute caps from pearls (max HP +1 heart each) and seeds (+10 stamina per 4) */
    refreshCaps() {
      const inv = G.inventory;
      const pearls = inv ? inv.count('pearl') : 0;
      const seeds = G.quest ? G.quest.seeds.length : 0;
      const newMax = clamp(BASE_HP + 4 * pearls, BASE_HP, MAX_HP_CAP);
      if (newMax > v.maxHp) v.hp += newMax - v.maxHp;   // a new heart arrives full
      v.maxHp = newMax;
      v.hp = Math.min(v.hp, v.maxHp);
      v.maxStamina = BASE_STAMINA + 10 * Math.min(6, Math.floor(seeds / 4));
      v.stamina = Math.min(v.stamina, v.maxStamina);
      tier();
      sig();
    },
    reviveFull() { v.dead = false; v.hp = v.maxHp; v.invulnT = 2.0; sig(); },
    /** stats-free per-frame logic */
    update(dt) {
      if (dt <= 0) { sig(); return; }
      if (v.invulnT > 0) { v.invulnT -= dt; v.invulnerable = v.invulnT > 0 || v.god; } else v.invulnerable = v.god;
      if (v.frostT > 0) v.frostT -= dt;
      if (v.blessT > 0) v.blessT -= dt;
      const pl = ctx.player;
      // gliding costs 4/s (§2.4); standing still more than 4 s costs 2/s unless frostberry
      if (pl && pl.gliding) v.stamina = Math.max(0, v.stamina - 4 * dt);
      const moving = !!(pl && (pl.moving || pl.speed > 0.3));
      stillT = moving ? 0 : stillT + dt;
      if (stillT > 4 && v.frostT <= 0 && !(pl && pl.gliding)) v.stamina = Math.max(0, v.stamina - 2 * dt);
      tier();
      // tailwind II: +1 HP every 10 s
      if (v.tier >= 2 && !v.dead) {
        regenT += dt;
        if (regenT >= 10) { regenT = 0; if (v.hp < v.maxHp) v.heal(1); }
      } else regenT = 0;
      sig();
    },
  };

  function tier() {
    const t = v.stamina >= 100 - 1e-6 ? 2 : v.stamina >= 50 ? 1 : 0;
    v.tier = t;
    v.speedMul = t === 2 ? 1.15 : t === 1 ? 1.08 : 1.0;
    // on a tower lift your steps raise the platform instead of walking you off it (§8.2)
    if (G.towers && G.towers.liftLock) v.speedMul = 0.001;
    // the still field of the Stillheart: the wind is gone, you run in place to peel its shell (§5.5)
    if (G.boss && G.boss.active && G.boss.phase === 2) v.speedMul = 0.001;
    v.damageMul = t === 2 ? 1.25 : 1.0;
  }
  function sig() {
    const s = `${v.hp}|${v.maxHp}|${Math.round(v.stamina)}|${v.maxStamina}|${v.tier}`;
    if (s === lastSig) return;
    lastSig = s;
    emit(ctx, 'vitals', { hp: v.hp, maxHp: v.maxHp, stamina: v.stamina, maxStamina: v.maxStamina, tier: v.tier });
  }

  // tailwind from real steps (§2.4): walk +0.4 / jog +1.0 / sprint +1.5
  ctx.events?.on?.('step', (e) => {
    if (v.dead) return;
    const c = (e && e.cadence) || (ctx.player && ctx.player.cadence) || 0;
    const g = ctx.player && ctx.player.gait;
    const add = (g === 'sprint' || c >= 160) ? 1.5 : (g === 'jog' || c >= 110) ? 1.0 : 0.4;
    v.addStamina(add);
  });
  ctx.events?.on?.('player:dodge', () => v.addStamina(8));
  ctx.events?.on?.('block', (e) => { if (e && e.parry) v.addStamina(10); });

  tier();
  return v;
}
