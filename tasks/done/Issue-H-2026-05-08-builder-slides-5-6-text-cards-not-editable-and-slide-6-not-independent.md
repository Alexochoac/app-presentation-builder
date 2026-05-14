---
title: Builder — Slides — Slide 5 & 6 — Fix text cards not editable and slide 6 not independent from slide 5
type: Issue
priority: H
status: done
area: slides
---

Slide 5 has text cards that are not editable in the builder preview (missing or incorrect `data-edit` attributes). Slide 6 was based on slide 5's template but is pulling the same text content as slide 5 instead of having its own independent values — and its text cards are also not editable. Slide 6 must be fully decoupled from slide 5 with its own editable fields.

## Implementation Summary

### Problem

**Slide 5 (Technology):** Text cards inside the tabs panels (panels 0 and 1: `comp-card-1..4`, `feat-card-1..4`, and panel 2 header spans like `vc-header-bad`, `vc-header-good`, `vc-label-drillhole`, `vc-label-igunit`) were rendered with `contenteditable="false"` instead of `contenteditable=""`. This made them visually present but non-editable — clicking on them did nothing.

**Slide 6 (Surface Quality):** Confirmed independent. `lib-surface` has its own `templateId: "tpl-new-defect-gallery"` (separate renderer `renderDefectGalleryLayout`) and its own `deckEdits` values for `section-label`, `headline`, `subtitle`, and all `s6-*` keys. No data sharing with `lib-technology`.

### Root Cause (Slide 5)

The `tabs` blob is saved to `lib-technology.deckEdits[deckId].tabs` via the tabs.js component's save mechanism. At the moment of saving, `tabs.js` had already set `contenteditable="false"` on all inner `[data-edit]` elements (a runtime state used to prevent accidental typing while clicking tabs). This frozen state was captured in the stored blob.

On reload, `applyEditsToBlob(savedEdits['tabs'], savedEdits)` in `renderTechnologyLayout` reconstructed the HTML with `contenteditable="false"` on all inner spans, making them permanently non-editable until the blob was cleared or re-saved.

The same issue could affect any other slide that uses `applyEditsToBlob` with a tabs blob: Company (ls2), LineScanner (ls4), Database (ls10).

### Files Changed

- `builder/server.js` — `applyEditsToBlob` function (~line 729)

### Fix

Added normalization in `applyEditsToBlob`: after applying content edits, any `[data-edit]` element inside the blob that has a `contenteditable` attribute (any value, including `"false"`) is reset to `contenteditable=""`. This ensures that runtime state captured during the blob save never permanently disables editing on reload.

```js
// Blobs are saved with runtime state — tabs.js and other components temporarily
// set contenteditable="false" on inner elements. Normalize back to "" so edits work.
if ($(this).is('[contenteditable]')) {
  $(this).attr('contenteditable', '');
}
```

This fix applies globally to all canvas-rendered slides that use blob-based tabs (`applyEditsToBlob` is called in 4 renderers).

### Slide 6 Independence

Verified independent — no code or data changes needed:
- `lib-surface.templateId = "tpl-new-defect-gallery"` → separate renderer from slide 5
- `lib-surface.deckEdits.default` contains its own `section-label: "Surface Quality"`, `headline`, `subtitle`, and all `s6-*` carousel keys
- No shared data or edit keys with `lib-technology`
- The overlapping generic key names (`section-label`, `headline`) are stored in separate library entries and cannot interfere
