---
title: Translation — Slide 6 (Surface) — Defect gallery buttons dynamically generated, not translatable
type: Feature
priority: M
status: pending
area: slides
---

The defect type buttons on slide 6 (Scratches, Inclusions, Dirt, Dust, Water, Fingerprints, etc.) are generated at runtime by JavaScript into an empty #s6-selector div. They are not in the HTML at build time and therefore cannot be translated through the data-edit / translations.json system.

To make them translatable, one of these approaches is needed:
Option A — Add data-edit fields for each button label in the template (s6-btn-scratches, s6-btn-inclusions, etc.) rendered server-side, and update the JS to read them from the DOM instead of hardcoding.
Option B — Store button labels as a translatable JSON config in the slide edits, and update the JS component to render them with the correct language at runtime based on the active language.

Option A is simpler and consistent with the existing system.
Affects: tpl-new-defect-gallery template + the s6 component JS.
