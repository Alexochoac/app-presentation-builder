---
title: Translation System — Per-Deck Translation Files
type: Feature
priority: H
status: done
area: builder
---

Migrate from one global `builder/data/translations.json` to a per-deck file at `builder/data/decks/[deckId]/translations.json`. This is the foundation task — all other translation refactor tasks depend on it.

## Why

Right now all decks share a single translation store. If Deck A and Deck B both use `lib-company`, they read and write to the same translation entries. Deck A's Spanish edits overwrite Deck B's. There is no isolation.

## What to do

1. Create a `translations.json` inside each existing deck folder with the correct empty schema:
   ```json
   { "languages": ["en"], "defaultLanguage": "en", "slides": {} }
   ```
   Existing decks: `default/`, `deck-1778880857630-ppqka/` (TEST), and any others in `builder/data/decks/`.

2. In `server.js`, replace the single `TRANSLATIONS_PATH` constant with a helper:
   ```javascript
   function getTranslationsPath(deckId) {
     return path.join(__dirname, 'data', 'decks', deckId, 'translations.json');
   }
   ```

3. Add `readTranslations(deckId)` and `writeTranslations(data, deckId)` helpers that read/write from `getTranslationsPath(deckId)`, creating the file with the empty schema if it doesn't exist.

4. The active deck ID is already available via `getActiveDeckId()` in most routes.

5. Keep the old global `builder/data/translations.json` in place as a backup — do not delete it yet (Task 4 handles cleanup).

## Files

- `server.js` — replace `TRANSLATIONS_PATH`, add helpers
- `builder/data/decks/default/translations.json` — create
- `builder/data/decks/deck-1778880857630-ppqka/translations.json` — create
- Any other deck folders in `builder/data/decks/`

## Depends on
Nothing — this is the foundation.

## Blocks
Task 2 (endpoints), Task 3 (bakeLanguageSpans), Task 4 (cleanup)

## Implementation Summary

**Problem:** A single global `builder/data/translations.json` was shared across all decks. Any deck editing a shared slide's translation would overwrite another deck's work on the same slide.

**Files changed:**

- **`builder/server.js`**
  - Kept `TRANSLATIONS_PATH` as a legacy fallback constant (line 3071), with a comment marking it as such.
  - Added `getTranslationsPath(deckId)` helper (line 3073–3075) that resolves `builder/data/decks/[deckId]/translations.json`.
  - Updated `readTranslations(deckId)` (line 5428): accepts optional `deckId`; uses per-deck path when provided, falls back to the legacy global file when omitted so callers not yet migrated (Task 2) keep working. Returns empty schema `{ languages: ['en'], defaultLanguage: 'en', slides: {} }` if the file is missing.
  - Updated `writeTranslations(data, deckId)` (line 5437): same optional `deckId` pattern — writes to per-deck file when provided, legacy file when omitted.

- **`builder/data/decks/default/translations.json`** — created by copying the full existing global `translations.json` so all prior translation work for the default deck is preserved (40 slides, EN+ES entries).

- **`builder/data/decks/deck-1778880857630-ppqka/translations.json`** (TEST deck) — created with empty schema `{ languages: ["en"], defaultLanguage: "en", slides: {} }`. The global file only had `{}` for this deck's one slide anyway.

- **`builder/data/decks/deck-1778869312222-udndh/translations.json`** (third deck) — created with empty schema. Slides in this deck had no translations in the global file.

**Design decision:** `readTranslations`/`writeTranslations` use optional `deckId` so existing callers keep working without changes until Task 2 migrates each endpoint individually. No breaking changes introduced in this task.
