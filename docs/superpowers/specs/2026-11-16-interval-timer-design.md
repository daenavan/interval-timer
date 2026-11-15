# Interval Timer — design

## Intent

A very light interval timer for **workouts on a phone propped up a few metres away**.
Inspired by [greggman/interval-timer](https://github.com/greggman/interval-timer).
Installable as a PWA, works offline, saves everything on the device, published on
GitHub Pages at `https://daenavan.github.io/interval-timer/` and easy to find in search.

## Goals

- Readable and tappable from across a room: the whole screen is the phase colour
  (green work, red rest, amber get-ready, grey done), with a huge countdown and phase
  label. Below them: elapsed, round x/y, remaining. Two big buttons: Reset and Start/Pause.
- **Named presets** (name, work seconds, rest seconds, rounds): add, edit, delete, select.
  Starters (deletable): Tabata 20/10×8, HIIT 40/20×10, Classic 50/10×30.
- **App-wide settings** (not per preset):
  - 3-2-1 warning beeps — on/off
  - Get-ready lead-in — seconds, 0 = off
  - Round timeline (tap a segment to jump to it) — on/off
- Presets, settings and the selected preset are saved in `localStorage`.
- Installable (manifest + service worker + icons), fully offline after first visit.
- Good SEO (see below).

## Non-goals

Voice cues, accounts or sync, beeping while the screen is off, per-preset extras,
analytics, beeping through the iPhone silent switch.

## Anti-goals

- Anything heavy: no framework, no build step, no runtime dependencies.
- A timer that drifts, or goes silent mid-workout without the user knowing why.

## Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| **Plain static files, no build** | Smallest (~20 KB), nothing to maintain, Pages serves the repo as-is | **Chosen** (Claude's call; user handed over the how) |
| Vite + Preact + vite-plugin-pwa | Nicer component code, but adds a build, `node_modules`, and an Actions deploy, with no visible gain | Rejected |
| Fork greggman's app | Keeps its 50 KB webpack bundle, sound synth and NoSleep library; presets bolted onto 2014 code | Rejected |

## Behaviour

- **Sequence:** [get ready] → work 1 → rest 1 → … → work N → done. No rest after the last round.
- **Time** comes from the wall clock (`Date.now()`), not from counting ticks, so the timer
  never drifts and catches up correctly after the phone is locked and unlocked.
- **Sounds** come from a Web Audio oscillator, with no audio files:
  - a long beep at every phase change
  - short beeps at 3, 2 and 1 s remaining, when that setting is on
  - three long beeps when the workout is done

  Audio is unlocked by the Start tap. The iOS audio session stays at its default, so beeps
  mix with the user's music and the silent switch mutes them (user's choice).
- **Screen stays on** while the timer runs, using the Screen Wake Lock API, which is
  requested again whenever the page becomes visible. Browsers without that API get no
  fallback.
- **Resume:** the run state is saved to `localStorage` on every tick. If the page is
  reloaded or killed, it reopens **paused** at the last saved point.
- **Timeline:** a strip with one segment per phase, which the user can tap to jump to the
  start of that phase. It is shown only when its setting is on.
- **Preset change during a run** resets the timer. Editing a preset doesn't affect a run
  already in progress, because the run works from a copy of the preset.

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup, CSS, UI code, SEO meta tags, JSON-LD, short about text |
| `timer.js` | Pure ES module: `buildPhases(preset, settings)` and `stateAt(phases, elapsedMs)` |
| `timer.test.js` | `node timer.test.js`: assertion checks for the phase and round maths |
| `manifest.webmanifest` | Name, icons, `display: standalone`, theme colour, scope `./` |
| `sw.js` | Cache-first app shell with a versioned cache name |
| `icon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Install icons |
| `og.png` | 1200×630 image for link previews |
| `.nojekyll`, `README.md` | Pages serves the files as-is; README credits greggman |

## SEO

- `<html lang="en">` and the title `Interval Timer – free HIIT & Tabata timer`.
- A meta description and a canonical URL.
- Open Graph and Twitter card tags that use `og.png`.
- JSON-LD `WebApplication` data: free, any OS, category `HealthApplication`.
- An `<h1>` and a short about section with plain crawlable text below the timer,
  including a credit to greggman.
- Fast first load, since there's no framework.
- **Skipped:** `robots.txt`, because it only works at the domain root, which is a
  different repo; and `sitemap.xml`, because the site is one page and Search Console
  can take the URL directly.
- **User action:** add the site to Google Search Console.

## Publishing

1. `git init` and commit.
2. `gh repo create daenavan/interval-timer --public --source . --push`.
3. Turn on Pages from `main` at the repo root.
4. Check that the live URL loads, installs and works offline.

## Left to the builder

Exact colours and type, icon artwork, beep frequencies, and the layout of the preset and
settings screens. These must still meet the goals above.
