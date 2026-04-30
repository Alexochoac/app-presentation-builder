---
title: Builder — Translation — 1.6 — Builder UI — Translate toolbar button
priority: normal
status: done
area: builder
parent: idea-1.0-2026-04-20-builder-translation-overview.md
---

## Summary

Add a "Translate" button to the builder toolbar in `builder/public/preview.html`. The button triggers translation of all dirty or missing fields across all deck languages in one action.

## UI Behavior

- Button label: "Translate"
- Shows a badge with the count of fields needing translation (e.g. "3 fields need translation")
- Badge is hidden when everything is up to date
- On click: calls `POST /api/translations/:deckId/translate`
- While running: button shows a loading state ("Translating...")
- On success: badge updates to reflect new state (0 if all done)
- On error: show a brief error message near the button

## Badge Logic

- On builder load: fetch `GET /api/translations/:deckId` and count fields with `dirty: true` or missing translations for deck languages
- Re-count after every field save and after every translate action

## Acceptance Criteria

- [x] Translate button visible in the builder toolbar
- [x] Badge shows correct count of fields needing translation
- [x] Clicking translate calls the endpoint and updates the UI on completion
- [x] Loading state prevents double-clicks
- [x] Badge disappears when all fields are translated and clean

## Done Summary

Added "Translate" button with orange badge to `#header-right` in `preview.html`. Badge counts dirty/missing fields across all deck languages. `handleTranslateClick()` calls `POST /api/translations/translate`, shows "Translating…" loading state, updates badge on completion. Translations are loaded on init via `loadTranslations()`.
