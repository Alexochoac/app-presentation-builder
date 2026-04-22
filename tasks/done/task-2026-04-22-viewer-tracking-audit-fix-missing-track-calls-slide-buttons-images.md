---
title: Viewer — Tracking — Audit and fix missing Track calls in slide-specific buttons and images
priority: normal
status: done
area: viewer
---

Some slide components still have untracked or incorrectly tracked interactions. Buttons embedded in individual slide HTML files (not covered by shared component JS files) may not have Track.click() calls, and images with data-zoom outside standard ls-carousel structures may not fire Track.zoom().

Audit all slide-*.html files in builder/features/slides/ for:
1. Any user-facing button or clickable element without a Track.* call
2. Any onclick or addEventListener('click') that doesn't fire tracking
3. Images with data-zoom that are not inside a standard ls-carousel or ls-tabs structure

Already fixed: slide-06-surface.html defect buttons, slide-09-logo-check.html tag clicks.
Still needs verification: slide-03-why.html, slide-04-capability.html, slide-05-technology.html, and any other slides with custom JS interactions.

## Implementation Summary

**Problem:** Several slide HTML files had custom JS interactions (onclick handlers, addEventListener) that fired UI logic but never called Track.click() or Track.event(), leaving those user actions invisible in analytics.

**Audit scope:** All 15 slide files in `builder/features/slides/` were reviewed. Slide-05 was already well-covered. Placeholder images (slides 10–12, CostOfQualityDefects.png) were intentionally skipped as they are not real content.

**Files changed and specific fixes:**

### slide-03-why.html
All interactive list-management buttons were completely untracked. Added:
- `hideBtn.onclick` → `Track.click(Track.slideId(hideBtn), { component: 'why-list', action: 'hide' })`
- `chip.onclick` (both new and pre-existing chips) → `Track.click(Track.slideId(chip), { component: 'why-list', action: 'restore' })`
- `addBtn.onclick` → `Track.click(Track.slideId(addBtn), { component: 'why-list', action: 'add' })`

### slide-04-linescanner.html
Four custom button/modal interactions were untracked. Added:
- `ls4ToggleCard()` → `Track.click` with `component:'process-card', action:'toggle', label:<card label>`
- `ls4MoveCard()` → `Track.click` with `component:'process-card', action:'move', label:'up'|'down'`
- `ls4OpenAutoModal()` → `Track.click` with `component:'auto-modal', action:'open'`
- `ls4CloseAutoModal()` → `Track.event` with `component:'auto-modal', action:'close'`

### slide-07-dimension.html
`ls7OpenTolerances()` had no tracking despite its sibling `ls7OpenConveyor()` already using `Track.event`. Added:
- `ls7OpenTolerances()` → `Track.event('ls7:expand:tolerances')` mirroring the conveyor pattern

### slide-14-cta.html
WhatsApp and email CTA buttons used only `data-umami-event` attributes with no Track.* calls. Added click listeners:
- `.cta-btn-wa` → `Track.click` with `component:'cta', label:'whatsapp', action:'click'`
- `.cta-btn-email` → `Track.click` with `component:'cta', label:'email', action:'click'`
