import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScratchProgress, erasedRatio } from '../../public/js/ui/scratchTickets.js';

test('scratch progress: corrupt cached strokes cannot crash the canvas; regions and coordinates stay bounded', () => {
  const previous = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => '{broken' };
    assert.deepEqual(loadScratchProgress('id'), {});
    globalThis.localStorage.getItem = () => JSON.stringify({
      0: { done: true }, 1: { strokes: [null, [0, 0, 1, 1], [-1, 0, 1, 1], ['0', 0, 1, 1], [0, 1]] },
      2: { strokes: 'broken' }, 8: { done: true },
    });
    assert.deepEqual(loadScratchProgress('id'), { 0: { done: true }, 1: { strokes: [[0, 0, 1, 1]] } });
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test('scratch coverage counts erased alpha, not repeated strokes over the same area', () => {
  assert.equal(erasedRatio(new Uint8ClampedArray()), 0);
  assert.equal(erasedRatio(new Uint8ClampedArray([1, 1, 1, 0, 1, 1, 1, 255])), 0.5);
  assert.equal(erasedRatio(new Uint8ClampedArray([1, 1, 1, 255])), 0);
});
