---
title: Builder — Cover Slide — Logo — Fix customer logo not persisting on reload
type: Issue
priority: H
status: done
area: builder
---

The customer logo uploaded on the cover slide in the builder is not restored when the page reloads. Root cause: `applyEditsToHtml` was skipping `data-edit-type="image"` containers entirely, so the saved logo src was never written back into the `<img>` tag on load. A fix has been applied but requires a server restart and verification. Also must handle two legacy data formats stored in `deckEdits`: full innerHTML (saved by the old auto-save before `data-edit-type="image"` existed) vs a plain path string (saved by the new `slide-image-change` event). The fix must extract the src correctly from both formats.
