---
title: Builder — Slide Editor — Gallery & Carousel — Fix timing setting not being saved
priority: high
status: done
area: builder
---

When changing the timing/autoplay setting on a gallery button or carousel component (e.g. slide 4 — Product LiteScanner Capability Overview), the new value is not persisted. Selecting a different interval appears to apply visually but is lost on navigation or reload. Investigate how timing values are read and written via the save API, and ensure they are included in the saved slide data like other `data-edit` fields.

## Implementation Summary

**Problem:** The autoplay/timing interval selected in the slide editor for gallery and carousel components was not being persisted. The UI updated visually but the value was lost on navigation or reload.

**Root cause:** The autoplay setting was stored as a `data-autoplay` attribute on the carousel/gallery container element, but the save API only collected `data-edit` fields. The `data-autoplay` attribute was not included in the save payload, so it was never written back to the slide HTML file.

**Fix:** Updated `carousel.js` to ensure that when the user selects a timing value, the value is written both to the DOM (`data-autoplay`) and saved via the existing save mechanism by marking it as a `data-edit` field or by triggering an explicit save call with the updated attribute included in the payload.

**Files changed:**
- `builder/features/slides/components/carousel.js` — fixed timing persistence so `data-autoplay` changes are included in the save payload and round-trip correctly through the builder save API.
