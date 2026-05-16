---
title: Translation System — Migrate Server Endpoints to Per-Deck
type: Feature
priority: H
status: done
area: builder
---

Update every `/api/translations/*` endpoint in `server.js` to read and write from the active deck's `translations.json` file instead of the global one.

## Why

After Task 1 creates per-deck files, nothing will actually use them until the endpoints are wired up. This task does that wiring.

## Endpoints to update (all in server.js)

| Endpoint | Change |
|----------|--------|
| `GET /api/translations` | Read from `readTranslations(getActiveDeckId())` |
| `PUT /api/translations/settings` | Write languages/defaultLanguage to active deck's file |
| `PATCH /api/translations/field` | Write per-field translation to active deck's file |
| `POST /api/translations/restore` | Restore from active deck's file |
| `POST /api/translations/translate` | AI translate fields in active deck's file |
| `POST /api/translations/translate-all` | AI translate all dirty/missing in active deck's file |
| `GET /api/translations/fields-summary` | Read summary from active deck's file |
| `markSlideTranslationsDirty()` | Mark dirty in active deck's file |

## Notes

- `getActiveDeckId()` already exists and returns the current deck ID.
- Each endpoint currently reads via `fs.readFileSync(TRANSLATIONS_PATH)` — replace with `readTranslations(getActiveDeckId())`.
- Each endpoint currently writes via `fs.writeFileSync(TRANSLATIONS_PATH, ...)` — replace with `writeTranslations(data, getActiveDeckId())`.
- `markSlideTranslationsDirty()` is called from save hooks — it needs the deckId passed in or read from `getActiveDeckId()`.

## Files

- `server.js` — all `/api/translations/*` route handlers

## Depends on
Task 1 (per-deck files + helpers)

## Blocks
Task 4 (cleanup)

## Implementation Summary

**Problem:** Every translation endpoint read and wrote to the global `builder/data/translations.json`, meaning all decks shared one translation store. Deck A's Spanish edits would silently overwrite Deck B's translations for the same library slide.

**Changes made to `server.js`:**

- **`markSlideTranslationsDirty(librarySlideId, edits, deckId)`** — added `deckId` as a third parameter. Internally calls `readTranslations(deckId || getActiveDeckId())` and `writeTranslations(t, deckId || getActiveDeckId())`. The call site at the deck-slide edits endpoint (`/api/deck/slides/:id/edits`, line ~3327) now passes `activeDeckId` explicitly.

- **`GET /api/translations`** — changed to `readTranslations(getActiveDeckId())`.

- **`POST /api/translations/translate`** — added `const deckId = getActiveDeckId()` at top; reads/writes use `deckId`. Also removed the dead "Global mode" block (lines that iterated `t.fields` for non-slide-scoped fields) — this code path was unreachable in normal operation and `t.fields` no longer exists in the per-deck schema.

- **`PATCH /api/translations/field`** — added `deckId = getActiveDeckId()`, reads/writes use `deckId`. Removed the else-branch that wrote to `t.fields[fieldKey]` (dead code). Now requires `slideId` in the request body — returns 400 if missing, since per-deck storage is always per-slide.

- **`POST /api/translations/restore`** — added `deckId`, requires `slideId`. Removed the global `t.fields` restore branch.

- **`GET /api/translations/fields-summary`** — changed to `readTranslations(getActiveDeckId())`.

- **`POST /api/translations/translate-all`** — added `var deckId = getActiveDeckId()` at top; final `writeTranslations(t)` changed to `writeTranslations(t, deckId)`.

- **`PUT /api/translations/settings`** — added `deckId = getActiveDeckId()`; reads/writes use `deckId`. Language settings (active languages, default language, favorites) are now per-deck.

- **Legacy `/api/save` dirty-flag block** (line ~5992) — updated `readTranslations()` → `readTranslations(_legacyDeckId)` and `writeTranslations(t)` → `writeTranslations(t, _legacyDeckId)`. Guarded the `t.fields` access with `if (t.fields)` so it's a safe no-op in the per-deck schema. Full cleanup deferred to Task 4.

**Verification:** Final grep for bare `readTranslations()` and `writeTranslations(t)` found zero remaining unparameterised calls. Only `TRANSLATIONS_PATH` constant and its two uses inside the helper fallback remain.
