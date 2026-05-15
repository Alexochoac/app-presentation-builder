---
title: Translation — Translation Center — Full table view of all slides, all fields, all languages
type: Feature
priority: H
status: done
area: builder
---

Build a "Translation Center" screen — a full-screen table where the user can see and edit all translations across all slides and all languages in one place.

**Table layout:**
- Rows = all translatable fields, grouped by slide (slide name as section header)
- Columns = English (read-only reference) + one column per active language
- Each non-English cell shows the current translation (editable inline) or is empty/red if missing
- Dirty cells (English changed since last translation) highlighted in orange

**Actions:**
- Clicking any non-English cell opens an inline editor — saves via PATCH /api/translations/field on blur
- "Translate All" button — runs POST /api/translations/translate for every slide and every active language in one batch, only targeting missing or dirty fields (smart translate, not a full overwrite)
- Filter/search bar to find a field by keyword across all slides
- Badge on the Translation Center entry point shows total dirty + missing count (same data as the existing updateTranslateBadge)

**How to populate the table:**
- Load all slides from /api/deck to get slideId + slide name per row
- Load translations from /api/translations to get existing values and dirty flags
- For the English column, read the current `data-edit` values from the slide-library edits (the source of truth for English text)

**Entry point:**
- A "Translation Center" button inside Translation Settings (replaces the standalone Translate button from task 6)
- OR accessible from the Translation Settings modal as a full-screen panel

Depends on: tasks 1, 2, 3, 6, 7
