---
title: Clean leftover test-card cruft + orphan edit keys on lib-surface
priority: low
status: pending
area: builder / data — slide-library.json (lib-surface)
---

## Context
The Surface/Defect slide (`ls06-surface` / library slide `lib-surface`) was rebuilt into a
config-driven card model (see `done/Feature-H-2026-06-06-builder-slide-06-surface-dynamic-defect-cards.md`).
During that work and earlier iterations, `data/slide-library.json` accumulated orphaned edit keys
that no longer map to any slot in the current cartridge. They are **harmless** (`applyEditsToHtml`
ignores keys with no matching `data-edit` slot) but should be cleaned for a true blank slate.

The `s6-config` itself is already clean (11 standard defects, the stray "New" card was deleted
during testing). This task is **JSON data cleanup only** — no cartridge/JS changes.

## Target
`builder/data/slide-library.json` → `slides[]` where `id === "lib-surface"`.
Clean the same keys from **both** `edits` and `deckEdits.default` (and scan the other
`deckEdits.<deckId>` objects — at last check only `default` had cruft, but re-verify).

### Keys to remove
- Orphaned schema artifacts: `s6-extra-defs`, `s6-label-11`, `s6-defect-custom-0`,
  `s6-icon-3`, `s6-icon-4`
- Orphaned per-button labels (labels now live inside `s6-config`): `s6-label-0` … `s6-label-11`
- Stale spare-slot carousel contents (no card references them; a freshly-claimed spare re-inits
  empty anyway): `s6-defect-x0` … `s6-defect-x10`
- Any matching `__attr:s6-defect-x*` / `__attr:s6-label-*` keys if present.

### Keep (do NOT remove)
- `s6-config` (the card list)
- `s6-default-carousel`, `s6-defect-scratches` … `s6-defect-coating` (real carousel content)
- `__attr:` autoplay keys for the real defect carousels
- `section-label`, `headline`, `subtitle`

## Safety
1. **Before deleting the `s6-defect-x*` keys, confirm none hold images worth keeping** — list each
   value; they should be empty tracks (`<div class="ls-carousel-track"></div>`) or placeholder-only.
   If any holds real uploaded images the user wants, leave that one.
2. This file is git-tracked — make the edit, then `git diff data/slide-library.json` and eyeball it
   before committing. Pretty-print/parse with `JSON.parse`→`JSON.stringify` to avoid hand-edit errors,
   but **preserve the file's existing formatting/indentation** (it is written by the server; match it).
3. Do it with the builder server stopped (avoid a concurrent write clobbering the change).

## Verify after
- `JSON.parse` the whole file (no corruption).
- Render `/slides/library-edit/lib-surface` (authenticated) → 11 clean cards, all real carousel
  content intact (scratches 4 imgs, coating, default), no console errors.
- Add a new card → its carousel is empty, first upload = exactly 1 image.

## Notes
- Quick enumeration snippet (run from `builder/`):
  `node -e 'const s=require("./data/slide-library.json").slides.find(x=>x.id==="lib-surface"); console.log(Object.keys(s.deckEdits.default).filter(k=>/^s6-(label-\d+|defect-x\d+|extra-defs|defect-custom-0|icon-[34])$/.test(k)))'`
