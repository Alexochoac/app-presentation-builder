---
title: Builder — Save as Presentation — buildFrozenPresentation — Fix wrong edits source and missing template fallback
type: Issue
priority: H
status: done
area: builder
---

Two critical bugs in `buildFrozenPresentation` (server.js) cause slides to show wrong/stale content and some slides to be silently dropped from the frozen output.

**Bug 1 — Wrong edits source (server.js:3658 and 3693):**
`buildFrozenPresentation` reads `libSlide.edits` directly, but since the deck-specific edits system was introduced, user edits are stored in `libSlide.deckEdits[deckId]`. The `resolveSlideEdits(libSlide, deckId)` helper at server.js:3276 already does the correct resolution — it just isn't called here. Slides show stale or template-default content instead of the user's saved edits.

Fix: Replace both occurrences of:
```js
var edits = Object.assign({}, libSlide.edits || {});
```
with:
```js
var edits = resolveSlideEdits(libSlide, presentation.deckId || 'default');
```
(`presentation.deckId` is already stored on the presentation record and sent from the client via `deckId: activeDeckId`.)

**Bug 2 — Slides silently skipped (server.js:3536-3537, 3655-3656):**
`buildFrozenPresentation` loads templates only from `slide-templates.json` (TEMPLATES_PATH). But some library slides have templateId values that live in `templates.json` (TEMPLATE_CATALOG_PATH) — e.g. `lib-1778837645228` has `templateId: "ls05-technology"`. When not found in slide-templates.json, the condition `if (!tpl) return` silently skips the slide, shifting the slide count and order.

The `resolveTemplate(templateId)` function at server.js:3020 already checks both files and returns `{ source, tpl, filePath }`. The slide rendering loop needs to use `resolveTemplate` and handle both sources: `canvas` → `renderLayoutToHtml`, `html` → `applyEditsToHtml`. This same dual-source pattern is already used at server.js:4803-4806.

## Implementation Summary

**Problem:** `buildFrozenPresentation` in `builder/server.js` had two bugs that together caused wrong slide content, missing slides, and shifted slide order in frozen presentations — symptoms the user noticed after the deck-specific edits system and translation baking were introduced in the same session.

**Root causes found:**

1. **Wrong edits source** — When the deck-specific edits system was introduced, user edits were routed to `libSlide.deckEdits[deckId]` via `POST /api/deck/slides/:id/edits`. But `buildFrozenPresentation` still read from `libSlide.edits` (the old global field), so all deck-specific edits were silently ignored. The helper `resolveSlideEdits(libSlide, deckId)` (server.js:3276) already handles the correct lookup (deckEdits → fallback to edits) but was never called from the build function.

2. **Wrong template lookup** — `buildFrozenPresentation` pre-loaded templates only from `slide-templates.json` (TEMPLATES_PATH) and looked up by ID. But library slide `lib-1778837645228` had `templateId: "ls05-technology"` which lives in `templates.json` (TEMPLATE_CATALOG_PATH). Not found → `if (!tpl) return` silently skipped the slide. The existing `resolveTemplate(templateId)` function (server.js:3020) checks both files and returns `{ source, tpl, filePath }`, but wasn't used here.

**Files changed:** `builder/server.js`

**Specific fixes (3 edits):**

1. Removed the unused `var templates = JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf8'));` pre-load (was line 3537) — no longer needed since `resolveTemplate` handles both files internally.

2. Visible slides loop (was lines 3655–3661): replaced `templates.find(...)` lookup and `renderLayoutToHtml(tpl, ...)` with `resolveTemplate(libSlide.templateId)` + dual-source dispatch:
```js
var resolved = resolveTemplate(libSlide.templateId);
if (!resolved) return;
var edits = resolveSlideEdits(libSlide, presentation.deckId || 'default');
var fragment = resolved.source === 'canvas'
  ? renderLayoutToHtml(resolved.tpl, s.id, edits)
  : applyEditsToHtml(fs.readFileSync(resolved.filePath, 'utf8'), edits, false);
```

3. Hidden slides loop (was lines 3690–3696): identical fix applied.
