---
title: Builder — Translation — 1.8 — Language switcher for finished presentations
priority: normal
status: done
area: builder
parent: idea-1.0-2026-04-20-builder-translation-overview.md
---

## Summary

Create a client-side language switcher that is embedded into every finished presentation. It allows the end viewer to switch between available languages without any server — fully static.

## File

`slides/shared/language-switcher.js`

## How It Works

At Create time, every `[data-edit]` field is rendered as multiple `<span>` elements — one per language — with only the default language visible:

```html
<span data-lang="es">Escanea mejor, no más duro</span>
<span data-lang="en" hidden>Scan smarter, not harder</span>
<span data-lang="it" hidden>Scansiona in modo più intelligente</span>
```

The `language-switcher.js` script:
1. On load: reads `?lang=` URL param or `localStorage` to determine active language (falls back to default)
2. Shows `[data-lang="active"]` spans, hides all others
3. Footer buttons call the switcher to change the active language
4. Saves the chosen language to `localStorage` so it persists across slides

## Footer Language Switcher UI

- Injected into the finished HTML at Create time
- One button per available language
- Active language button is highlighted
- Positioned in the presentation footer

## Acceptance Criteria

- [x] `slides/shared/language-switcher.js` exists and works standalone (no server)
- [x] Language is read from URL param or localStorage on load
- [x] Switching language updates all `[data-lang]` spans instantly
- [x] Selection persists in localStorage
- [ ] Footer buttons are injected at Create time with correct language labels (handled in task 1.9)

## Done Summary

Created `builder/features/slides/components/language-switcher.js` (adapted path to match project structure). Reads active lang from `?lang=` → `localStorage` → `data-default-lang` body attribute. `applyLang()` shows/hides `[data-lang]` spans and highlights `.lang-switcher-btn.active`. `window.switchLang(lang)` exposed for footer buttons. Falls back to default lang if stored lang is unavailable.
