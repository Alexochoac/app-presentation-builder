---
title: Translation — Data Model — Migrate translations.json to per-slide storage
type: Feature
priority: H
status: done
area: builder
---

Root fix for all translation inconsistency issues. Currently translations.json stores one value per field key globally (e.g. one "headline" for all 12 slides). Every slide uses different values for shared keys like headline, section-label, tabs, ben-list, tagline — so translations bleed between slides, and whichever slide ran the translator last "wins" for that key.

Redesign the data model to store translations keyed by slideId + fieldKey:

Current shape:
  fields["headline"]["es"] = { current: "...", dirty: false }

New shape (option A — nested by slide):
  slides["lib-company"]["headline"]["es"] = { current: "...", dirty: false }

Migration steps:
1. Update translations.json schema — add a "slides" object alongside or replacing "fields"
2. Update GET /api/translations to return the new shape
3. Update POST /api/translations/save to write per-slide
4. Update POST /api/translations/translate to operate in slide context
5. Update the dirty-flag logic to track per-slide
6. Keep a "global" fallback for fields that are truly shared (e.g. credit, badge) to avoid redundant storage

This is a prerequisite for tasks 2, 3, and 4 in this folder.
