---
title: Builder — Translation — 1.1 — Static languages list (languages.json)
priority: normal
status: done
area: builder
parent: idea-1.0-2026-04-20-builder-translation-overview.md
---

## Summary

Create a static JSON file listing all world languages. This file powers the language selector dropdowns in the builder and at Create time.

## File

`builder/data/languages.json`

## Structure

```json
{
  "languages": [
    { "code": "en", "name": "English" },
    { "code": "es", "name": "Spanish" },
    { "code": "pt", "name": "Portuguese" },
    { "code": "it", "name": "Italian" }
  ]
}
```

## Notes

- Include all ISO 639-1 world languages
- Favorites are stored per-deck in `translations.json` — not here
- This file is read-only, never modified by the app

## Acceptance Criteria

- [x] `builder/data/languages.json` exists with all world languages
- [x] Each entry has `code` (ISO 639-1) and `name` (English label)
- [x] `GET /api/languages` endpoint returns this list

## Done Summary

Created `builder/data/languages.json` with 103 world languages (ISO 639-1 codes + English names). Added `LANGUAGES_PATH` constant and `GET /api/languages` endpoint to `builder/server.js`.
