import { getRelic, pickRelicChoices, RELIC_TIERS } from '../../shared/relics.js';
import { normalizeDifficultyLevel } from '../../shared/difficulty.js';
import { createRng, deriveSeed } from '../sim/rng.js';

/** Process the owner's completed battle once; rescue and shields do not erase personal leaks. */
export function settleRelics(ps, result, { completed = false } = {}) {
  const round = ps.m.round;
  if (!completed || !ps.alive || ps.left || !result || result.synthetic
    || typeof result.perfect !== 'boolean' || !Array.isArray(result.leaked)
    || ps.relicSettledRounds.has(round)) return null;
  ps.relicSettledRounds.add(round);
  if (ps.relicLastRound !== round - 1) ps.relicLeakStreak = 0;
  ps.relicLastRound = round;
  const leaked = result.leaked.some((l) => l && l.counted !== false);
  ps.relicLeakStreak = leaked ? ps.relicLeakStreak + 1 : 0;
  const comeback = ps.relicLeakStreak >= 3;
  if (comeback) {
    ps.relicLeakStreak = 0;
    ps.relicNextShieldRound = round + 1;
  }
  ps.dirty();
  if ((!comeback && (leaked || !result.perfect)) || ps.relicOffer) return null;
  const rng = createRng(deriveSeed(ps.m.seed, `relic-choice:${ps.seat}:${round}`));
  const options = pickRelicChoices(round, ps.relics, rng, { comeback, multiplayer: !ps.m.isSolo });
  if (!options.length) return null;
  ps.relicOffer = { id: `relic:${ps.seat}:${round}`, round, reason: comeback ? 'comeback' : 'perfect', options };
  return ps.relicOffer;
}

/** Server-owned offer identity and index prevent stale, duplicate or forged choices. */
export function selectRelic(ps, offerId, idx) {
  const offer = ps.relicOffer;
  if (!ps.alive || ps.left || !offer || offer.id !== offerId || offer.round !== ps.m.round
    || !Number.isInteger(idx) || idx < 0 || idx >= offer.options.length) return null;
  const r = getRelic(offer.options[idx]);
  if (!r || (r.multiplayerOnly && ps.m.isSolo) || ps.relics.some((o) => o.id === r.id)) return null;
  const reward = { id: r.id, round: offer.round };
  ps.relics.push(reward);
  // 合法领取时一次性降低全队等级；既有战斗保留原规则，后续所有阵地共用新等级。
  if (r.difficultyReduction) {
    ps.m.difficultyLevel = normalizeDifficultyLevel(ps.m.difficultyLevel - r.difficultyReduction);
    ps.m.markPublic();
  }
  if (r.reverseLpOnce) ps.relicReverseLpRound = offer.round + 1;
  ps.relicReward = reward;
  ps.relicOffer = null;
  ps.dirty();
  const tier = RELIC_TIERS[r.tier - 1];
  ps.m.toast(ps, 'success', `获得${tier.name}收藏品「${r.name}」`);
  return reward;
}

export function autoSelectRelic(ps) {
  if (!ps.relicOffer) return;
  let idx = 0;
  if (ps.isBot || ps.autoplay) ps.relicOffer.options.forEach((id, i) => {
    if ((getRelic(id)?.tier || 0) > (getRelic(ps.relicOffer.options[idx])?.tier || 0)) idx = i;
  });
  selectRelic(ps, ps.relicOffer.id, idx);
}

export const activeReverseLp = (ps) => ps.relicReverseLpRound > 0 && ps.relicReverseLpRound === ps.m.round;
/** 时间机器先反转应扣血量，护盾保留；负数表示回血。 */
export const previewRelicLpLoss = (ps, amount) => activeReverseLp(ps) ? -Math.max(0, amount) : shieldedLpLoss(ps, amount);
export const consumeRelicLpLoss = (ps, amount) => activeReverseLp(ps) ? -Math.max(0, amount) : consumeRelicShield(ps, amount);

export const activeRelicShield = (ps) => ps.relicShieldRound === ps.m.round ? Math.max(0, ps.relicShield) : 0;
export const shieldedLpLoss = (ps, amount) => Math.max(0, amount - activeRelicShield(ps));
export function consumeRelicShield(ps, amount) {
  const used = Math.min(Math.max(0, amount), activeRelicShield(ps));
  if (used > 0) { ps.relicShield -= used; ps.dirty(); }
  return Math.max(0, amount - used);
}
export function startRelicRound(ps, round) {
  ps.relicShield = ps.relicNextShieldRound === round ? 2 : 0;
  ps.relicShieldRound = round;
  ps.relicNextShieldRound = 0;
}

/** Fresh wire values: UI state and battle inputs must not share mutable references with a player's collection. */
export function relicsView(ps) {
  return ps.relics.filter((r) => getRelic(r.id)).map(({ id, round }) => ({ id, round }));
}
export const relicOfferView = (ps) => ps.relicOffer ? { ...ps.relicOffer, options: [...ps.relicOffer.options] } : null;
