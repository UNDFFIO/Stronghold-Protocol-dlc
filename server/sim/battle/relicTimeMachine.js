import { getRelic } from '../../../shared/relics.js';

const routes = new WeakMap();
const uses = new WeakMap();
const returned = new WeakSet();
const limitFor = (player) => Math.max(0, ...(player?.input?.relics ?? []).map(r => getRelic(typeof r === 'string' ? r : r.id)?.returnEnemies ?? 0));

export function rememberTimeMachineRoute(battle, enemy, start) {
  if (!battle.players.some(p => limitFor(p) > 0)) return;
  // [ASSUMED] Summons use the red gate nearest their route's original start, not their mid-field spawn point.
  const gates = battle.grid.specialTiles('start');
  const distance = ([r, c]) => { const dr = r - start[0], dc = c - start[1]; return dr * dr + dc * dc; };
  const gate = gates.reduce((best, p) => !best || distance(p) < distance(best) ? p : best, null);
  // Boss arenas have portal exits instead of red tiles: use the original route entry there.
  routes.set(enemy, { gate: gate ?? [...start], legs: enemy.route.legs.map(leg => ({ ...leg })) });
}

export function returnTimeMachineEnemy(battle, enemy) {
  const saved = routes.get(enemy);
  if (!saved || returned.has(enemy)) return false;
  // Same ownership as actual door leaks; Unite sourcePlayerId is not the defending player.
  const owner = battle._ownerForTile([Math.round(enemy.y), Math.round(enemy.x)]) ?? enemy.ownerId;
  const player = battle.getPlayer(owner) ?? battle.getPlayer(enemy.ownerId);
  const limit = limitFor(player);
  const counts = uses.get(battle) ?? new Map();
  const count = counts.get(player) ?? 0;
  if (count >= limit) return false;
  uses.set(battle, counts);
  counts.set(player, count + 1);
  returned.add(enemy);
  const fromX = enemy.x, fromY = enemy.y;
  battle._unblock(enemy);
  battle._cutAttackStand(enemy);
  enemy.x = saved.gate[1]; enemy.y = saved.gate[0];
  enemy.route = { legs: saved.legs.map(leg => ({ ...leg })), legIdx: 0, pts: null, ptIdx: 0,
    suffix: null, version: -1, waitLeft: null };
  enemy.moving = false;
  enemy.unbalanceUntil = -Infinity;
  battle.fx('teleport', { id: enemy.id, x: enemy.x, y: enemy.y, kind: 'timeMachine', fromX, fromY });
  return true;
}
