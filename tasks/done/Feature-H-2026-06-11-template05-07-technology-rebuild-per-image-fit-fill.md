---
title: Rebuild #5–#7 — Technology (template05-technology) + per-image carousel Fit/Fill
type: Feature
priority: H
status: pending
area: slides
---

One new cartridge for all three scanner-technology slides. Per-image Fit/Fill toggle added to carousel.js.

## What was built

- New `template05-technology` cartridge (pb-responsive anatomy)
- Covers all three scanner variants: LineScanner, Osprey, Cullet
- Layout: carousel-on-top + numbered card grid; 3-column comparison with images between the lists
- Library entries populated from legacy content:
  - `lib-linescanner-tech`
  - `lib-osprey-tech`
  - `lib-cullet-tech`
- Larger carousels on big screens (responsive breakpoints)
- Mixed object-fit: diagrams use `contain`, comparison photos use `cover`
- **Per-image Fit/Fill toggle** added to `carousel.js` — each carousel image independently toggleable
- Legacy `slide-05-technology.html` restored and kept; new cartridge saved as `slide-05-technology-v2.html`

## Files changed (uncommitted)

- `builder/features/slides/slide-05-technology-v2.html` (new)
- `builder/features/slides/components/carousel.js` (per-image Fit/Fill toggle)
- `builder/data/slide-library.json` (lib-*-tech entries)
- `builder/data/templates.json` (template05-technology registration)
- `builder/data/decks/deck-rebuild/deck.json` (slides added)
- `builder/data/presentations.json` (updated)
- `builder/server.js` (any route additions)
- `architecture/standardization-plan.md` (updated)

## Next steps

- Commit all changes
- Run `node scripts/parity.js` to verify parity
- Register in templates tab UI
