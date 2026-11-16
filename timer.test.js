// Run: node --test timer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPhases, stateAt, cueBetween, normalizePreset, normalizeSettings, STARTERS } from './timer.js';

const T = { id: 't', name: 'T', work: 20, rest: 10, rounds: 2 };
const S = (leadIn) => ({ warn: true, leadIn, timeline: true });

test('buildPhases tabata with lead-in', () => {
  const p = buildPhases(T, S(5));
  assert.deepEqual(p.map(x => [x.kind, x.round, x.start, x.dur]),
    [['ready', 0, 0, 5000], ['work', 1, 5000, 20000], ['rest', 1, 25000, 10000], ['work', 2, 35000, 20000]]);
});

test('buildPhases rest 0 and leadIn 0 emit no empty phases', () => {
  const p = buildPhases({ id: 'a', name: 'A', work: 30, rest: 0, rounds: 3 }, S(0));
  assert.deepEqual(p.map(x => x.kind), ['work', 'work', 'work']);
});

test('stateAt mid-phase, boundary, done', () => {
  const p = buildPhases(T, S(0));
  assert.equal(stateAt(p, 21000).phase.kind, 'rest');
  assert.equal(stateAt(p, 21000).remainingMs, 9000);
  assert.equal(stateAt(p, 20000).phase.kind, 'rest'); // boundary belongs to next phase
  const end = stateAt(p, 999999);
  assert.equal(end.done, true);
  assert.equal(end.phase, null);
  assert.equal(end.elapsedMs, 50000);
  assert.equal(end.leftMs, 0);
});

test('cueBetween warn, boundary, done', () => {
  const p = buildPhases(T, S(0));
  assert.equal(cueBetween(p, 16900, 17000, true), 'short'); // 3 s left
  assert.equal(cueBetween(p, 16900, 17000, false), null);
  assert.equal(cueBetween(p, 19950, 20050, true), 'long');
  assert.equal(cueBetween(p, 49950, 50050, true), 'done');
  assert.equal(cueBetween(p, 5000, 5100, true), null);
});

test('cueBetween large jump returns one cue', () => {
  const p = buildPhases(T, S(0));
  assert.equal(cueBetween(p, 1000, 40000, true), 'long');
  assert.equal(cueBetween(p, 1000, 90000, true), 'done');
});

test('normalizePreset clamps', () => {
  const n = normalizePreset({ name: '  ', work: 0, rest: -5, rounds: 9999 });
  assert.equal(n.name, 'Untitled');
  assert.equal(n.work, 1);
  assert.equal(n.rest, 0);
  assert.equal(n.rounds, 99);
  assert.equal(normalizePreset({ work: 'abc' }).work, 1);
  assert.equal(typeof normalizePreset({}).id, 'string');
});

test('normalizeSettings defaults and clamps', () => {
  assert.deepEqual(normalizeSettings(null), { warn: true, leadIn: 10, timeline: true });
  assert.equal(normalizeSettings({ leadIn: 500 }).leadIn, 60);
});

test('STARTERS are the three spec presets', () => {
  assert.deepEqual(STARTERS.map(p => [p.id, p.work, p.rest, p.rounds]),
    [['tabata', 20, 10, 8], ['hiit', 40, 20, 10], ['classic', 50, 10, 30]]);
});

// Every cue a 100 ms tick loop would play, as [ms, cue]. Ticks are offset so they never land on a boundary.
const sweep = (phases, warn) => {
  const out = [];
  const total = stateAt(phases, 0).totalMs;
  for (let t = 37; t < total + 100; t += 100) {
    const cue = cueBetween(phases, t - 100, t, warn);
    if (cue) out.push([Math.floor(t / 1000) * 1000, cue]);
  }
  return out;
};

test('rest 0: one long cue at the work-work boundary', () => {
  const p = buildPhases({ id: 'z', name: 'Z', work: 5, rest: 0, rounds: 2 }, S(0));
  assert.deepEqual(sweep(p, false), [[5000, 'long'], [10000, 'done']]);
});

test('a 2 s phase gets one warning beep, at 1 s left', () => {
  const p = buildPhases({ id: 'w', name: 'W', work: 5, rest: 2, rounds: 2 }, S(0));
  assert.deepEqual(sweep(p, true).filter(([t]) => t >= 5000 && t <= 7000), [[5000, 'long'], [6000, 'short'], [7000, 'long']]);
});
