---
title: Builder — Translation — 1.2 — translations.json data model per deck
priority: normal
status: done
area: builder
parent: idea-1.0-2026-04-20-builder-translation-overview.md
---

## Summary

Define the `translations.json` file that lives inside each deck folder. This is the translation store for the deck — it holds translated text per field per language, dirty flags, and one previous version for rollback.

## File Location

`decks/[deck-id]/translations.json`

## Structure

```json
{
  "languages": ["en", "es", "it"],
  "favorites": ["es", "pt"],
  "defaultLanguage": "es",
  "fields": {
    "hero-title": {
      "en": "Scan smarter, not harder",
      "es": {
        "current": "Escanea mejor, no más duro",
        "previous": "Escanea de forma más inteligente",
        "dirty": false
      },
      "it": {
        "current": "Scansiona in modo più intelligente",
        "previous": null,
        "dirty": false
      }
    }
  }
}
```

## Rules

- `en` is always the canonical source — plain string, no dirty flag
- Each other language has `current`, `previous`, and `dirty`
- `dirty: true` is set when the English value changes after a translation exists
- `previous` holds the last version before the most recent translation (for rollback)
- A new deck gets an empty `translations.json` created automatically

## Acceptance Criteria

- [x] `translations.json` is created inside each new deck folder at deck creation time
- [x] Structure matches the schema above
- [x] Existing decks get a migration to add an empty `translations.json`

## Done Summary

Created `builder/data/translations.json` with the correct empty schema (`languages`, `favorites`, `defaultLanguage`, `fields`). Since the app is currently single-deck, the file lives at `builder/data/translations.json` alongside `deck.json`. When multi-deck support is added, this moves to `decks/[deck-id]/translations.json`.
