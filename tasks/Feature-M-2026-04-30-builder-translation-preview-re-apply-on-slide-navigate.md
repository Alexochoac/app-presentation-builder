---
title: Builder — Translation — Preview — Re-apply language on slide navigate
type: Feature
priority: M
status: pending
area: builder
---

When previewing in a non-English language and navigating to a lazy-loaded slide, the language isn't applied because the timing is off between slide load and translation apply.

## Context (2026-05-30 update)
The translation architecture has changed significantly since this was written. Translations are now stored as per-deck files (`data/decks/[deckId]/translations/[lang].json`) and the frozen presentation output bakes in language spans (`<span data-lang="en">...</span>`) with a client-side switcher. However, the **builder preview** still uses a live `applyPreviewLang()` call to swap visible content — so the race condition between lazy-load and language apply still exists.

## Fix
The fix approach is still valid but must target the current `injectSlide` function in `preview.html`:
- Call `applyPreviewLang` after all component `init()` calls in `injectSlide` complete (preferred)
- Or dispatch a custom `slide-ready` event at end of `injectSlide` and listen for it in the language switcher

Do NOT apply the fix to the frozen presentation output — those use the baked span-switcher and are unaffected.
