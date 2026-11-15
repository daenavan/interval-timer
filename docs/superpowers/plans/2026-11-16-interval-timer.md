# Interval Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a light, installable interval timer for phone workouts, with named presets and app-wide extras, published on GitHub Pages.

**Architecture:** Static files with no build step. The phase, round and beep maths lives in a pure ES module (`timer.js`) that `node` tests. `index.html` holds the markup, CSS and UI code. A cache-first service worker and a manifest make the app installable.

**Tech Stack:** HTML/CSS/vanilla JS (ES modules), Web Audio, Screen Wake Lock API, Service Worker. Node 24 for `node --test`. `rsvg-convert` turns the SVG icons into PNGs. Chrome runs headless for screenshots.

**Spec:** `docs/superpowers/specs/2026-11-16-interval-timer-design.md`

## Global Constraints

- No framework, no build step, no runtime dependencies. All JS is hand-written and served as-is.
- All paths are relative (`./`), because the site lives at `https://daenavan.github.io/interval-timer/`.
- Phase colours fill the whole screen: work green, rest red, get-ready amber, done grey.
- Starter presets: Tabata 20/10×8, HIIT 40/20×10, Classic 50/10×30.
- Settings are app-wide: `warn` (3-2-1 beeps, default on), `leadIn` (seconds, default 10, 0 = off), `timeline` (default on).
- There's no rest after the last round.
- The iOS audio session stays at its default. Never set `navigator.audioSession.type`.
- `localStorage` keys: `it.presets`, `it.selected`, `it.settings`, `it.run`.
- Title: `Interval Timer – free HIIT & Tabata timer`. Canonical URL: `https://daenavan.github.io/interval-timer/`.

## Review Focus

1. The phone is locked for 60 s mid-workout. On unlock the clock shows the real time, and **at most one** beep plays, not a burst. Covered by the `cueBetween large jump` test in Task 1.
2. A preset has rest = 0 or rounds = 1. There are no zero-length phases and no double beep at a boundary. Covered by the `buildPhases rest 0` test in Task 1.
3. Typed preset input is garbage: an empty name, work 0, negative rest, 9999 rounds, or `"abc"`. The values are clamped to safe ranges and nothing is ever NaN. Covered by the `normalizePreset clamps` test in Task 1.
4. `localStorage` is missing, corrupt, or in an old shape (private mode, hand-edited). The app still loads with the starter presets and is never blank. Covered by the corrupt-storage check in Task 2.
5. The user deletes the selected preset, or tries to delete the last one. The selection falls back to the first preset, and the last preset can't be deleted. Covered by the delete check in Task 3.

---

### Task 1: Timer maths module

**Files:**
- Create: `timer.js`, `timer.test.js`, `.gitignore` (`.DS_Store`), `.nojekyll` (empty)
- Run `git init -b main` first.

**Interfaces:**
- Produces (all named exports of `timer.js`):
  - `normalizePreset(p: any) -> {id: string, name: string, work: number, rest: number, rounds: number}`. Integers. `work` 1–3600, `rest` 0–3600, `rounds` 1–99. `name` is trimmed and capped at 40 chars, falling back to `"Untitled"`. `id` is kept, or `crypto.randomUUID()` if missing. A bad number becomes that field's minimum.
  - `normalizeSettings(s: any) -> {warn: boolean, leadIn: number, timeline: boolean}`. `leadIn` is an integer 0–60. Defaults are `{warn: true, leadIn: 10, timeline: true}`.
  - `STARTERS: Preset[]`: the three starter presets, with ids `tabata`, `hiit` and `classic`.
  - `buildPhases(preset, settings) -> Phase[]`, where `Phase = {kind: 'ready'|'work'|'rest', round: number, start: number, dur: number}` and times are in ms. `round` is 0 for `ready`. Zero-length phases are never emitted.
  - `stateAt(phases, elapsedMs) -> {index, phase, remainingMs, elapsedMs, totalMs, leftMs, done}`. `elapsedMs` is clamped to [0, total]. When done, `index === phases.length`, `phase === null` and `remainingMs === 0`.
  - `cueBetween(phases, fromMs, toMs, warn) -> 'done'|'long'|'short'|null`. Returns the single most important cue for `(fromMs, toMs]`, in the order done > long > short. `long` means a phase boundary was crossed. `done` means the end of the last phase was crossed. `short` means `warn` is on and a whole second with 3, 2 or 1 s left before a boundary was crossed.

- [ ] **Step 1: Write the failing tests** in `timer.test.js` using `node:test` and `node:assert/strict`:

```js
test('buildPhases tabata with lead-in', () => {
  const p = buildPhases({id:'t',name:'T',work:20,rest:10,rounds:2}, {warn:true,leadIn:5,timeline:true});
  assert.deepEqual(p.map(x => [x.kind, x.round, x.start, x.dur]),
    [['ready',0,0,5000],['work',1,5000,20000],['rest',1,25000,10000],['work',2,35000,20000]]);
});
test('buildPhases rest 0 and leadIn 0 emit no empty phases', () => {
  const p = buildPhases({id:'a',name:'A',work:30,rest:0,rounds:3}, {warn:true,leadIn:0,timeline:true});
  assert.deepEqual(p.map(x => x.kind), ['work','work','work']);
});
test('stateAt mid-phase, boundary, done', () => {
  const p = buildPhases({id:'t',name:'T',work:20,rest:10,rounds:2}, {warn:true,leadIn:0,timeline:true});
  assert.equal(stateAt(p, 21000).phase.kind, 'rest');
  assert.equal(stateAt(p, 21000).remainingMs, 9000);
  assert.equal(stateAt(p, 20000).phase.kind, 'rest');     // boundary belongs to next phase
  const end = stateAt(p, 999999);
  assert.equal(end.done, true); assert.equal(end.phase, null); assert.equal(end.elapsedMs, 50000); assert.equal(end.leftMs, 0);
});
test('cueBetween warn, boundary, done', () => {
  const p = buildPhases({id:'t',name:'T',work:20,rest:10,rounds:2}, {warn:true,leadIn:0,timeline:true});
  assert.equal(cueBetween(p, 16900, 17000, true), 'short');  // 3 s left
  assert.equal(cueBetween(p, 16900, 17000, false), null);
  assert.equal(cueBetween(p, 19950, 20050, true), 'long');
  assert.equal(cueBetween(p, 49950, 50050, true), 'done');
  assert.equal(cueBetween(p, 5000, 5100, true), null);
});
test('cueBetween large jump returns one cue', () => {
  const p = buildPhases({id:'t',name:'T',work:20,rest:10,rounds:2}, {warn:true,leadIn:0,timeline:true});
  assert.equal(cueBetween(p, 1000, 40000, true), 'long');
  assert.equal(cueBetween(p, 1000, 90000, true), 'done');
});
test('normalizePreset clamps', () => {
  const n = normalizePreset({name:'  ', work:0, rest:-5, rounds:9999});
  assert.equal(n.name, 'Untitled'); assert.equal(n.work, 1); assert.equal(n.rest, 0); assert.equal(n.rounds, 99);
  assert.equal(normalizePreset({work:'abc'}).work, 1);
  assert.equal(typeof normalizePreset({}).id, 'string');
});
test('normalizeSettings defaults and clamps', () => {
  assert.deepEqual(normalizeSettings(null), {warn:true, leadIn:10, timeline:true});
  assert.equal(normalizeSettings({leadIn:500}).leadIn, 60);
});
```

- [ ] **Step 2: Run** `node --test timer.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `timer.js`** with the exports above. For `cueBetween`, collect the events whose time `t` satisfies `from < t <= to` and return the highest-priority one. The events are each phase end (the last phase's end is `done`, the others are `long`) and, when `warn` is on, each `end - k*1000` for k in 1..3 where that time is `> phase.start` (`short`).
- [ ] **Step 4: Run** `node --test timer.test.js`. Expected: all pass.
- [ ] **Step 5: Commit** with `git add -A && git commit -m "feat: timer phase maths with tests"`.

### Task 2: Timer screen, run loop, sound, wake lock, resume

**Files:**
- Create: `index.html` (with a `<script type="module">` that imports `./timer.js`)

**Interfaces:**
- Consumes: everything from Task 1.
- Produces (top-level functions in the module script, used by Task 3): `load(key, fallback)` and `save(key, value)`, which wrap `localStorage` in try/catch and return the fallback on any error. `state` is `{presets, selectedId, settings, phases, startedAt|null, pausedAt: ms elapsed, prevMs}`. `resetRun()` rebuilds `phases` from the selected preset and clears the run. `render()`. `jumpTo(ms)`.

- [ ] **Step 1: Markup and CSS.** The body background comes from a `data-phase` attribute (`ready` / `work` / `rest` / `done` / `idle`). Use green `#16a34a`, red `#dc2626`, amber `#d97706` and grey `#4b5563`; idle uses the work green. Show:
  - the countdown in `font-size: min(38vw, 45vh)` with `tabular-nums`
  - the phase label (GET READY / WORK / REST / DONE)
  - three small stats: elapsed, round `x/y`, remaining
  - a Reset button and a Start/Pause button, each at least 72 px tall
  - a header with the preset name (a button that opens the presets dialog in Task 3) and a ⚙ button for settings

  Use `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` and respect the safe-area insets.
- [ ] **Step 2: Run loop.** Elapsed time is `Date.now() - startedAt` while running and `pausedAt` while paused. Tick with `setTimeout(tick, 100)`. Also run a tick on `visibilitychange` so the screen catches up after unlock. Each tick:
  1. Play `cueBetween(phases, prevMs, nowMs, settings.warn)`.
  2. Set `prevMs = nowMs`.
  3. Save `it.run = {presetId, elapsed: nowMs}`.
  4. Render.

  When the workout is done, stop and show DONE. The countdown shows `Math.ceil(remainingMs/1000)` as `m:ss`.
- [ ] **Step 3: Sound.** Create one `AudioContext` lazily on the first Start tap and `resume()` it on every Start tap. Use an oscillator plus a gain envelope: `short` is 880 Hz for 0.12 s, `long` is 660 Hz for 0.6 s, and `done` is three `long` beeps 0.8 s apart. Don't touch `navigator.audioSession`.
- [ ] **Step 4: Wake lock.** On start, call `navigator.wakeLock?.request('screen')` inside try/catch. Release it on pause, reset and done. Request it again on `visibilitychange` when the page becomes visible and the timer is running.
- [ ] **Step 5: Resume.** On load, read `it.run`. If its preset still exists and `elapsed` is less than the total, restore it **paused** at `elapsed`. Otherwise start idle at 0.
- [ ] **Step 6: Verify.**
  1. Run `node --test timer.test.js` (should still pass).
  2. Serve with `python3 -m http.server 8000` (in the background) and take a screenshot: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=$SCRATCH/shot.png --window-size=390,844 http://localhost:8000/`. Expected: a full-screen green page with a big `0:10` countdown (lead-in) and readable buttons.
  3. Check corrupt storage: run `localStorage.setItem('it.presets','{oops')` in the console, then reload. The app should still load with the starters.
- [ ] **Step 7: Commit** with `git commit -am "feat: timer screen with beeps, wake lock, resume"` (after `git add index.html`).

### Task 3: Presets and settings dialogs, timeline

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `load`, `save`, `state`, `resetRun`, `render` and `jumpTo` from Task 2. `normalizePreset`, `normalizeSettings`, `STARTERS` and `buildPhases` from Task 1.

- [ ] **Step 1: Presets dialog** (native `<dialog>`):
  - It lists the presets as `Name — 20s / 10s × 8`. Tapping a row selects that preset, saves `it.selected`, calls `resetRun()` and closes the dialog.
  - Each row has an Edit button. The form has a name field (text) and work, rest and rounds fields (`type=number`, `inputmode=numeric`), and its values pass through `normalizePreset` before `save('it.presets')`.
  - There's an "Add preset" button.
  - Delete is disabled when only one preset is left. Deleting the selected preset selects the first remaining one and calls `resetRun()`.
  - Editing the selected preset doesn't touch a run in progress; it takes effect on the next `resetRun()`.
- [ ] **Step 2: Settings dialog** (native `<dialog>`): a checkbox for "3-2-1 warning beeps", a number field for "Get-ready seconds (0 = off)" and a checkbox for "Round timeline". Values pass through `normalizeSettings` and are saved to `it.settings`. Changing the lead-in calls `resetRun()` only if the timer is idle or done.
- [ ] **Step 3: Timeline.** When `settings.timeline` is on, show a horizontal strip with one flex segment per phase, sized by `dur` and tinted by phase colour, with the current one outlined. Tapping a segment calls `jumpTo(phase.start)`, which sets the elapsed time, sets `prevMs` to that time (so no burst of cues) and plays one `long` beep.
- [ ] **Step 4: Verify.** Serve the app and open it in Chrome (headed or via screenshots). Check that:
  - adding, editing and deleting presets survives a reload
  - you can't delete the last preset
  - deleting the selected preset falls back to the first one
  - each settings toggle works and survives a reload
  - tapping a timeline segment jumps there
  - `node --test timer.test.js` still passes
- [ ] **Step 5: Commit** with `git commit -am "feat: presets, settings, timeline"`.

### Task 4: PWA, SEO, README

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180), `og.svg` (the source, not referenced), `og.png` (1200×630) and `README.md`
- Modify: `index.html` (head tags, SW registration, about section)

- [ ] **Step 1: Icons and OG image.** `icon.svg` is a simple maskable design: a stopwatch glyph on green `#16a34a` with a safe zone of 80%. Render the PNGs with `rsvg-convert -w N -h N icon.svg -o icon-N.png`. Render `og.png` from `og.svg`; it shows the app name and the tagline "Free HIIT & Tabata interval timer".
- [ ] **Step 2: Manifest.** Set `name` "Interval Timer", `short_name` "Intervals", `start_url` "./", `scope` "./", `display` "standalone", `background_color` and `theme_color` `#16a34a`, and icons 192 and 512 (512 also `purpose: "maskable"`).
- [ ] **Step 3: `sw.js`.** Set `const CACHE = 'it-v1'`. On install, precache `./`, `./index.html`, `./timer.js`, `./manifest.webmanifest` and the icons. On activate, delete any other `it-*` caches. On fetch for GET requests, use cache-first with a network fallback. Register it from `index.html` with `navigator.serviceWorker?.register('./sw.js')`.
- [ ] **Step 4: SEO head tags.**
  - Title (per Global Constraints).
  - `<meta name="description" content="Free interval timer for HIIT, Tabata and circuit workouts. Big full-screen countdown, beeps, saved presets. Works offline — install it on your phone.">`
  - Canonical link, `theme-color`, `apple-touch-icon` and the manifest link.
  - `og:title`, `og:description`, `og:type=website`, `og:url` and `og:image` (absolute URL: `https://daenavan.github.io/interval-timer/og.png`), plus `twitter:card=summary_large_image`.
  - JSON-LD `WebApplication` with `name`, `url`, `applicationCategory: "HealthApplication"`, `operatingSystem: "Any"` and `offers {price: "0", priceCurrency: "USD"}`.
- [ ] **Step 5: About section** below the timer, reachable by scrolling. It has an `<h1>Interval Timer</h1>`, two or three short paragraphs (what it does, how to install it to the home screen, that it works offline and stores nothing off the device) and a credit link to greggman/interval-timer. `README.md` holds the same facts plus the live URL and `node --test timer.test.js`.
- [ ] **Step 6: Verify.**
  1. Serve locally. In Chrome DevTools, check that Application → Manifest shows no errors and that the service worker is activated.
  2. Turn on Offline and reload; the app should still load.
  3. Check that the screenshot still looks right.
  4. Check the JSON-LD by running `JSON.parse` on its contents in node.
- [ ] **Step 7: Commit** with `git add -A && git commit -m "feat: PWA install, offline, SEO"`.

### Task 5: Publish to GitHub Pages

- [ ] **Step 1:** Run `gh repo create daenavan/interval-timer --public --source . --push --description "Free, light interval timer (HIIT/Tabata). Installable PWA."`.
- [ ] **Step 2:** Turn on Pages with `gh api -X POST repos/daenavan/interval-timer/pages -f 'source[branch]=main' -f 'source[path]=/'`.
- [ ] **Step 3:** Add topics with `gh repo edit daenavan/interval-timer --homepage https://daenavan.github.io/interval-timer/ --add-topic interval-timer,hiit,tabata,pwa,workout-timer`.
- [ ] **Step 4: Verify.** Poll `gh api repos/daenavan/interval-timer/pages/builds/latest --jq .status` until it returns `built`. Then `curl -sI https://daenavan.github.io/interval-timer/` should return 200, and `curl -s .../manifest.webmanifest` should return the JSON. Take a screenshot of the live URL.
- [ ] **Step 5:** Tell the user how to add the URL to Google Search Console.
