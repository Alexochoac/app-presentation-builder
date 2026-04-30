---
title: Builder — Translation — Badge — Fix overcounts non-translatable fields
type: Issue
priority: M
status: pending
area: builder
---

The "Translate" button badge shows an inflated count (e.g. 768) because it counts image fields, logo fields, and other non-text `[data-edit]` keys that were seeded into `translations.json` but can't meaningfully be translated. The badge should only count fields that have a `contenteditable` attribute on the slide — i.e. actual text fields.

## Fix
- In `updateTranslateBadge()` in `preview.html`: cross-reference the field keys against `[data-edit][contenteditable]` elements currently in the DOM before counting
- In the seed script / dirty-flag hook in `server.js`: skip keys that correspond to image src fields (e.g. keys ending in `-src`, `-image-*`, `customer-logo`)
- Consider a `skipKeys` allowlist in `translations.json` or a convention (e.g. image edit keys never get added to translations)
