---
title: Frozen Presentation — Language Switching — Translated content not showing when switching language
type: Issue
priority: H
status: pending
area: builder
---

Switching language in a finished presentation shows no change — all content remains in English even when ES is selected.

---

## What we know about the system

**How translation baking works (`buildFrozenPresentation` in `server.js`):**

1. For each slide, `bakeLanguageSpans($, librarySlideId)` is called after applying edits.
2. It iterates `[data-edit]` elements in the slide HTML.
3. For each element, it reads the English text from `el.html()` and the Spanish translation from `translationsData.slides[librarySlideId][editKey]['es'].current`.
4. It wraps the innerHTML in `<span data-lang="en">` and `<span data-lang="es" hidden="">` sibling spans.
5. In the browser, `language-switcher.js` calls `applyLang(lang)` which sets `el.hidden = true/false` on all `[data-lang]` elements.

**Translation data (`builder/data/translations.json`):**
- Only `lib-company` has actual ES translations (32 fields).
- Other slides have no ES entries — they will show English text regardless of selected language.
- Translation value structure: `{ "es": { "current": "Spanish text", "previous": null, "dirty": true } }`

**Language dropdown (as of this session):**
- Added to the header nav, right after the ‹ 1/N › navigation buttons.
- Implemented in `server.js` (HTML + CSS) and `language-switcher.js` (logic).
- `fpLangToggle()` opens/closes the dropdown. `fpLangSelect(lang)` calls `switchLang(lang)`.

---

## Fixes already applied (may or may not be the root cause)

**Fix 1 — `bakeLanguageSpans` text-node stripping (`server.js` line ~3642):**
`$t.html('body > *')` only selects element children, silently dropping leading text nodes. A translation like `"La inspección de calidad <span class='blue'>es todo lo que hacemos</span>"` was being baked as just `<span class='blue'>es todo lo que hacemos</span>` — the "La inspección de calidad " text was lost.
Fixed: changed to `$t('body').html()` which returns the full innerHTML including text nodes.

**Fix 2 — `[hidden]` CSS override risk (`server.js` CSS block):**
Slide-specific CSS can set `display` on elements, overriding the browser's default `[hidden] { display: none }`. Added `[hidden] { display: none !important; }` to the frozen presentation CSS to guarantee `hidden` always hides.

**Fix 3 — `ul`/`ol` elements wrapped in `<span data-lang>` (invalid HTML):**
`bakeLanguageSpans` was wrapping `<ul data-edit="...">` elements in `<span data-lang>` tags, producing invalid HTML (`<span>` inside `<ul>`). Browsers auto-correct by moving the span outside the list, breaking language switching for those fields. Fixed by adding tag-name check `if (/^(ul|ol)$/i.test(this.tagName)) return;` and adding `li` to the child-element guard.

---

## What still needs investigation

The user confirmed language switching is still not working after the above fixes. Debug steps for next session:

1. **Confirm re-save happened** — All fixes (bakeLanguageSpans, hidden CSS, dropdown JS) are only applied at save time. If the user is viewing an old frozen presentation, none of the fixes are active. Check `presentations.json` for the latest `publishedAt` timestamp.

2. **Inspect the actual frozen HTML for a slide with translations** — Open `finished-presentations/[latest-id]/index.html` and search for `data-lang="es"`. Confirm:
   - Both `data-lang="en"` and `data-lang="es"` spans are present.
   - The ES span has **different content** from the EN span (for `lib-company` fields).
   - The ES span starts with `hidden` attribute.

3. **Confirm `applyLang` is being called** — Open the frozen presentation in a browser, open DevTools console, type `switchLang('es')` manually. Check if `[data-lang="en"]` elements get `hidden` set.

4. **Check if `fpLangSelect` is defined** — In console, type `typeof fpLangSelect`. If `undefined`, the language-switcher.js inlining is failing or the function isn't being exposed.

5. **Check the `allLangs` array used at build time** — In `buildFrozenPresentation`, `allLangs` is built as `[presDefaultLang, ...additionalLangs]`. If `allLangs` only has `['en']`, no ES spans are created. The presentation must have `languages: ['en', 'es']` in `presentations.json` with `defaultLanguage: 'en'`.

6. **Only `lib-company` has Spanish content** — All other slides fall back to English text in their ES spans (no translations entered). The only slide where switching to ES shows visually different content is the Company Intro slide. This is expected behaviour, not a bug — but it might look broken. The real fix is to enter translations for other slides.

---

## Key files

- `builder/server.js` — `buildFrozenPresentation()`, `bakeLanguageSpans()`, frozen HTML/CSS generation
- `builder/features/slides/components/language-switcher.js` — inlined into frozen presentations; handles `applyLang`, `switchLang`, `fpLangToggle`, `fpLangSelect`
- `builder/data/translations.json` — source of all translations by slide ID and field key
- `finished-presentations/[id]/index.html` — the baked output to inspect
