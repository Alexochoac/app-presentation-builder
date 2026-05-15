---
title: Builder — Translation — Finished Presentation — Bake language spans and inject switcher
type: Feature
priority: H
status: pending
area: build-deploy
---

At Create time, wrap every translated `[data-edit]` field in `<span data-lang="xx">...</span>` tags for each selected language, inject `language-switcher.js` into the output HTML, and add a footer language switcher UI (one button per language). If any selected language has dirty or missing translations, call `POST /api/translations/translate` before generating the HTML. Single-language presentations should have no switcher injected.

## What needs to happen
1. Update `POST /api/presentations` in `server.js` to read `languages` and `defaultLanguage` from the request payload
2. For each `[data-edit]` field in the assembled HTML: replace the single value with `<span data-lang="xx">...</span>` per language
3. Set `data-default-lang` on the `<body>` tag
4. Inject `<script src="...language-switcher.js">` (or inline it) into the output HTML
5. Inject a footer language switcher bar with one button per language

## Dependencies
- `builder/features/slides/components/language-switcher.js` — already built (task 1.8)
- `builder/data/translations.json` — already stores all translations
- Language picker in Create modal — already built (task 1.9)
