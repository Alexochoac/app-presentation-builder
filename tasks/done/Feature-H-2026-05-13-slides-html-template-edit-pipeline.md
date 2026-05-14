---
title: Slides — HTML Templates — Edit Pipeline — Apply stored edits and make data-edit fields editable in decks
type: Feature
priority: H
status: done
area: slides
---

HTML catalog templates (imported or wizard-generated) are currently served as static files in decks. The `data-edit` attributes exist in the HTML but nothing reads or writes them. Canvas-builder templates have a full cycle: `renderLayoutToHtml()` injects stored edits + `contenteditable` at render time. HTML catalog templates need the same.

## What needs to be built

### 1. Server helper: `applyEditsToHtml(html, edits, editable)`
- Parse the HTML string for `[data-edit]` elements
- For each key found, replace the element's inner text with `edits[key]` if a stored value exists
- When `editable === true`, add `contenteditable spellcheck="false"` to each `[data-edit]` element
- Return the modified HTML string
- Use regex or a lightweight DOM approach (no extra npm deps)

### 2. Wire into preview endpoints (`builder/server.js`)
- `GET /slides/deck-preview/:id` — for `source === 'html'` templates, call `applyEditsToHtml(fragment, resolveSlideEdits(libSlide, activeDeckId), !readonly)` instead of serving raw HTML
- `GET /slides/library-preview/:id` — same, call `applyEditsToHtml(fragment, libSlide.edits || {}, false)`

### 3. Edit saving (builder UI)
The builder already has a save-edits flow for canvas slides (`POST /api/library/:id/edits`). HTML catalog slides need to hook into this same endpoint.
- When the builder renders an HTML catalog slide in an iframe, `contenteditable` fields are present
- The builder needs to read changed `data-edit` values from the iframe and POST them to `/api/library/:id/edits`
- Check whether the existing `saveEdits()` / edit-blur handler already covers this or needs a new path for HTML slides

## Acceptance criteria
- Import a template with `data-edit` fields
- Add it to a deck
- Open the deck in the builder — `data-edit` fields should be inline-editable
- Save changes — they persist on reload
- Published/readonly preview shows the saved text, not the placeholder

## Implementation Summary

### Problem
HTML catalog templates (wizard-generated `.html` files and imported HTML) were served as raw static HTML in all three rendering paths. The `data-edit` attributes existed in the source but:
1. Stored edits from the library were never injected into the HTML at render time.
2. `contenteditable` was always stripped, making fields read-only even in the editable builder view.
3. The `/slides/:deckSlideId.html` fragment route (used by `builder-ui/preview.html`) only handled canvas templates; HTML catalog templates fell through to the static file middleware and 404'd.

### Files changed
- `builder/server.js`

### Fixes made

**New helper — `applyEditsToHtml(html, edits, editable)` (added after `applyEditsToBlob`, ~line 720)**
Uses the already-present `cheerio` dependency to walk all `[data-edit]` elements in an HTML string, inject stored edit values via `.html()`, and either add `contenteditable=""` + `spellcheck="false"` (when `editable === true`) or remove those attributes (when `editable === false`). No new npm dependencies.

**`GET /slides/deck-preview/:id` — HTML branch (line ~61)**
Replaced the raw `fs.readFileSync` + regex strip with:
```js
fragment = applyEditsToHtml(fs.readFileSync(resolved.filePath, 'utf8'), resolveSlideEdits(libSlide, activeDeckId), !readonly);
```
Edits are now injected and `contenteditable` is toggled based on the `?readonly=1` query parameter. The `builder-ui/index.html` active-edit view (no `?readonly=1`) now gets editable fields; the read-only presentation view and thumbnails strip them.

**`GET /slides/library-preview/:id` — HTML branch (line ~4713)**
Replaced raw file read with:
```js
fragment = applyEditsToHtml(fs.readFileSync(resolved.filePath, 'utf8'), libSlide.edits || {}, false);
```
Library-preview is always read-only (used for slide-library thumbnails), so `editable=false`. The canvas branch keeps its existing regex strip unchanged; the shared `.replace()` line that used to cover both branches was absorbed into the canvas branch only.

**`GET /slides/:deckSlideId.html` — HTML catalog support (line ~2867)**
Replaced the direct `TEMPLATES_PATH` lookup + hard `if (!tpl) return next()` with `resolveTemplate(libSlide.templateId)`, which already handles both canvas and HTML catalog templates. Added the HTML branch:
```js
if (resolved.source === 'canvas') {
  html = renderLayoutToHtml(resolved.tpl, deckSlideId, savedEdits);
} else {
  html = applyEditsToHtml(fs.readFileSync(resolved.filePath, 'utf8'), savedEdits, true);
}
```
This fixes the 404 that previously occurred when `builder-ui/preview.html` tried to load an HTML catalog slide as an inline fragment. The existing `input` → `doSave()` → `POST /api/deck/slides/:id/edits` flow in `preview.html` automatically picks up the now-present `contenteditable` fields without any UI changes.
