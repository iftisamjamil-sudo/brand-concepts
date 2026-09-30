# Focus Garden

A quiet focus timer with a growing mini scene. This folder is plain HTML, CSS, and JS — no build step.

Session progress is a number from 0 to 1. The timer writes it to `--focus-progress` on `document.documentElement` and `#scene`, and mirrors it on `data-focus-progress` / `data-progress`. The same value goes through `window.FocusGarden.setProgress(p)` (`getProgress()` reads it back). At 0:00 the countdown stops and the page dispatches a bubbling `focus-complete` event on `document`.

## Build tasks

- [x] Scaffold + timer shell (this PR)
- [ ] Growing mini scene: sky, ground, plant stages, critters, sky shift over session
- [ ] Polish: smooth CSS animations, mobile layout, session-complete moment
- [ ] Live QA on brand-concepts-seven.vercel.app/builds/focus-garden/
