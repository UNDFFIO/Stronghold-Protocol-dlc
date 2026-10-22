import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { validateC2S } from '../../shared/protocol.js';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../public/js/ui/gameLogic/settings.js';

const request = (relicId = 'relic_003', action = 'add') => ({ t: 'g.relicDebug', relicId, action });
const setup = (opts = {}) => makeMatch({ mode: 'solo', humans: 1, fake: true, ...opts }).start().toPrep();

test('debug setting defaults off, accepts only true and survives serialization', () => {
  assert.equal(DEFAULT_SETTINGS.relicDebug, false);
  for (const raw of [null, {}, { relicDebug: 'true' }, { relicDebug: 1 }, { relicDebug: [] }]) {
    assert.equal(sanitizeSettings(raw).relicDebug, false);
  }
  assert.equal(sanitizeSettings(JSON.parse(JSON.stringify(sanitizeSettings({ relicDebug: true })))).relicDebug, true);
});

test('debug protocol requires a collectible id and bounded action', () => {
  assert.equal(validateC2S(request()), null);
  assert.equal(validateC2S(request('relic_003', 'remove')), null);
  for (const bad of [{ action: 'clear' }, { action: true }, { relicId: null }, { relicId: '' }]) {
    assert.ok(validateC2S({ ...request(), ...bad }));
  }
});

test('single-player prep adds and removes server-owned collectibles and battle effects', () => {
  const h = setup();
  try {
    const ps = h.ps('p_0'); ps.relics = [];
    assert.equal(h.m.handle(ps.playerId, request()).ok, true);
    assert.deepEqual(ps.relics, [{ id: 'relic_003', round: h.m.round }]);
    assert.ok(ps.battleInput().relics.includes('relic_003'));
    assert.equal(h.m.handle(ps.playerId, request()).error, 'BAD_TARGET');
    assert.equal(h.m.handle(ps.playerId, request('missing')).error, 'BAD_TARGET');
    assert.equal(h.m.handle(ps.playerId, request('relic_156')).error, 'BAD_TARGET', 'multiplayer-only collectible');
    assert.equal(h.m.handle(ps.playerId, request('relic_003', 'remove')).ok, true);
    assert.deepEqual(ps.battleInput().relics, []);
    assert.equal(h.m.handle(ps.playerId, request('relic_003', 'remove')).error, 'BAD_TARGET');
    h.invariants();
  } finally { h.m.dispose(); }
});

test('debug requests refuse multiplayer, ready, combat, eliminated, departed and spectator seats', () => {
  for (const state of ['coop', 'ready', 'combat', 'dead', 'left', 'spectator', 'ended']) {
    const h = setup(state === 'coop' ? { mode: 'coop', humans: 2 } : {});
    try {
      const ps = h.ps('p_0'); const before = [...ps.relics];
      if (state === 'ready') ps.ready = true;
      if (state === 'combat') h.m.phase = 'COMBAT';
      if (state === 'dead') ps.alive = false;
      if (state === 'left') ps.left = true;
      if (state === 'ended') h.m.ended = true;
      if (state === 'spectator') h.m.addSpectator('viewer');
      const result = h.m.handle(state === 'spectator' ? 'viewer' : ps.playerId, request());
      assert.ok(result.error, `${state}: ${JSON.stringify(result)}`);
      assert.deepEqual(ps.relics, before);
    } finally { h.m.dispose(); }
  }
});

test('debug grants preserve one-time effects and ticket prerequisites; removal clears dependent tickets', () => {
  const h = setup();
  try {
    const ps = h.ps('p_0'); ps.relics = []; h.m.difficultyLevel = 10;
    const send = (id, action) => h.m.handle(ps.playerId, request(id, action));
    assert.equal(send('relic_157').ok, true);
    const reduced = h.m.difficultyLevel;
    assert.ok(reduced < 10);
    assert.equal(send('relic_157', 'remove').ok, true);
    assert.equal(h.m.difficultyLevel, reduced, 'settled difficulty reduction is not rolled back');
    assert.equal(send('relic_158').ok, true);
    assert.equal(ps.relicReverseLpRound, h.m.round, 'prep grant applies to the upcoming battle');
    assert.equal(send('relic_158', 'remove').ok, true);
    assert.equal(ps.relicReverseLpRound, 0);
    assert.equal(send('relic_235').error, 'BAD_TARGET');
    assert.equal(send('relic_234').ok, true);
    assert.equal(send('relic_235').ok, true);
    assert.equal(send('relic_236').error, 'BAD_TARGET', 'only one outstanding debug ticket');
    assert.equal(ps.scratchTickets.length, 1);
    assert.equal(send('relic_235', 'remove').ok, true);
    assert.equal(ps.scratchTickets.length, 0);
    assert.equal(send('relic_236').ok, true);
    assert.equal(send('relic_234', 'remove').ok, true);
    assert.equal(ps.scratchTickets.length, 0);
    assert.deepEqual(ps.relics, []);
    h.invariants();
  } finally { h.m.dispose(); }
});
