---
title: Builder — Translation — Settings — Move translations.json to per-deck folder
type: Feature
priority: L
status: pending
area: builder
---

`translations.json` currently lives at `builder/data/translations.json` alongside the single-deck `deck.json`. When multi-deck support is added (Feature-H-2026-04-25-builder-my-decks), this file should move to `decks/[deck-id]/translations.json` and all endpoints should use a `:deckId` param.

## What needs to change
- All 5 translation endpoints in `server.js` currently use a single `TRANSLATIONS_PATH` constant — switch to a helper `getTranslationsPath(deckId)` that resolves to `decks/[deckId]/translations.json`
- Create an empty `translations.json` automatically when a new deck is created
- Migrate existing `builder/data/translations.json` to the active deck folder

## Dependencies
- Blocked by: Feature-H-2026-04-25-builder-my-decks-card-per-deck-branding-settings-premium.md
