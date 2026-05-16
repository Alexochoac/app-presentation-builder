---
title: Translation System — bakeLanguageSpans — Read from Per-Deck Translations
type: Feature
priority: H
status: done
area: builder
---

When building a frozen/published presentation, `buildFrozenPresentation()` must read translations from the presentation's own deck, not the global file.

## Why

`buildFrozenPresentation()` currently reads from the global `TRANSLATIONS_PATH`. After Task 1, the correct translations will live at `decks/[deckId]/translations.json`. A published presentation for Deck A must use Deck A's translations, not a shared store.

## What to do

In `buildFrozenPresentation()` (server.js ~line 3618):

1. The presentation's `deckId` is already available: `var presDeck = getDeckConfig(presentation.deckId || 'default')`.

2. Replace the global read:
   ```javascript
   // Before:
   var translationsData = isMultiLang ? JSON.parse(fs.readFileSync(TRANSLATIONS_PATH, 'utf8')) : null;

   // After:
   var translationsData = isMultiLang ? readTranslations(presentation.deckId || 'default') : null;
   ```

3. The rest of `bakeLanguageSpans()` is unchanged — it already uses `translationsData.slides[librarySlideId]` which is the correct per-slide structure.

## Files

- `server.js` — `buildFrozenPresentation()` function, ~line 3635

## Depends on
Task 1 (per-deck files + `readTranslations` helper)

## Blocks
Nothing — standalone change once Task 1 is done.

## Implementation Summary

**Problem:** `buildFrozenPresentation()` in `server.js` (line ~3642) read translations using `JSON.parse(fs.readFileSync(TRANSLATIONS_PATH, 'utf8'))` — the single global file. When building a frozen HTML for Presentation A (on Deck A) and Presentation B (on Deck B), both would get the same translation data regardless of which deck owned the translations.

**Fix:** Replaced the direct `fs.readFileSync(TRANSLATIONS_PATH)` call with `readTranslations(presentation.deckId || 'default')` — the helper added in Task 1 that resolves the correct per-deck path. `presentation.deckId` is already set in every presentation record in `presentations.json`, so no additional data changes were needed.

**Line changed:** `server.js` line ~3642:
```javascript
// Before:
var translationsData = isMultiLang ? JSON.parse(fs.readFileSync(TRANSLATIONS_PATH, 'utf8')) : null;

// After:
var translationsData = isMultiLang ? readTranslations(presentation.deckId || 'default') : null;
```

The rest of `bakeLanguageSpans()` was untouched — it already operates correctly on `translationsData.slides[librarySlideId]`, which is the same structure in both the old global file and the new per-deck files.
