// Collection bonuses are resolved from shared, trusted definitions. A single persistent buff contains the
// collection modifiers, so death, redeployment and re-installation never multiply the same bonuses.
import { getRelic, relicModifiers } from '../../../shared/relics.js';
import { passiveBuff, playerOps, onField, inRange } from './support/index.js';
import { RESIST_STATUSES } from '../buffs.js';

const KEY = 'relic:collection';
const healingHandInstalled = new WeakSet();
const fertilizerInstalled = new WeakSet();
const skillEndSpInstalled = new WeakSet();
const poisonDaggerInstalled = new WeakSet();

function installPoisonDagger(battle, owners) {
  if (!owners.size || poisonDaggerInstalled.has(battle)) return;
  poisonDaggerInstalled.add(battle);
  let seq = 0;
  battle.on('death', ({ unit }) => {
    for (const buff of unit.buffs.slice()) if (buff.tags.includes('relic:240')) battle.removeBuff(unit, buff);
  });
  battle.on('damageConvert', (ctx) => {
    const { source, target, dmg } = ctx;
    if (ctx.cancel || source?.kind !== 'op' || !owners.has(source.ownerId) || target.side !== 'enemy') return;
    // Weakness-damage hooks can turn an Arts tick back into Physical. Keep the converted tick Arts,
    // rather than splitting it into five new poison layers every second.
    if (dmg.tags.includes('relic:240')) { dmg.type = 'arts'; return; }
    if (dmg.type !== 'phys' || !(dmg.amount > 0)) return;
    // Physical boosts are captured once, before DEF. Each delayed arts instance then uses live RES,
    // arts/general multipliers and shields. A missed/cancelled hit never reaches this hook.
    const amount = dmg.amount * source.s.physDealtMul / 5;
    const { mul, resIgnorePct, resIgnoreFlat } = dmg;
    const tags = [...dmg.tags, 'dot', 'relic:240'];
    let remaining = 5;
    let nextAt = battle.time + 1;
    battle.addBuff(target, {
      key: `relic:240:${++seq}`, source, duration: Infinity, tags: ['relic:240'],
      onTick: ({ buff }) => {
        // Scheduled skills can hit before this frame's buff pass; wait a full second from the actual hit.
        if (battle.time + 1e-9 < nextAt) return;
        nextAt += 1;
        battle.dealDamage(source, target, {
          amount, type: 'arts', mul, resIgnorePct, resIgnoreFlat,
          canDodge: false, ignoreSelect: true, tags,
        });
        if (--remaining === 0) battle.removeBuff(target, buff);
      },
    });
    ctx.cancel = true;
  });
}

function installSkillEndSp(battle, byPlayer) {
  const refunds = new Map();
  for (const [pid, ids] of byPlayer) {
    const amount = ids.reduce((sum, id) => sum + (getRelic(id).skillEndSp ?? 0), 0);
    if (amount > 0) refunds.set(pid, amount);
  }
  if (!refunds.size || skillEndSpInstalled.has(battle)) return;
  skillEndSpInstalled.add(battle);
  // PRTS No.139/140: forced SP recovery bypasses 阻回, retaining the runtime's charge/cost caps.
  // [ASSUMED] Only a living, deployed operator receives the refund; death/retreat is not a completed cast.
  battle.on('skillEnd', ({ unit: u, skill, reason }) => {
    const amount = refunds.get(u?.ownerId);
    if (!amount || u?.kind !== 'op' || !onField(u) || u.removed || reason === 'death') return;
    skill.gainSp(amount, 'relic', false, { ignoreLock: true });
  });
}

function installFertilizer(battle, owners) {
  if (!owners.size || fertilizerInstalled.has(battle)) return;
  fertilizerInstalled.add(battle);
  // One proc per completed attack action (including healing attacks), never per target or hit.
  // [ASSUMED] Follow the engine's attack event, after the attack resolves; direct skill damage is not an attack.
  battle.on('attack', ({ attacker: u }) => {
    if (u?.kind !== 'op' || !onField(u) || u.removed || !owners.has(u.ownerId)) return;
    battle.loseHp(u, Math.min(50, Math.max(0, u.hp - 1)), { tags: ['relic:125'] });
    if (!onField(u) || u.removed) return;
    const key = 'relic:125:barrier';
    const cap = u.s.maxHp * 1.4;
    const shield = Math.min(cap, (u.findBuff(key)?.shield ?? 0) + 100);
    battle.addBuff(u, { key, shield, duration: Infinity });
  });
}
// [ASSUMED] Use the engine's control-status catalogue plus stack-based palsy. Attribute debuffs,
// elemental buildup and HP loss are not abnormal statuses. PRTS 护愈之手 (No.172), adapted by maintainer:
// every MEDIC, no prerequisite relic; both benefits apply to the owner's operators inside a medic's range.
const HAND_ABNORMAL = new Set([...RESIST_STATUSES, 'palsy']);

function installHealingHand(battle, owners) {
  if (!owners.size || healingHandInstalled.has(battle)) return;
  healingHandInstalled.add(battle);
  const covered = (target) => target?.kind === 'op' && onField(target) && !target.removed && owners.has(target.ownerId)
    && battle.allyUnits.some((u) => u.kind === 'op' && u.ownerId === target.ownerId && u.def?.profession === 'MEDIC'
      && onField(u) && !u.removed && inRange(u, target));
  battle.on('beforeStatus', (ctx) => {
    if (HAND_ABNORMAL.has(ctx.status) && covered(ctx.target)) ctx.cancel = true;
  });
  // [ASSUMED] Existing control statuses are removed when entering coverage. Passive coverage survives
  // a medic's inability to act; range, death and redeployment are checked live, without lingering aura buffs.
  const cleanse = () => {
    for (const u of battle.allyUnits) {
      if (!covered(u)) continue;
      for (const buff of u.buffs.slice()) if (HAND_ABNORMAL.has(buff.status)) battle.removeStatus(u, buff.status);
    }
  };
  battle.on('tick', cleanse);
  battle.on('deploy', cleanse);
  // Maintainer adaptation: full-HP operators can be healed to build the barrier. Stop selecting them at the cap;
  // the query's existing HP-ratio ordering still puts injured allies first.
  battle.on('healTarget', (ctx) => {
    const a = ctx.target;
    if (!a.s.flags.noHeal && !a.profile?.noHeal && covered(a)
      && (a.findBuff('overheal')?.shield ?? 0) < a.s.maxHp) ctx.eligible = true;
  });
  battle.on('heal', ({ target, opts }) => {
    // Regeneration is not a healing action; blocked heals never reach this hook.
    if (!opts.regen && covered(target)) opts.overheal = true;
  });
}

export function install(battle) {
  const byPlayer = new Map();
  for (const ps of battle.players) {
    const input = ps.input?.relics;
    const ids = Array.isArray(input) ? [...new Set(input.filter((id) => typeof id === 'string' && getRelic(id)))] : [];
    if (ids.length) byPlayer.set(ps.playerId, ids);
  }
  if (!byPlayer.size) return;
  installHealingHand(battle, new Set([...byPlayer].filter(([, ids]) => ids.includes('relic_172')).map(([pid]) => pid)));
  installFertilizer(battle, new Set([...byPlayer].filter(([, ids]) => ids.includes('relic_125')).map(([pid]) => pid)));
  installSkillEndSp(battle, byPlayer);
  installPoisonDagger(battle, new Set([...byPlayer].filter(([, ids]) => ids.includes('relic_240')).map(([pid]) => pid)));

  const apply = (unit) => {
    if (!unit || unit.kind !== 'op') return;
    const ids = byPlayer.get(unit.ownerId);
    if (!ids) return;
    const mods = relicModifiers(ids, unit.def?.profession, unit.def?.position);
    if (Object.keys(mods).length) passiveBuff(battle, unit, KEY, mods);
  };

  // Before the first deployment: HP bonuses are already included in its full-health / carry-ratio state.
  for (const pid of byPlayer.keys()) for (const unit of playerOps(battle, pid)) apply(unit);
  // Covers future operators too; the same key replaces the passive instead of stacking it on redeploy.
  battle.on('deploy', ({ unit }) => apply(unit));
}
