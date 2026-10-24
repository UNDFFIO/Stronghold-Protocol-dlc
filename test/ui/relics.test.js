import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELICS } from '../../shared/relics.js';
import { RelicList, relicEntries, relicPreview, relicOdds, ownerRelics, revivalTargets, tierName } from '../../public/js/ui/relicPanel.js';
import { liveLp } from '../../public/js/ui/hud.js';
import { LpTower } from '../../public/js/ui/gameComponents.js';
import { rowLp } from '../../public/js/ui/teamPanel.js';
import { PHASE } from '../../shared/constants.js';

function* walk(v) {
  if (Array.isArray(v)) { for (const c of v) yield* walk(c); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
function textOf(v) {
  if (v == null || typeof v === 'boolean') return '';
  if (typeof v !== 'object') return String(v);
  if (Array.isArray(v)) return v.map(textOf).join('');
  return textOf(v.props?.children);
}

test('the full collection renders every acquired effect and round beyond the ten-effect HUD limit', () => {
  const chosen = RELICS.slice(0, 15);
  assert.equal(chosen.length, 15);
  const acquired = chosen.map((r, i) => ({ id: r.id, round: i + 1 }));
  const view = RelicList({ relics: acquired, reward: acquired.at(-1) });
  const cards = [...walk(view)].filter((v) => v.type === 'li');
  assert.equal(cards.length, chosen.length);
  for (let i = 0; i < cards.length; i++) {
    const text = textOf(cards[i]);
    assert.ok(text.includes(chosen[i].name));
    assert.ok(text.includes(chosen[i].desc));
    assert.ok(text.includes(`第 ${i + 1} 回合获得`));
  }
  assert.equal(cards.filter((v) => v.props.class.includes('is-new')).length, 1);
});

test('HUD preview fits three five-row columns and reserves More only beyond fifteen entries', () => {
  for (const count of [0, 1, 5, 6, 14, 15, 16, 64]) {
    const entries = Array.from({ length: count }, (_, i) => ({ id: `relic-${i}`, tier: 1, round: i + 1 }));
    const before = structuredClone(entries);
    const { visible, hidden } = relicPreview(entries);
    assert.equal(visible.length, count > 15 ? 14 : count);
    assert.equal(hidden, count - visible.length);
    assert.ok(visible.length + (hidden ? 1 : 0) <= 15);
    assert.deepEqual(visible, entries.slice(0, visible.length), 'same-tier records keep acquisition order');
    assert.deepEqual(entries, before, 'preview must not mutate the full collection');
  }
});

test('HUD preview prioritizes negative quality, then descending rarity, leaving unknown records last', () => {
  const entries = relicEntries(RELICS.map((r) => ({ id: r.id, round: 1 })));
  const negative = { id: 'negative-fixture', tier: 6, round: 2 };
  const unknown = { id: 'future-relic', round: 3 };
  const input = [unknown, ...entries, negative];
  const { visible, hidden } = relicPreview(input);
  assert.equal(visible[0], negative);
  assert.equal(visible.length, 14);
  assert.equal(hidden, input.length - 14);
  assert.ok(visible.every((r, i) => i === 0 || r.tier <= visible[i - 1].tier));
  assert.deepEqual(visible.slice(1), entries.filter((r) => r.tier === 5).concat(entries.filter((r) => r.tier === 4)).slice(0, 13));
  assert.deepEqual(relicPreview([unknown, { tier: 1 }]).visible, [{ tier: 1 }, unknown]);
});

test('full collection keeps hidden scratch tickets actionable without adding actions to the journal', () => {
  let opened;
  const props = { relics: [{ id: 'relic_235', round: 1 }], onScratch: (id) => { opened = id; } };
  const action = [...walk(RelicList(props))].find((v) => v.props?.['data-relic-id'] === 'relic_235');
  assert.ok(action);
  action.props.onClick();
  assert.equal(opened, 'relic_235');
  assert.ok(![...walk(RelicList({ ...props, history: true }))].some((v) => v.props?.['data-relic-id']));
});

test('older empty payloads explain how to obtain a relic; unknown ids remain visible without fabricating effects', () => {
  assert.match(textOf(RelicList({})), /每回合本人无漏怪/);
  assert.deepEqual(relicEntries(null), []);
  const list = relicEntries([null, {}, { id: 'future-relic', round: 4 }]);
  assert.deepEqual(list, [{ id: 'future-relic', round: 4 }]);
  assert.match(textOf(RelicList({ relics: list })), /效果资料暂不可用/);
});

test('collection follows the screen owner without leaking own rewards or shields to watched players', () => {
  const priv = { relics: [{ id: RELICS[0].id, round: 1 }], relicReward: { id: RELICS[0].id, round: 1 }, lpShield: 2, nextLpShield: 2 };
  const teammate = { playerId: 'other', relics: [{ id: RELICS[1].id, round: 2 }], lpShield: 1 };
  const pub = { players: [teammate] };
  const view = (ownerId) => ownerRelics({ pub, priv, myId: 'me', ownerId });
  assert.deepEqual(view('me'), { relics: priv.relics, reward: priv.relicReward, shield: 2, nextShield: 2 });
  assert.deepEqual(view('other'), { relics: teammate.relics, reward: null, shield: 1, nextShield: 0 });
  teammate.relics = [];
  assert.deepEqual(view('other').relics, []);
  assert.deepEqual(view('missing'), { relics: [], reward: null, shield: 0, nextShield: 0 });
  assert.equal(view('me').relics, priv.relics, 'returning home restores your collection');
});

test('negative quality is named independently of the five strength tiers and never shown in drop odds', () => {
  assert.equal(tierName(6), '负面');
  assert.equal(tierName(1), 'I · 普通');
  for (const round of [0, 1, 7, 15, 100]) {
    assert.ok(relicOdds(round).every((t) => t.tier !== 6 && Number.isFinite(t.percent)));
  }
});

test('displayed odds sum to 100% and lock high-strength tiers until their unlock round', () => {
  for (let round = 1; round <= 15; round++) {
    const odds = relicOdds(round);
    assert.equal(odds.length, 5);
    assert.ok(Math.abs(odds.reduce((sum, o) => sum + o.percent, 0) - 100) < 1e-8);
    for (const o of odds) if (round < o.unlock) assert.equal(o.percent, 0);
  }
});

test('时光之末：一次性使用状态、历史图鉴与可复活队友分别使用可信状态', () => {
  const records = [{ id: 'relic_233', round: 7, used: true }];
  assert.equal(relicEntries(records)[0].used, true);
  assert.match(textOf(RelicList({ relics: records })), /已使用 · 复活机会已消耗/);
  assert.ok(!textOf(RelicList({ relics: records, history: true })).includes('机会已消耗'));
  assert.match(textOf(RelicList({ relics: [{ id: 'relic_233', round: 7 }] })), /剩余 1 次/);
  const players = [
    { playerId: 'me', alive: false, canRevive: true },
    { playerId: 'dead', alive: false, canRevive: true },
    { playerId: 'left', alive: false, canRevive: false },
    { playerId: 'alive', alive: true, canRevive: true },
  ];
  assert.deepEqual(revivalTargets({ players }, 'me').map((p) => p.playerId), ['dead']);
});

test('live LP previews include shields, keep uncapped survivor counts and avoid subtracting a server preview twice', () => {
  const common = { round: 4, lp: 24, leaks: 20, cap: 10, shield: 2 };
  const normal = liveLp(null, { ...common, phase: PHASE.COMBAT });
  assert.equal(normal.pending, 8);
  assert.equal(normal.shown, 16);
  const saved = liveLp(normal.base, { ...common, phase: PHASE.UNITE, uniteLeft: 1 });
  assert.equal(saved.pending, 0);
  assert.equal(saved.left, 1);
  const pub = { phase: PHASE.UNITE, unite: { leakers: ['b'] } };
  const b = { playerId: 'b', alive: true, lp: 24, lpShield: 2, pendingLp: 8, uniteLeft: 20 };
  assert.equal(rowLp(b, pub).pending, 8, 'server already applied shield');
  assert.equal(rowLp(b, pub, null, { uniteLocal: { b: 3 } }).pending, 1);
  assert.equal(rowLp(b, pub, null, { uniteLocal: { b: 1 } }).pending, 0);
});


test('LP tower keeps current HP for both shielded losses and time-machine gains until settlement', () => {
  for (const [lp, pending, tick] of [[24, 8, '−8'], [1, -3, '+3']]) {
    const view = LpTower({ value: lp, pending });
    const nodes = [...walk(view)];
    const value = nodes.find(n => n.props?.class?.includes('lp__val'));
    const change = nodes.find(n => n.props?.class?.includes('lp__pend'));
    assert.equal(textOf(value), String(lp), 'pending changes do not rewrite current HP');
    assert.equal(textOf(change), tick);
    assert.equal(view.props['data-pending'], pending);
    assert.match(change.props['aria-label'], pending < 0 ? /增加 3/ : /扣除 8/);
  }
});

test('时间机器：普通与联防血量预览加血、不截断低血回血、结算后不重复预览', () => {
  const first = liveLp(null, { phase: 'COMBAT', round: 2, lp: 1, leaks: 3, shield: 2, reverseLp: true });
  assert.equal(first.shown, 4); assert.equal(first.pending, -3);
  const settled = liveLp(first.base, { phase: 'COMBAT', round: 2, lp: 4, leaks: 3, reverseLp: true });
  assert.equal(settled.shown, 4); assert.equal(settled.pending, 0);
  const unite = liveLp(null, { phase: 'UNITE', round: 2, lp: 1, leaks: 5, uniteLeft: 2, reverseLp: true });
  assert.equal(unite.shown, 3);
});

test('漏怪概率展示与实际降级概率一致', () => {
  for (const [round, expected] of [[1, [100, 0, 0, 0, 0]], [4, [88, 12, 0, 0, 0]], [7, [80, 15, 4, 1, 0]], [10, [60, 25, 10, 5, 0]], [13, [40, 35, 15, 10, 0]]]) {
    assert.deepEqual(relicOdds(round, { leaked: true }).map((t) => t.percent), expected);
  }
});
