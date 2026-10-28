import { createRng, deriveSeed } from '../sim/rng.js';
import { isFlyKey, routeByMotion, gateOf } from './waves.js';

/** Select one extra enemy outside every original match faction (including SPECIAL) and keep it for this match.
 * The independent seed makes scouting/rehearsal/reconstruction pure, with no shop or wave RNG consumption. */
export function roadEnemyKey(m, ps) {
  const originalTypes = new Set([...m.factions, 'SPECIAL', m.gd.factions.generation?.fillType].filter(Boolean));
  const entries = Object.values(m.gd.factions.entries || {});
  const original = new Set(entries.filter((e) => originalTypes.has(e.type)).flatMap((e) =>
    [e.key, ...(e.N || []), ...(e.E || [])].map((k) => typeof k === 'string' ? k : k?.key)));
  const candidates = [...new Set(entries.filter((e) => !originalTypes.has(e.type)).map((e) => e.key))]
    .filter((key) => key !== 'enemy_9012_acloon' && !original.has(key) && !m.gd.inactiveEnemies.has(key) && m.gd.enemy(key)).sort();
  if (!candidates.length) return null;
  const rng = createRng(deriveSeed(m.seed, `relic-road:${ps.seat}`));
  return candidates[rng.int(candidates.length)];
}

/** Only this owner's original scheduled wave contributes to the extra count; no copied bounties/boss tags.
 * [ASSUMED] Round odd totals upward; shared boss fields use the holder's half, never the teammate's half. */
export function withRoadEnemies(m, ps, spawns, routes, { side = null, baseSpawns = spawns } = {}) {
  if (!ps.relics.some((r) => r.id === 'relic_228')) return spawns;
  const enemyKey = roadEnemyKey(m, ps);
  if (!enemyKey || !routes.length) return spawns;
  const own = baseSpawns.filter((s) => !s.bounty && (side == null || (side === 'R'
    ? routes[s.routeIndex ?? 0]?.end?.[1] > 10 : routes[s.routeIndex ?? 0]?.end?.[1] < 10)));
  const count = Math.ceil(own.reduce((n, s) => n + Math.max(1, Math.trunc(s.count || 1)), 0) / 2);
  if (!count) return spawns;
  const fly = isFlyKey(m.gd, enemyKey);
  const routeIndex = routeByMotion(routes, fly, side);
  const route = routes[routeIndex];
  if (!route) return spawns;
  const first = Math.min(...own.map((s) => s.time || 0));
  const last = Math.max(...own.map((s) => (s.time || 0) + (Math.max(1, s.count || 1) - 1) * (s.interval || 0)));
  // One action per extra avoids the engine's per-action unit cap on long waves.
  const extra = Array.from({ length: count }, (_, i) => ({
    time: first + (last - first) * (i + 1) / (count + 1), enemyKey, routeIndex, count: 1, interval: 0,
    ownerPlayerId: ps.playerId, mods: { ...m.gd.enemyScale(m.round), slot: fly ? 'SF' : 'S' },
    preview: { gate: gateOf(route.start), start: route.start, fly, elite: true, boss: false },
  }));
  return [...spawns, ...extra];
}
