# Interval Timer

A free, light interval timer for HIIT, Tabata, boxing rounds and circuit workouts.

**Use it:** https://daenavan.github.io/interval-timer/

- Full-screen colour you can read from across the room: green work, red rest, amber get ready, grey done.
- Beeps at every switch, optional 3-2-1 warning beeps, triple beep at the end.
- Named presets (work / rest / rounds), saved on your device.
- Optional get-ready countdown and a round timeline you can tap to jump.
- Keeps the screen on while running, and reopens paused where you left off.
- Installable (Add to Home Screen) and works offline. No account, no tracking, no dependencies.

On iPhone the beeps play over your music and follow the ring/silent switch.

## Develop

No build step. Serve the folder and open it:

```sh
python3 -m http.server 8000   # http://localhost:8000
node --test timer.test.js     # phase, round and beep maths
```

## Release

Bump `VERSION` in `sw.js` with every change you ship. Installed phones download the new files in the
background and show **New version available · Update**. Without a bump they keep the old version.

`og.png` and the PNG icons are rendered from `og.svg` and `icon.svg` with `rsvg-convert`.

Inspired by [greggman/interval-timer](https://github.com/greggman/interval-timer).
