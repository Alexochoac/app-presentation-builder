---
title: Translation System — Remove Dead Global Fields Section
type: Feature
priority: M
status: pending
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
