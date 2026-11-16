// Pure timer maths. Presets are in seconds; phases and elapsed time are in ms.

export const STARTERS = [
  { id: 'tabata', name: 'Tabata', work: 20, rest: 10, rounds: 8 },
  { id: 'hiit', name: 'HIIT', work: 40, rest: 20, rounds: 10 },
  { id: 'classic', name: 'Classic', work: 50, rest: 10, rounds: 30 },
];

const int = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
const obj = (v) => (v && typeof v === 'object' ? v : {});

export function normalizePreset(p) {
  p = obj(p);
  return {
    id: typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID(),
    name: String(p.name ?? '').trim().slice(0, 40) || 'Untitled',
    work: int(p.work, 1, 3600),
    rest: int(p.rest, 0, 3600),
    rounds: int(p.rounds, 1, 99),
  };
}

export function normalizeSettings(s) {
  s = obj(s);
  return {
    warn: typeof s.warn === 'boolean' ? s.warn : true,
    leadIn: s.leadIn === undefined ? 10 : int(s.leadIn, 0, 60),
    timeline: typeof s.timeline === 'boolean' ? s.timeline : true,
  };
}

// [ready] → work 1 → rest 1 → … → work N. No rest after the last round, no zero-length phases.
export function buildPhases(preset, leadIn) {
  const phases = [];
  let t = 0;
  const add = (kind, round, secs) => {
    if (secs <= 0) return;
    phases.push({ kind, round, start: t, dur: secs * 1000 });
    t += secs * 1000;
  };
  add('ready', 0, leadIn);
  for (let r = 1; r <= preset.rounds; r++) {
    add('work', r, preset.work);
    if (r < preset.rounds) add('rest', r, preset.rest);
  }
  return phases;
}

const end = (p) => p.start + p.dur;

export function stateAt(phases, elapsedMs) {
  const totalMs = phases.length ? end(phases[phases.length - 1]) : 0;
  const e = Math.min(Math.max(elapsedMs, 0), totalMs);
  const i = phases.findIndex((p) => e < end(p)); // a boundary belongs to the next phase
  const done = i === -1;
  const phase = done ? null : phases[i];
  return {
    index: done ? phases.length : i,
    phase,
    remainingMs: done ? 0 : end(phase) - e,
    elapsedMs: e,
    totalMs,
    leftMs: totalMs - e,
    done,
  };
}

const RANK = { short: 1, long: 2, done: 3 };

// The single most important cue in (fromMs, toMs]: done > long > short.
// One cue even across a big jump, so unlocking the phone never plays a burst.
export function cueBetween(phases, fromMs, toMs, warn) {
  let best = null;
  const hit = (t, cue) => {
    if (t > fromMs && t <= toMs && (!best || RANK[cue] > RANK[best])) best = cue;
  };
  phases.forEach((p, i) => {
    hit(end(p), i === phases.length - 1 ? 'done' : 'long');
    if (warn) for (let k = 1; k <= 3; k++) if (end(p) - k * 1000 > p.start) hit(end(p) - k * 1000, 'short');
  });
  return best;
}
