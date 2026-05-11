---
title: Translation — Build/Publish — Language selection modal before publishing a finished presentation
type: Feature
priority: H
status: done
area: build-deploy
---

When the user builds or publishes a presentation, they should be able to choose which languages to include and which language should be the default in the finished presentation.

**Pre-publish modal:**
- Appears when user clicks Build / Publish
- Fetches available languages from /api/translations — only languages that have at least some translations appear as options (no point offering a language with zero coverage)
- English is always available (it's the base)
- Checkboxes for each available language to include in the output
- Radio or dropdown to select the default language shown when a viewer opens the presentation (can be English or any included additional language)
- Confirm button passes `{ defaultLanguage, languages: [...] }` to the existing POST /api/presentations endpoint (backend already supports this — no backend changes needed)

**Finished presentation output:**
- The language switcher baked into the HTML only shows the languages the user selected
- Default language span is visible, all others are hidden on load
- switchLang() function and per-lang CSS already work — this task is purely the pre-publish UI

**Edge case:**
- If no additional languages are selected, build as English-only (no language switcher rendered — same as today)

Depends on: tasks 1, 2, 3, 8 (need translation coverage before this is useful)
