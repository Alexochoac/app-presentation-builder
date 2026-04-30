---
title: Builder — Translation — 1.5 — Dirty flag hook on field save
priority: normal
status: done
area: builder
parent: idea-1.0-2026-04-20-builder-translation-overview.md
---

## Summary

Hook into the existing field save flow in `builder/server.js` so that whenever an English field value changes, all existing translations for that field are marked as `dirty: true`.

## How It Works

When a `data-edit` field is saved:
1. Load the deck's `translations.json`
2. Find the field entry by key
3. Compare the new English value to the stored `en` value
4. If different: update `en` to the new value, set `dirty: true` for every translated language that has a `current` value
5. Save `translations.json`

## Notes

- Only marks dirty if a translation already exists — no point flagging a language that has never been translated
- Does not trigger re-translation automatically — just flags it
- The builder UI reads these flags to show the "X fields need translation" badge

## Acceptance Criteria

- [x] Saving an edited field updates `en` in `translations.json`
- [x] All languages with existing translations for that field are marked `dirty: true`
- [x] Fields with no existing translation for a language are not affected
- [x] `translations.json` is saved after every field edit

## Done Summary

Added dirty-flag hook inside `POST /api/save` in `server.js`. After writing the slide HTML, it reads `translations.json`, compares the new English value to the stored `en`, updates it, and sets `dirty: true` for all languages that already have a `current` translation for that field. Errors are caught and warned without failing the save.
