---
title: Translation — Dirty Flag — Auto-mark translations dirty when English text is edited
type: Feature
priority: H
status: done
area: builder
---

When a user edits an English (base language) field and saves it, any existing translations for that field+slide combination should be automatically marked dirty. This ensures the translation badge and Translation Center always reflect what has changed since the last translation run, and the AI translator only re-translates what genuinely changed.

Currently the dirty flag is only set during the translate flow. If the user edits English text after translating, the translations become stale with no visual indication.

Changes needed:

**Server side:**
- After a `data-edit` save (the existing slide edits save flow), check if `translations.slides[slideId][fieldKey]` has any non-English entries
- If yes, set `dirty: true` on each language entry for that field and write translations.json
- This can be a new helper `markTranslationsDirty(slideId, fieldKey)` called from the save handler

**Client side:**
- After a successful save of an editable field, call the server to dirty the related translations (or extend the existing save endpoint to do this automatically)
- `updateTranslateBadge()` should be called after any dirty-marking to refresh the badge count
- Translation Center table (task 8) rows for that field should visually update to show dirty state

Depends on: tasks 1, 2, 3
