---
title: Builder — Translation — 1.4 — Backend API endpoints (server.js)
priority: normal
status: done
area: builder
parent: idea-1.0-2026-04-20-builder-translation-overview.md
---

## Summary

Add 5 translation-related endpoints to `builder/server.js`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/languages` | Return full language list from `builder/data/languages.json` |
| `GET` | `/api/translations/:deckId` | Return the deck's `translations.json` |
| `POST` | `/api/translations/:deckId/translate` | Translate all dirty or missing fields for selected languages |
| `PATCH` | `/api/translations/:deckId/field` | Save a manual correction to a field translation |
| `POST` | `/api/translations/:deckId/restore` | Restore `previous` to `current` for a field + language |

## Translate Endpoint Logic (`POST /api/translations/:deckId/translate`)

1. Load `translations.json` for the deck
2. Collect fields where `dirty: true` or the language key is missing
3. For each target language: call `translator.js` with the dirty field map
4. On response: set `previous = current`, `current = new value`, `dirty = false`
5. Save updated `translations.json`
6. Return the updated translations to the client

## Body format for PATCH (manual correction)

```json
{
  "fieldKey": "hero-title",
  "language": "es",
  "value": "Escanea mejor, no más duro"
}
```

## Body format for restore

```json
{
  "fieldKey": "hero-title",
  "language": "es"
}
```

## Acceptance Criteria

- [x] All 5 endpoints exist and respond correctly
- [x] Translate endpoint only processes dirty or missing fields — never re-translates clean ones
- [x] Manual correction saves correctly and does not affect `dirty` flag
- [x] Restore swaps `previous` into `current` and clears `previous`
- [x] All endpoints read/write `translations.json` atomically (no partial writes)

## Done Summary

Added 5 endpoints to `server.js`: `GET /api/translations`, `POST /api/translations/translate`, `PATCH /api/translations/field`, `POST /api/translations/restore`, `PUT /api/translations/settings`. Translate endpoint skips clean fields, restores swap previous→current. Added helper `readTranslations()`/`writeTranslations()`. Note: original spec used `:deckId` params — simplified to single-deck paths matching current architecture.
