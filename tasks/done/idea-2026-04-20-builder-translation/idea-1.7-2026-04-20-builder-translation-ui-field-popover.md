---
title: Builder — Translation — 1.7 — Builder UI — Per-field translation popover
priority: normal
status: done
area: builder
parent: idea-1.0-2026-04-20-builder-translation-overview.md
---

## Summary

Extend the existing field edit popover in the builder to include a "Translations" section. When the user clicks any `[data-edit]` field, they can view and correct its translation for each deck language, and restore the previous version if needed.

## UI Behavior

- Existing edit controls remain as-is (English source editing)
- New "Translations" tab or section below the English field
- For each deck language (excluding English):
  - Language label (e.g. "Spanish")
  - Current translation text — editable inline
  - If `dirty: true` — show a small warning indicator ("outdated")
  - If `previous` exists — show a "Restore previous" link with the previous text as a tooltip
- Saving a manual correction calls `PATCH /api/translations/:deckId/field`
- Clicking "Restore previous" calls `POST /api/translations/:deckId/restore`

## Notes

- If a language has no translation yet, show placeholder text "Not yet translated"
- Dirty indicator should be visually subtle — small orange dot or text, not alarming
- Popover should not grow too large — consider a scrollable section if many languages

## Acceptance Criteria

- [x] Field popover shows translations section for all deck languages
- [x] Each language shows current translation (editable) + dirty indicator if applicable
- [x] "Restore previous" is visible and functional when a previous version exists
- [x] Manual correction is saved on blur or explicit save action
- [x] Popover reflects updated state after translate or restore actions

## Done Summary

Added `#translationPanel` fixed panel to `preview.html`. Clicking any `[data-edit][contenteditable]` field opens the panel for that field key. Each deck language shows its current translation (editable textarea), an orange dot if dirty, and a "Restore" button if a previous version exists. Saves on blur via `PATCH /api/translations/field`. Restore calls `POST /api/translations/restore`.
