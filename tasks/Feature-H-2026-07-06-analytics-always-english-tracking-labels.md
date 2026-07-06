---
title: Analytics — Always-English tracking labels (language-independent)
type: Feature
priority: H
status: pending
area: builder
---

Tracking labels must **always be English**, even when the presentation UI is a non-English
deck (e.g. **Spanish-only**), so analytics read consistently regardless of the language the
customer saw.

## Problem
Components capture the label from the live DOM (`el.textContent`):
- `button.js:22` — `(btn.textContent || '').trim()`
- `tags.js:24`   — `(tag.textContent || '').trim()`
- `tabs.js:98`   — `(activeTab.textContent || '').trim()`

Two failure modes:
1. **Bilingual slides** bake one `<span data-lang="xx">` per language into each element, so
   `textContent` concatenates ALL languages → e.g. `"Contact us Contáctanos"`.
2. **Spanish-only presentations** bake only `data-lang="es"` (publish sets
   `allLangs = [defaultLang, ...]`, `server.js:2399`; a Spanish-only deck has no `en` span at
   all). So there is **no English anywhere in the shipped HTML** — scraping the DOM can never
   yield English.

The authoritative English lives in the **library source** (English is the source of truth,
translations layer on top at publish). It is therefore known at **build time on the server**,
not in the browser.

## Decision (2026-07-06)
Approach = **auto from the English library** (chosen over manual `data-track` ids / hybrid).
No per-element authoring; works for Spanish-only decks.

## Fix (publish layer + tracker + components)
1. **`server.js` `bakeLanguageSpans`** — when baking each trackable `[data-edit]` element,
   also stamp its authoritative **English** plain-text onto the element as a hidden attribute
   (e.g. `data-en="Contact us"`). English text is already computed there (`englishText`).
2. **`tracker.js`** — add `Track.enText(el)` helper. Resolution order: `data-en` (self) →
   nearest descendant `[data-en]` → `[data-lang="en"]` span text → `el.textContent` (monolingual
   English fallback). Collapse whitespace. Expose on the `Track` object.
3. **Components** — route label capture through `Track.enText(el)`:
   `button.js` (`.slide-btn`), `tags.js` (`.slide-tag`), `tabs.js` (active tab title).

## Open details to resolve during implementation
- `.slide-btn` links/buttons may **not** carry `data-edit` (see `button.js` docs) → decide their
  English source (stamp during bake if editable; else fall back to `textContent`).
- Tab titles DO carry `data-edit` (e.g. `data-edit="tab-about"`) — English recoverable. ✅
- Carousel/lightbox labels come from `img.alt` / `data-track` (attributes, not `data-lang`
  spans) — assess separately; likely already single-value.

## Notes / caveats
- **Forward-looking only.** Historical events already stored in Umami keep their old
  (concatenated / non-English) labels; cannot be rewritten.
- These component JS files ship to published presentations, so the fix takes effect on the
  next `/release` + re-publish.
- Separate from the pending **dashboard events-chart redesign** ("look professional / tell the
  story of a slide's events") — track that on its own.
