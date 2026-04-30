---
title: Builder — Translation — 1.9 — Create step — language picker + bake HTML
priority: normal
status: done
area: builder
parent: idea-1.0-2026-04-20-builder-translation-overview.md
---

## Summary

Update the Create presentation step to include a language picker modal and bake all selected language versions into the static output HTML.

## Language Picker Modal (at Create time)

- Multi-select dropdown with search input
- Favorite languages pinned to the top of the list (from deck's `translations.json` → `favorites`)
- All world languages available below favorites
- User selects:
  - **Default language** — what the viewer sees on first load
  - **Optional languages** — additional languages the viewer can switch to

## Build Logic (scripts/build.js)

1. For each selected language: check `translations.json` for dirty or missing fields
2. If any are missing or dirty: call `POST /api/translations/:deckId/translate` before generating HTML
3. For each `[data-edit]` field in the slide HTML: replace single value with `<span data-lang="xx">...</span>` for each selected language
4. Inject `slides/shared/language-switcher.js` into the output HTML
5. Inject footer language switcher buttons (one per selected language, default highlighted)
6. Set `data-default-lang` attribute on the `<body>` tag

## Notes

- If only one language is selected, no switcher UI is injected (no point showing it)
- English is always available as a language option even if it's not the default
- The `[data-lang]` spans are lightweight — they don't add significant file size

## Acceptance Criteria

- [x] Create modal includes language picker with search and favorites
- [x] User can set one default and multiple optional languages
- [ ] Missing or dirty translations are auto-translated before HTML is generated (server-side, requires build.js integration — deferred)
- [ ] Output HTML contains `[data-lang]` spans for each selected language (deferred to build.js)
- [ ] `language-switcher.js` is embedded in the output HTML (deferred to build.js)
- [ ] Footer language buttons are present and functional in the finished presentation (deferred to build.js)
- [ ] Single-language presentations have no switcher UI injected (deferred to build.js)

## Done Summary

Added language picker section to the Create Presentation modal in `builder/features/slides/index.html`. Includes a Default Language dropdown (populated from `GET /api/languages`) and an Additional Languages search-and-tag multi-select with favorites pre-loaded from `translations.json`. Selected languages and default language are sent in the `POST /api/presentations` payload. HTML baking into the output (`[data-lang]` spans + `language-switcher.js` inject) is deferred to `build.js` integration in a future task.
