---
title: Rebuild #4 — Products Overview (template04-products)
type: Feature
priority: H
status: done
area: slides
commit: b23466e
---

New pb-responsive cartridge reusing the shared components (tabs.js, the table.js capability matrix, carousel.js). Both tabs kept. Registered in templates.json. lib-products created with real LineScanner data in deckEdits. Added to deck-rebuild. Validator clean, parity match.

## What was built

- New `template04-products` cartridge following the pb-responsive anatomy
- Reuses `tabs.js`, `table.js` (capability matrix), and `carousel.js`
- Both product tabs retained from legacy slide
- Registered in `templates.json`
- `lib-products` created in `slide-library.json` with real LineScanner data in `deckEdits`
- Added to `deck-rebuild` deck
- Validator passes clean; parity check passes

## Standard post-rebuild check

Run `node scripts/parity.js` after any future rebuild to verify builder output matches published output.
