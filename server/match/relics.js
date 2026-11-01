import { getRelic, pickRelicChoices, canReceiveRelic, RELIC_TIERS, RELICS } from '../../shared/relics.js';
import { issueScratchTicket } from './scratchTickets.js';
import { normalizeDifficultyLevel } from '../../shared/difficulty.js';
import { createRng, deriveSeed } from '../sim/rng.js';
import { msg, dn } from '../../shared/i18n.js';
import { computeBonds } from './bondsMeta.js';

/** Maintainer adaptation: settlement only, independent of the ordinary low-loss reward. */
export function settleEgirRelic(ps, result) {
  if (!ps.alive || ps.left || ps.lp <= 0 || !result || result.synthetic
    || typeof result.perfect !== 'boolean' || !Array.isArray(result.leaked)) return null;
  const bond = computeBonds(ps.gd, ps).egirShip;
  if (!bond?.active) return null;
  const stage = bond.layers >= 600 ? 3 : bond.layers >= 250 ? 2 : bond.layers >= 100 ? 1 : 0;
  const owned = Math.max(0, ...ps.relics.map((r) => getRelic(r.id)?.egirStage || 0));
  if (stage <= owned) return null;
  const reward = grantRelic(ps, `relic_${243 + stage}`, { egirEvolution: true });
  if (reward) ps.relics = ps.relics.filter((r) => !getRelic(r.id)?.egirStage || r.id === reward.id);
  return reward;
}

/** Process a completed battle once using the actual LP charged at settlement. */
export function settleRelics(ps, result, { completed = false, lpLoss = 0 } = {}) {
  const round = ps.m.round;
  if (!completed || !ps.alive || ps.left || !result || result.synthetic
    || typeof result.perfect !== 'boolean' || !Array.isArray(result.leaked)
    || !Number.isFinite(lpLoss)
    || ps.relicSettledRounds.has(round)) return null;
  ps.relicSettledRounds.add(round);
  settleEgirRelic(ps, result);
  if (lpLoss > 5 || ps.relicOffer) return null;
  const rng = createRng(deriveSeed(ps.m.seed, `relic-choice:${ps.seat}:${round}`));
  const leaked = result.leaked.some((l) => l && l.counted !== false);
  const count = 3 + [...new Set(ps.relics.map((r) => r.id))].reduce((sum, id) => sum + (getRelic(id)?.battleChoiceBonus || 0), 0);
  const options = pickRelicChoices(round, ps.relics, rng, { count, leaked, multiplayer: !ps.m.isSolo,
    hasScratchTicket: ps.scratchTickets.length > 0, bonds: ps.bonds, recollectionRemovedRelics: ps.recollectionRemovedRelics, extraRound: ps.m.gd.endlessRound(round) });
  if (!options.length) return null;
  ps.relicOffer = { id: `relic:${ps.seat}:${round}`, round, reason: 'lowLoss', leaked, options };
  ps.dirty();
  return ps.relicOffer;
}

/** Server-owned offer identity and index prevent stale, duplicate or forged choices. */
export function selectRelic(ps, offerId, idx) {
  const offer = ps.relicOffer;
  if (!ps.alive || ps.left || !offer || offer.id !== offerId || offer.round !== ps.m.round
    || !Number.isInteger(idx) || idx < 0 || idx >= offer.options.length) return null;
  const r = getRelic(offer.options[idx]);
  if (r?.normalDrop === false) return null;
  if (!canReceiveRelic(r, ps.relics, { hasScratchTicket: ps.scratchTickets.length > 0, bonds: ps.bonds,
    recollectionRemovedRelics: ps.recollectionRemovedRelics, extraRound: ps.m.gd.endlessRound(ps.m.round) }) || (r.multiplayerOnly && ps.m.isSolo)) return null;
  ps.relicOffer = null;
  return grantRelic(ps, r.id, { round: offer.round });
}

/** Extra-challenge curses use an independent stream and the normal acquisition hooks. */
export function grantNegativeRelics(ps, count) {
  const round = ps.m.round;
  const rng = createRng(deriveSeed(ps.m.seed, `endless-curses:${ps.seat}:${round}`));
  const granted = [];
  for (let i = 0; i < count; i++) {
    // Recheck ownership after acquisition hooks, but never repeat within this award.
    const pool = RELICS.filter(r => r.tier === 6 && !granted.includes(r.id)
      && canReceiveRelic(r, ps.relics, { bonds: ps.bonds, recollectionRemovedRelics: ps.recollectionRemovedRelics, extraRound: ps.m.gd.endlessRound(round) })
      && (!r.multiplayerOnly || !ps.m.isSolo));
    if (!pool.length) break;
    const reward = grantRelic(ps, pool[rng.int(pool.length)].id);
    if (!reward) break;
    granted.push(reward.id);
  }
  return granted;
}

/** Shared acquisition path for choices and immediate grants; preserves one-time collectible effects. */
export function grantRelic(ps, id, { round = ps.m.round, egirEvolution = false } = {}) {
  const r = getRelic(id);
  if (r?.egirStage && !egirEvolution) return null;
  if (r?.deathNote && ps.m.order.some((p) => p !== ps && p.relics.some((entry) => entry.id === id))) return null;
  if (!ps.alive || ps.left || !canReceiveRelic(r, ps.relics, { bonds: ps.bonds, recollectionRemovedRelics: ps.recollectionRemovedRelics, extraRound: ps.m.gd.endlessRound(ps.m.round) })
    || (r.multiplayerOnly && ps.m.isSolo)) return null;
  const reward = { id: r.id, round };
  if (!ps.relics.some((o) => o.id === id)) ps.relics.push(reward);
  if (r.scratchTicket) issueScratchTicket(ps, r, round);
  if (r.healLpOnAcquire) {
    // Keep the owner's healed share through later boss-pool synchronization.
    if (ps.m.teamLp != null) ps.m._syncTeamLp();
    ps.lp += r.healLpOnAcquire;
    if (ps.m.teamLp != null) ps.m._openTeamLp();
    ps.m.markPublic();
  }
  // 合法领取时一次性降低全队等级；既有战斗保留原规则，后续所有阵地共用新等级。
  if (r.difficultyReduction) {
    const reduction = ps.m.isSolo ? (r.soloDifficultyReduction ?? r.difficultyReduction) : r.difficultyReduction;
    ps.m.difficultyLevel = normalizeDifficultyLevel(ps.m.difficultyLevel - reduction);
    ps.m.markPublic();
  }
  if (r.loseReserves) loseRelicReserves(ps, r.id, round);
  if (r.deployCapPenalty) ps.recompute();
  ps.relicReward = reward;
  ps.dirty();
  if (r.reverseText) ps.m.markPublic();
  const tier = RELIC_TIERS[r.tier - 1];
  ps.m.toast(ps, 'success', msg('获得{tier}收藏品「{name}」', { tier: dn(tier.name), name: dn(r.name) }));
  return reward;
}

/** [ASSUMED] Reserve includes hand and temporary overflow, with equipped items; deployed pieces stay.
 * Negative collectibles are excluded from the seven random losses. No sale payouts or refunds. */
function loseRelicReserves(ps, acquiredId, round) {
  for (const slots of [ps.hand, ps.temp]) for (let i = 0; i < slots.length; i++) {
    const p = slots[i];
    if (!p || !['chess', 'item'].includes(p.kind)) continue;
    if (p.kind === 'chess') {
      ps.returnCopies(p); ps.removeTokensOf(p.uid);
      for (const item of p.items || []) ps.releaseItemStock(item);
      p.items = [];
    } else ps.releaseItemStock(p);
    ps._tempDue.delete(p.uid);
    slots[i] = null;
  }
  const rng = createRng(deriveSeed(ps.m.seed, `relic-reserves:${ps.seat}:${round}`));
  const candidates = ps.relics.filter((r) => r.id !== acquiredId && getRelic(r.id)?.tier !== 6);
  rng.shuffle(candidates);
  const removed = new Set(candidates.slice(0, 7));
  const ids = new Set([...removed].map((r) => r.id));
  for (const id of ids) {
    const tier = getRelic(id)?.tier;
    if (tier === 4 || tier === 5) ps.recollectionRemovedRelics.add(id);
  }
  ps.relics = ps.relics.filter((r) => !removed.has(r));
  ps.scratchTickets = ps.scratchTickets.filter((ticket) => !ids.has(ticket.relicId));
  ps.recompute();
  ps.m.markPublic();
}

export function autoSelectRelic(ps) {
  if (!ps.relicOffer) return;
  let idx = 0;
  if (ps.isBot || ps.autoplay) ps.relicOffer.options.forEach((id, i) => {
    if ((getRelic(id)?.tier || 0) > (getRelic(ps.relicOffer.options[idx])?.tier || 0)) idx = i;
  });
  selectRelic(ps, ps.relicOffer.id, idx);
}

// Compatibility for existing wire consumers: Time Machine no longer reverses LP.
export const activeReverseLp = () => false;
export const previewRelicLpLoss = (ps, amount) => shieldedLpLoss(ps, amount);
export const consumeRelicLpLoss = (ps, amount) => consumeRelicShield(ps, amount);

export const activeRelicShield = (ps) => ps.relicShieldRound === ps.m.round ? Math.max(0, ps.relicShield) : 0;
export const shieldedLpLoss = (ps, amount) => Math.max(0, amount - activeRelicShield(ps));
export function consumeRelicShield(ps, amount) {
  const used = Math.min(Math.max(0, amount), activeRelicShield(ps));
  if (used > 0) { ps.relicShield -= used; ps.dirty(); }
  return Math.max(0, amount - used);
}
export function startRelicRound(ps, round) {
  if (ps.alive && !ps.left && ps.relicRoundStarted !== round) {
    const loss = [...new Set(ps.relics.filter((r) => r.round < round).map((r) => r.id))]
      .reduce((sum, id) => sum + (getRelic(id)?.roundLpLoss || 0), 0);
    if (loss) {
      if (ps.m.teamLp != null) ps.m._syncTeamLp();
      if (ps.lp > 1) ps.lp = Math.max(1, ps.lp - loss);
      if (ps.m.teamLp != null) ps.m._openTeamLp();
      ps.m.markPublic();
    }
    ps.relicRoundStarted = round;
  }
  ps.relicShield = 0;
  ps.relicShieldRound = round;
  ps.relicNextShieldRound = 0;
}

/** 自救与救队友共用持有记录中的一次使用机会，保留图鉴及本局获得记录。 */
export function unusedRevival(ps, id = null) {
  if (!ps.alive || ps.left) return null;
  const used = new Set(ps.relics.filter((r) => r.used).map((r) => r.id));
  return ps.relics.find((r) => (!id || r.id === id) && !used.has(r.id) && getRelic(r.id)?.reviveOnce) || null;
}

export function consumeRevival(ps, targetId, id = null) {
  const record = unusedRevival(ps, id);
  if (!record) return null;
  record.used = true;
  record.usedRound = ps.m.round;
  record.targetId = targetId;
  ps.dirty();
  return getRelic(record.id).reviveOnce;
}

export function reviveSelf(ps) {
  if (ps.lp > 0) return false;
  const effect = consumeRevival(ps, ps.playerId);
  if (!effect) return false;
  ps.lp = effect.lp;
  ps.dirty();
  ps.m.toast(ps, 'success', msg('「时光之末」已自动使用，恢复 {lp} 点目标生命值', { lp: effect.lp }));
  return true;
}

/** 只从被救者当前可招募的盟约中选累计层数最高者；独立随机流不干扰商店。 */
export function revivalOperators(ps, owner, count) {
  const m = ps.m;
  const rng = createRng(deriveSeed(m.seed, `relic-revive:${owner.seat}:${ps.seat}:${m.round}`));
  const eligible = [...m.pool.entries.keys()].filter((id) => m.gd.tierOf(id) <= ps.shop.level);
  const bonds = m.gd.bondIds.filter((bondId) => !m.gd.modeInactiveBonds.has(bondId)
    && eligible.some((id) => m.gd.chess(id).bonds?.includes(bondId)));
  const max = Math.max(0, ...bonds.map((id) => ps.layers[id] || 0));
  let ties = bonds.filter((id) => (ps.layers[id] || 0) === max);
  if (max === 0) {
    const roster = ps.eliminatedRoster?.board || ps.board;
    const represented = ties.filter((id) => [...roster.values()].some((p) => p.kind === 'chess' && m.gd.chess(p.id)?.bonds?.includes(id)));
    if (represented.length) ties = represented;
  }
  const bondId = ties.length ? ties[rng.int(ties.length)] : null;
  const pool = eligible.filter((id) => m.gd.chess(id).bonds?.includes(bondId));
  return { bondId, ids: Array.from({ length: pool.length ? count : 0 }, () => pool[rng.int(pool.length)]) };
}

/** Fresh wire values: UI state and battle inputs must not share mutable references with a player's collection. */
export function relicsView(ps) {
  return ps.relics.filter((r) => getRelic(r.id)).map(({ id, round, used, usedRound, targetId }) => ({
    id, round, ...(used ? { used: true, usedRound, targetId } : {}),
  }));
}
export const relicOfferView = (ps) => ps.relicOffer ? { ...ps.relicOffer, options: [...ps.relicOffer.options] } : null;
