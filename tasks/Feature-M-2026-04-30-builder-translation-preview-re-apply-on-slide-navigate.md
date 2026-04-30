---
title: Builder — Translation — Preview — Re-apply language on slide navigate
type: Feature
priority: M
status: pending
area: builder
---

When previewing in a non-English language and navigating to a slide that hasn't been loaded yet (lazy-loaded), the language is applied via a `setTimeout` in `injectSlide`. This is fragile — if the slide takes longer than 50ms to render components (carousel, tabs, etc.), the language apply runs before the fields are ready and does nothing. The user has to navigate away and back to see translations.

## Fix
Instead of `setTimeout(50)`, listen for a reliable signal that the slide is fully rendered before calling `applyPreviewLang`. Options:
- Call `applyPreviewLang` after all component `init()` calls in `injectSlide` complete
- Use `requestAnimationFrame` after component init
- Trigger a custom `slide-ready` event at the end of `injectSlide` and listen for it in the language switcher
