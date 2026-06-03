---
title: Builder — Translation — Badge — Fix overcounts non-translatable fields
type: Issue
priority: M
status: pending
area: builder
---

The "Translate" button badge shows an inflated count (e.g. 768) because it counts image fields, logo fields, and other non-text `[data-edit]` keys that can't meaningfully be translated. The badge should only count fields that are actual text fields.

## Context (2026-05-30 update)
The translation system has been refactored since this was written. Translations are now stored in per-deck files at `data/decks/[deckId]/translations/[lang].json` (not a flat `translations.json`). The badge logic needs to be verified against the **current** implementation before applying any fix.

## Before fixing — verify:
- Confirm the badge still overcounts (open the Translations panel in builder and check the number shown)
- Find `updateTranslateBadge()` (or equivalent) in the current codebase — it may have moved or been renamed
- Check what keys are currently seeded into the per-deck translation files (do image keys still get added?)

## Fix approach (once verified)
- Cross-reference translation keys against `[data-edit][contenteditable]` elements in the DOM — only count keys that have a matching editable text field
- In the seeding logic in `server.js`: skip keys that correspond to image src fields (e.g. keys ending in `-src`, `-image-*`, `customer-logo`)
- Consider a convention: image edit keys are never added to translation files at all
