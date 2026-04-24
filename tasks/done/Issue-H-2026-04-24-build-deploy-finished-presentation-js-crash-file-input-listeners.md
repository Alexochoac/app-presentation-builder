---
title: Build & Deploy — Finished Presentation — Fix JS crash on file input listeners
type: Issue
priority: H
status: done
area: build-deploy
---

Finished presentations threw `Uncaught TypeError: Cannot read properties of null (reading 'addEventListener')` on load. The build strips all `<input type="file">` elements (correct — builder-only), but the JS listeners that attach to those inputs still ran immediately at page load, crashing when the elements weren't found.

**Root cause:** The two file-upload listeners (`carousel-file` and `logo-file`) execute at page load, not on user interaction. Other builder-only functions (`DeleteCarSlide`, `MoveCarSlide`, etc.) don't crash because they're only called by clicks, never on load.

**Fix (applied):** Both listeners in `builder/server.js` are now guarded with `if (!window.PB_READONLY)`. Finished presentations set `window.PB_READONLY = true`, so the listeners are skipped entirely and no element lookup occurs.

**Note:** Existing built presentations (e.g. `test-00000002`) need to be rebuilt to pick up the fix. New builds are correct from this point forward.
