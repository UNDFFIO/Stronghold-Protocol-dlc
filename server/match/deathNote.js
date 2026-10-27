// Maintainer-defined DEATH NOTE crossover. Server resolves names; clients send no enemy IDs or effects.
import { readdirSync, readFileSync } from 'node:fs';
import { grantRelic } from './relics.js';

export const DEATH_NOTE_ID = 'relic_241';
export const DEATH_NOTE_COST = 8;
export const deathNoteCost = (ps) => ps.shinigamiEyes ? 4 : DEATH_NOTE_COST;
export const DEATH_NOTE_DEATHS = 50;
const normalize = (name) => String(name).normalize('NFKC').trim();

// Accept the shipped localized names too. Canonical names key these aliases, including other versions/content sets.
const names = [];
const folder = new URL('../../data/i18n/', import.meta.url);
try {
  for (const file of readdirSync(folder).filter((f) => f.endsWith('.json'))) {
    names.push(JSON.parse(readFileSync(new URL(file, folder), 'utf8')).names || {});
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

export function resolveDeathNoteName(m, text) {
  const wanted = normalize(text);
  if (!wanted) return [];
  const matches = (name) => typeof name === 'string' && [name, ...names.map((pack) => pack[name])]
    .some((alias) => typeof alias === 'string' && normalize(alias) === wanted);
  const keys = new Set();
  for (const [key, enemy] of Object.entries(m.gd.raw.enemies || {})) if (matches(enemy.name)) keys.add(key);
  for (const boss of Object.values(m.gd.raw.bosses || {})) if (matches(boss.name) && m.gd.enemy(boss.enemyKey)) keys.add(boss.enemyKey);
  return [...keys].sort();
}

/** All fields freeze this round's written type into their JSON BattleSpec, including runtime summons. */
export function deathNoteKeys(m) {
  return [...new Set(m.order.flatMap((ps) => ps.deathNoteEntry?.round === m.round ? ps.deathNoteEntry.enemyKeys : []))].sort();
}

/** Normal, Unite and boss reports each count once. No synthetic results, teammates, tokens or retreats. */
export function settleDeathNote(ps, result, field) {
  const key = `${ps.m.round}:${field}`;
  if (!result || result.synthetic || ps.deathNoteSettled.has(key)
    || !Number.isSafeInteger(result.deaths) || result.deaths < 0) return;
  ps.deathNoteSettled.add(key);
  ps.deathNoteDeaths += result.deaths;
  if (!ps.deathNoteAwarded && ps.deathNoteDeaths >= DEATH_NOTE_DEATHS && ps.lp > 0
    && grantRelic(ps, DEATH_NOTE_ID)) ps.deathNoteAwarded = true;
  ps.dirty();
}

export function deathNoteView(ps) {
  if (!ps.relics.some((r) => r.id === DEATH_NOTE_ID)) return null;
  return { used: ps.deathNoteEntry?.round === ps.m.round, cost: deathNoteCost(ps) };
}
