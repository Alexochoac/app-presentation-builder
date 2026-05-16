---
title: Translation System — Remove Dead Global Fields Section
type: Feature
priority: M
status: done
area: builder
---

Remove the `fields` section from the translation schema entirely. It contains 193 stale global entries that are never used by `bakeLanguageSpans()` and were causing wrong translations to appear in the Builder Preview (showing another slide's Spanish text for the same key name).

## Why

The `fields` section in `translations.json` was never read by the server's `bakeLanguageSpans()` function — only `translationsData.slides[librarySlideId]` is used there. But `applyPreviewLang()` in `preview.html` was falling back to `fields[key][lang]` when a slide had no per-slide translation, causing keys like `headline` and `subtitle` to show translations from completely different slides. A partial fix was applied (2026-05-16) but the dead data should be removed cleanly.

## What to do

1. **New per-deck translation files (from Task 1)** will not include a `fields` section — just `{ languages, defaultLanguage, slides }`. Done by default.

2. **In `server.js`**: search for any code reading from `translationsData.fields` and remove it. The endpoint `GET /api/translations/fields-summary` may reference it — verify and remove.

3. **In `preview.html`**: verify the `applyPreviewLang()` fix (2026-05-16) removed the global fields fallback. Remove any remaining `translationsData.fields` references from the translation panel and Translation Center code.

4. **Delete or archive the old global `builder/data/translations.json`** once all decks have their own file and the system is confirmed working. Do not delete until Task 2 is fully live.

## Files

- `server.js` — remove `fields` reads/writes
- `builder/features/builder-ui/preview.html` — verify + clean up `fields` references
- `builder/data/translations.json` — archive/delete

## Depends on
Task 1 (per-deck files), Task 2 (endpoints migrated)

## Implementation Summary

### Problem
`translationsData.fields` was a legacy global store of 193+ field translations keyed by field name (e.g. `hero-title`, `headline`). It was never used by `bakeLanguageSpans()` during publish, but `applyPreviewLang()` in `preview.html` fell back to it when no per-slide translation existed — causing cross-slide translation bleeding (slide 2's `headline` showing slide 1's Spanish text). The global `builder/data/translations.json` file also pointed to a dead path once per-deck files were active.

### Files changed

**`builder/server.js`**
- Removed `TRANSLATIONS_PATH` constant (pointed to old global `builder/data/translations.json`)
- Simplified `readTranslations()` and `writeTranslations()` — deckId now always required; no TRANSLATIONS_PATH fallback
- Removed `var fields` and `|| fields[fieldKey]` fallback from `getTranslationValue()` — now only reads from `slides[slideId]`
- Removed the entire 26-line legacy dirty-flag block (`if (t.fields) { ... }`) from the save endpoint — it was already a no-op since no per-deck file has a `fields` section

**`builder/features/builder-ui/preview.html`**
- `updateTranslateBadge()` — removed `Object.values(translationsData.fields || {})` loop; now counts only from `translationsData.slides`
- `openTranslationPanel()` — removed `var fields = translationsData.fields || {}` and `|| (fields[fieldKey] && fields[fieldKey][lang])` fallback on `entry` lookup
- `applyPreviewLang()` — removed `var fields = ...` and entire 7-line `if (!entry) { globalEntry / globalEn }` fallback block; lookup is now strictly per-slide

**`builder/data/translations.json`** — deleted; all translation data lives in per-deck files at `builder/data/decks/[deckId]/translations.json`
