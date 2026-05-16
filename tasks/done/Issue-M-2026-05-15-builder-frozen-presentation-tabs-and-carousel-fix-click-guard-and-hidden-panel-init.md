---
title: Builder — Frozen Presentation — Tabs and Carousel — Fix click guard and hidden-panel init
type: Issue
priority: M
status: done
area: slides
---

Two bugs in `tabs.js` and `carousel.js` broke tab switching and carousel navigation in frozen presentations when `bakeLanguageSpans` was active.

**Bug 1 — tabs.js click guard too strict:**
`wireTab` had `if (e.target !== tabBtn) return;` to prevent delete-button clicks from switching tabs. After `bakeLanguageSpans` wraps tab button text in `<span data-lang>` elements, clicking the tab text sets `e.target` to the span (not the button), so the guard fires and the tab never switches. Clicking the button's padding edge still worked — explaining "intermittent" behavior.

Fix: Changed guard to `if (e.target.closest && e.target.closest('.ls-tab-del')) return;` — only bails for actual delete-button clicks, ignores all other children.

**Bug 2 — carousel.js hidden-panel zero-width init:**
`Carousel.init(root)` runs on the full slide before `Tabs.init`, reaching carousels inside hidden tab panels (`display:none`). Those carousels have `offsetWidth = 0`, so `goTo()` calculates all positions as 0px. Worse, `_lsCarouselInit = true` is set immediately, blocking proper re-initialization when the panel becomes visible via `Tabs.switchTo`.

Fix: Added `if (!el.offsetWidth) return;` in `initOne` before the `_lsCarouselInit` flag — defers initialization without marking the element as done. When `Tabs.switchTo` calls `Carousel.init(activePanel)` on the now-visible panel, `initOne` runs with correct width.

Files changed: `builder/features/slides/components/tabs.js`, `builder/features/slides/components/carousel.js`. Re-saving a frozen presentation is required to pick up the inlined JS changes.

## Implementation Summary

**Problem:** In frozen presentations with multi-language content (where `bakeLanguageSpans` had run), tabs worked intermittently and carousels inside non-default tab panels failed to navigate.

**Root causes found:**

1. `tabs.js` `wireTab()` — The click handler guarded with `if (e.target !== tabBtn) return;` to prevent the nested `.ls-tab-del` delete button from triggering a panel switch. However, `bakeLanguageSpans` in `buildFrozenPresentation` (server.js) wraps all `[data-edit]` text content in `<span data-lang="en">` / `<span data-lang="es" hidden="">` elements. Tab buttons (e.g. `[data-edit="tab-howitworks"]`) have only text children after builder-only stripping, so they are not skipped by the complex-field guard — their text gets wrapped. In the frozen presentation, clicking the visible tab label hits the `<span data-lang="en">` span, not the `<button>` element, so `e.target !== tabBtn` is true and the switch never fires. Only clicks on the button's padding edge (where no child element exists) reached `switchTo()`.

2. `carousel.js` `initOne()` — The frozen presentation's `initSlide()` calls `Carousel.init(root)` before `Tabs.init(root)`. This traverses all `.ls-carousel` elements in the slide, including those inside inactive tab panels (`display:none`). Those panels have `offsetWidth = 0`, so `goTo(0)` computes `0 * -0 = 0px` for all slides — navigation appears to work (prev/next buttons are added) but no visual movement occurs. Additionally, `el._lsCarouselInit = true` is set immediately, so when `Tabs.switchTo()` later calls `Carousel.init(activePanel)` on the now-visible panel, `initOne` returns early without re-sizing.

**Files changed:**
- `builder/features/slides/components/tabs.js` — line 217: changed `if (e.target !== tabBtn) return;` to `if (e.target.closest && e.target.closest('.ls-tab-del')) return;`
- `builder/features/slides/components/carousel.js` — after line 126 (`if (el._lsCarouselInit) return;`): added `if (!el.offsetWidth) return;` without setting the init flag, so deferred carousels are re-attempted when their panel becomes visible.

**Note:** Component JS is inlined into frozen presentations at save time. Existing frozen presentations need to be re-saved from the builder to pick up these fixes.
