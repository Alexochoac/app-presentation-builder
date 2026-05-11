---
title: Translation — Coverage — Verify full translation coverage after Translation Center is built
type: Feature
priority: M
status: pending
area: builder
---

After the Translation Center (task 8) is built and its "Translate All" action works, run a full translation pass and verify coverage across all slides and languages.

Currently many fields are untranslated per-slide — list items, matrix labels, pillar descriptions, pin labels, tag items, carousel captions, etc.

Steps:
1. Use the "Translate All" button in the Translation Center (task 8) to batch-translate all slides and all active languages
2. Review the translation table for any cells still empty or dirty
3. Verify coverage: headline, section-label, tabs, ben-list, prob-list, tagline, pillar-*, pin-*, tag-*, col-item-*, step-* all translated per slide
4. Manually fix any cells where the AI translation is wrong

Depends on: tasks 1, 2, 3, 8
