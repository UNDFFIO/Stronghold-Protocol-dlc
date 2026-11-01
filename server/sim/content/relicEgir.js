import { getRelic } from '../../../shared/relics.js';
import { onField, unitBonds, inRange, passiveBuff } from './support/index.js';

const installed = new WeakSet();
const donors = new Set(['char_1012_skadi2', 'char_437_mizuki']);
const member = (u) => u?.kind === 'op' && unitBonds(u).includes('egirShip');

/** Owner-only cumulative evolution. Shared by server and browser simulators. */
export function installEgirRelics(battle, byPlayer) {
  if (installed.has(battle)) return;
  const stages = new Map([...byPlayer].map(([pid, ids]) => [pid,
    Math.max(0, ...ids.map((id) => getRelic(id)?.egirStage || 0))]).filter(([, stage]) => stage));
  if (!stages.size) return;
  installed.add(battle);
  const apply = (u) => {
    const stage = stages.get(u.ownerId);
    if (!stage || !member(u)) return;
    u.mem.egirHitsAir = true;
    if (stage >= 2) passiveBuff(battle, u, 'relic:egir:block', { blockCnt: 1 });
    if (stage < 3 || u.mem.egirOwnRangeKeys) return;
    // Keep the ordinary range setter: every skill/deployment refresh still updates the native range.
    // Donors contribute native ranges only, so two donors never recursively expand one another.
    let ownKeys = u.rangeKeys || [];
    u.mem.egirOwnRangeKeys = () => ownKeys;
    // Share the live extension with skill activation checks, without changing their native trigger grids.
    u.mem.egirExtraRangeKeys = () => {
      const keys = new Set();
      for (const d of battle.allyUnits) {
        if (d.ownerId !== u.ownerId || d.kind !== 'op' || !onField(d) || d.removed
          || !donors.has(d.def?.charId || d.def?.raw?.charId)) continue;
        for (const k of d.mem.egirOwnRangeKeys ? d.mem.egirOwnRangeKeys() : d.rangeKeys || []) keys.add(k);
      }
      return [...keys];
    };
    Object.defineProperty(u, 'rangeKeys', { configurable: true,
      get() {
        return [...new Set([...ownKeys, ...u.mem.egirExtraRangeKeys()])];
      },
      set(keys) { ownKeys = keys; },
    });
    Object.defineProperty(u, 'rangeKeySet', { configurable: true,
      get() { return new Set(u.rangeKeys); }, set(_keys) {},
    });
  };
  for (const u of battle.allyUnits) apply(u);
  battle.on('deploy', ({ unit }) => apply(unit));
  battle.on('death', ({ unit, killer, reason }) => {
    if (reason !== 'killed' || unit.side !== 'enemy' || !member(killer)
      || !onField(killer) || killer.removed || !(stages.get(killer.ownerId) >= 2)) return;
    // [ASSUMED] Repeated kills refresh the eight-second duration, without stacking attack speed.
    battle.addBuff(killer, { key: 'relic:egir:kill', duration: 8, mods: { aspd: 100 } });
  });
  if (![...stages.values()].includes(3)) return;
  const cap = (enemy) => {
    // Live query: leaving coverage immediately restores other speed modifiers. Slows remain intact.
    enemy.mem.relicMoveCap = () => battle.allyUnits.some((u) => stages.get(u.ownerId) === 3
      && member(u) && onField(u) && !u.removed && inRange(u, enemy)) ? enemy.base.moveSpeed : Infinity;
  };
  for (const e of battle.enemies) cap(e);
  battle.on('enemySpawn', ({ enemy }) => cap(enemy));
}
