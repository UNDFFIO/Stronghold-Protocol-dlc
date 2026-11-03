// 狮心王 — maintainer-defined DLC traits (2026-11-02; the 王威 range slow added 2026-11-03), not an official Golden Vow mechanic.
import { LIONHEART_ID } from '../../../../../shared/specialOperators.js';
import { bodyInRange } from '../../../body.js';
import { bondLayers, unitBonds } from '../../support/index.js';

const DRAIN = 'lionheart:block-drain';
const GAIN = 'lionheart:block-gain';
const RECOVERY = 'lionheart:recovery';
const VICTORIA_STATS = 'lionheart:victoria-stats';
const SLOW = 'lionheart:slow';
const SLOW_EVERY = 0.2;   // 王威 aura refresh period (s)
const SLOW_FOR = 0.3;     // aura buff lifetime (s): the slow lapses shortly after the king stops covering the enemy
const CONTROL = [
  { key: 'stun', duration: 0.6 }, { key: 'cold', duration: 2 },
  { key: 'bind', duration: 0.7 }, { key: 'sluggish', duration: 1 },
  { key: 'silence', duration: 10 }, { key: 'palsy', value: 1 },
];
const STATES = new WeakMap();
const present = (u) => u.alive && u.deployed && !u.removed;
const awake = (u) => present(u) && !u.mem.lionheartRecovering;

/** One coordinator per field: allied ranged operators lose their capacity only once, even with multiple kings. */
function fieldState(battle) {
  if (STATES.has(battle)) return STATES.get(battle);
  const kings = new Set(), drained = new Set();
  const refresh = () => {
    const holders = [...kings].filter(present);
    let total = 0;
    for (const a of battle.allyUnits) {
      if (!holders.length || !present(a) || a.kind !== 'op' || a.def.position !== 'RANGED') {
        if (drained.delete(a)) battle.removeBuff(a, DRAIN);
        continue;
      }
      if (!a.findBuff(DRAIN)) battle.addBuff(a, { key: DRAIN, flags: { blockCntZero: true, noBlock: true } });
      drained.add(a);
      total += a.s.blockCntBeforeSuppression;
      battle.releaseBlocked(a);
    }
    // [ASSUMED] Multiple kings share one removed capacity pool; the first active deployment receives it.
    const receiver = holders.find(awake);
    for (const u of kings) {
      // Each of the owner's Victoria layers adds one percentage point, alongside other additive stat bonuses.
      // The king's own effects pause during recovery; restore the latest layer bonus before the full-HP revival.
      const bonus = awake(u) ? bondLayers(battle, u.ownerId, 'victoriaShip') * 0.01 : 0;
      const stats = u.findBuff(VICTORIA_STATS);
      if (bonus > 0) {
        if (stats?.mods?.hpPct !== bonus) battle.addBuff(u, { key: VICTORIA_STATS, mods: { hpPct: bonus, defPct: bonus } });
      } else if (stats) battle.removeBuff(u, VICTORIA_STATS);
      const amount = u === receiver ? total : 0;
      if (u.findBuff(GAIN)?.mods?.blockCnt === amount) continue;
      battle.removeBuff(u, GAIN);
      if (amount) battle.addBuff(u, { key: GAIN, mods: { blockCnt: amount } });
    }
  };
  const state = { kings, refresh };
  STATES.set(battle, state);
  battle.on('battleStart', refresh);
  battle.on('deploy', refresh, { priority: -100 });
  battle.on('death', refresh, { priority: -100 });
  battle.on('tick', refresh, { priority: 100 });
  let layersPending = false;
  battle.on('layerGain', (c) => {
    if (c.bondId !== 'victoriaShip' || layersPending || ![...kings].some((u) => u.ownerId === c.playerId)) return;
    layersPending = true;
    // The layerGain hook precedes the actual write; read committed layers at the next tick's start.
    battle.after(0, () => { layersPending = false; refresh(); });
  }, { priority: -100 });
  return state;
}

export default {
  [LIONHEART_ID]: () => ({
    install(battle, unit) {
      const state = fieldState(battle);
      state.kings.add(unit);
      // No direct healing (including self-heals); explicit HP restoration below bypasses the heal pipeline.
      unit.profile.noHeal = true;
      battle.addBuff(unit, { key: 'lionheart:unhealable', flags: { noHeal: true, healFree: true }, persist: true, allowDead: true });
      battle.on('hpChanged', (c) => {
        if (c.kind !== 'heal' || !(c.amount > 0) || !awake(unit) || c.target === unit ||
          c.target.side !== 'ally' || c.target.kind !== 'op' || !unitBonds(c.target).includes('victoriaShip')) return;
        battle.heal({ source: unit, target: unit, amount: c.amount * 0.5, mode: 'restore' });
      }, { owner: unit });

      let recovery = 0;
      battle.on('death', (c) => {
        if (c.unit !== unit) return;
        ++recovery;
        unit.mem.lionheartRecovering = false;
        battle.removeBuff(unit, RECOVERY);
      }, { owner: unit });
      battle.on('fatal', (c) => {
        if (c.unit !== unit || !present(unit)) return;
        c.prevented = true;
        if (unit.mem.lionheartRecovering) return;
        unit.mem.lionheartRecovering = true;
        const seq = ++recovery;
        battle.addBuff(unit, {
          // [ASSUMED] Lower targeting priority uses the usual one-level taunt reduction.
          key: RECOVERY, mods: { taunt: -1 },
          flags: { invulnerable: true, disarm: true, noBlock: true, blockCntZero: true, noSp: true },
          visible: true,
        });
        battle.releaseBlocked(unit);
        state.refresh();
        battle.after(25, () => {
          if (seq !== recovery || !present(unit)) return;
          unit.mem.lionheartRecovering = false;
          battle.removeBuff(unit, RECOVERY);
          state.refresh();
          battle.heal({ source: unit, target: unit, amount: unit.s.maxHp, mode: 'restore' });
          battle.fx('revive', { id: unit.id, x: unit.x, y: unit.y });
        }, { owner: unit });
      }, { owner: unit, priority: 100 });

      // 王威: with the owner's six-member Victoria bond active, enemies inside the range move 30 % slower. A short pulsed
      // buff, like the other range slows of this engine, so leaving the range or the king's recovery ends it shortly after
      // the last pulse; every Lionheart refreshes the same key, so two kings never stack. [ASSUMED] The reduction is one
      // more `moveMul` factor beside the other speed modifiers (停顿 and friends still multiply).
      battle.every(SLOW_EVERY, () => {
        if (!awake(unit)) return;
        const bond = battle.getPlayer(unit.ownerId)?.bonds?.victoriaShip;
        if (!bond?.active || (bond.count ?? 0) < 6) return;
        for (const e of battle.enemies) {
          // 诱导中的敌人不受此效果影响 (the engine walks an attracted enemy at its own speed).
          if (!present(e) || e.hidden || e.findBuff('attract') || !bodyInRange(e, unit.rangeKeySet)) continue;
          battle.addBuff(e, {
            key: SLOW, duration: SLOW_FOR, mods: { moveMul: 0.7 }, status: 'slow', visible: true,
            source: unit, tags: ['talent'],
          });
        }
      }, { owner: unit, immediate: true });

      // 诱导中的敌人不受王威减速影响: drop the shared slow the moment an attract lands, not a tick later.
      battle.on('statusApplied', (c) => {
        if (c.status === 'attract' && c.target?.side === 'enemy' && c.target.findBuff(SLOW)) battle.removeBuff(c.target, SLOW);
      }, { owner: unit });

      // [ASSUMED] Each enemy rolls independently after each full second continuously inside the range.
      // Existing statuses retain their remaining duration while the king recovers; no new control is applied.
      const inside = new Map(), lured = new Set();
      battle.on('tick', ({ dt }) => {
        if (!awake(unit)) { inside.clear(); return; }
        const seen = new Set();
        const bond = battle.getPlayer(unit.ownerId)?.bonds?.victoriaShip;
        for (const e of battle.enemies) {
          if (!present(e) || e.hidden) continue;
          if (!bodyInRange(e, unit.rangeKeySet)) continue;
          seen.add(e);
          const elapsed = (inside.get(e) ?? 0) + dt;
          if (elapsed + 1e-9 >= 1) {
            const effect = CONTROL[battle.rng.int(CONTROL.length)];
            battle.applyStatus(e, effect.key, { ...effect, source: unit });
            inside.set(e, elapsed - 1);
          } else inside.set(e, elapsed);
        }
        for (const e of inside.keys()) if (!seen.has(e)) {
          // The range-exit lure lands once per enemy per battle; re-entering the range does not refresh it.
          if (!lured.has(e) && present(e) && !e.hidden && bond?.active && bond.count >= 6) {
            lured.add(e);
            battle.applyStatus(e, 'attract', { duration: 10, source: unit, point: [unit.tileR, unit.tileC] });
          }
          inside.delete(e);
        }
      }, { owner: unit });
    },
  }),
};
