# Surface/Defect slide — dynamic add/delete defect cards + per-card uploadable icons

**Type:** Feature
**Priority:** High
**Status:** Done
**Date:** 2026-06-06
**Area:** builder / slides — `slide-06-surface.html` (template `ls06-surface`, library slide `lib-surface`)

## Goal
Restore (and improve) the ability to **add and remove defect-type cards** on the Surface Quality
defect slide, which was lost when `lib-surface` was re-pointed from the old canvas template
(`tpl-new-defect-gallery`) to the static cartridge `ls06-surface`. Each card also needed an
**individually uploadable icon image** (replacing the dynamically-sliced sprite).

## What was done

Rebuilt the defect-type selector in `builder/features/slides/slide-06-surface.html` from a fixed
set of 11 hard-coded buttons into a **config-driven, content-safe** model — ported from the proven
`slide-23-ls20-multi-buttons.html` pattern but adapted so existing carousel content is never touched.

### Model
- **Card list** (label + icon + carousel slot) is stored as JSON in a hidden, contenteditable
  config blob: `<div id="s6-config" data-edit="s6-config">`. It rides the standard
  focusout→save pipeline (`persistConfig()` → `dispatch('focusout')`).
- **Carousel images stay in their own `data-edit` slots** (`s6-defect-scratches`, `s6-defect-coating`,
  `s6-default-carousel`, etc.) — they are NOT duplicated into the config. Each config item points at
  its slot via a stable `carKey`, so existing content survives the rebuild with **zero migration**.
- `DEFAULT_CONFIG` (11 standard defects) is used whenever the config blob is empty, so the slide
  renders correctly out of the box. Labels matched the user's existing `s6-label-N` edits (standard
  defect names), so no label migration was needed.
- **Carousel slot pool = 22**: the 11 named default slots + 11 spare slots (`s6-defect-x0…x10`).
  `MAX_CARDS = 22` (user-requested cap). New cards claim the lowest free spare slot first.

### UI / controls (builder only, gated by `window.PB_READONLY`)
Each card shows, on hover, **three** controls (the two existing image controls + one new):
- **Change image** (⤓, accent) — file picker → `PBUpload` → sets `item.icon` → persists.
- **Clear image** (✕, grey) — empties `item.icon` → shows a "+" placeholder.
- **Delete card** (✕, red, opposite corner) — confirm → removes the card from the config.
- Editable label (contenteditable) per card.
- An **"+ Add"** button (dashed) appends a new card (until the 22 cap).

All controls `stopPropagation` so they never trigger the card's click-to-switch-carousel.
In published/readonly output (`PB_READONLY = true`, set in the publish bake and preview routes)
none of the controls/Add button/editable labels render — buttons just switch carousels.

### Empty-carousel fix (reported during testing)
New cards originally shipped a placeholder slide (`<img src="">`); the carousel only *replaces* a
placeholder when exactly one exists, so the first upload landed *beside* it (empty frame + image).
Fixed by making spare slots **truly empty** (`<div class="ls-carousel-track"></div>`, like the
Dust/Ignore carousels): an empty card now shows nothing but the `+ Image` button, and the first
upload appends exactly one image. `clearSlot()` also empties the track and persists the empty state
(via a `slide-carousel-save` dispatch) so a reused spare never resurrects stale images on reload.

## Files changed
- `builder/features/slides/slide-06-surface.html` — full selector rewrite (config blob, JS-rendered
  cards, add/delete, 3 hover controls, 11 spare carousel slots, empty-slot handling). All existing
  default-carousel markup preserved verbatim.

(Per-card uploadable icons groundwork — the sliced default icons `defect-icon-0…8.png` +
`defect-icon-coating.png` and the re-point of `lib-surface.templateId` → `ls06-surface` — landed
earlier in commit `494aa39`.)

## Verification
- JS syntax checked; structural checks pass (config blob present, 22 carousels, 11 empty spares,
  no leftover placeholder slides, scratches/coating/edge content intact).
- Authenticated server render of `/slides/library-edit/lib-surface` confirmed the config round-trips:
  `deckEdits.default.s6-config` already held a valid 12-card config (11 defaults + a user-added
  "New" card via `s6-defect-x0`) — proving the save→load→add-card cycle works end-to-end in a real
  browser session.
- Confirmed `window.PB_READONLY = true` is set in the publish bake (server.js ~5153) and all readonly
  preview routes, so edit controls do not leak into customer output.

## Follow-ups (not blocking)
- **Leftover test data** in `slide-library.json` → `lib-surface.deckEdits.default`: a stale 12th
  "New" card (`s6-defect-x0`) plus orphaned keys from earlier iterations
  (`s6-extra-defs`, `s6-label-11`, `s6-defect-custom-0`, `s6-icon-3`, `s6-icon-4`,
  saved `s6-defect-x1…x10` contents). Harmless (no matching slots → ignored by `applyEditsToHtml`),
  but offered to clean for a fresh slate. User can also just delete the "New" card with the new ✕.
- Legacy rulebook warnings on this cartridge remain (id-convention `ls06`, scoped hardcoded
  colors/fonts) — pre-existing debt, not introduced here.
- Commits pending push to `origin master` (user pushes from PowerShell — HTTPS, no creds in WSL).
