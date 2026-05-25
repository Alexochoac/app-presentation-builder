---
title: Builder — Cover Slide — Logo — Sync builder logo change to presentation card
type: Issue
priority: M
status: done
area: builder
---

When the user changes the customer logo on the cover slide in the builder, the change is saved to `slide-library.json` (`deckEdits[deckId]['customer-logo']`). However, the presentation card on the dashboard reads `customerLogoSrc` from `presentations.json` — a completely separate field that is never updated. After a logo change in the builder, the presentation card should reflect the new logo automatically. The `POST /api/deck/slides/:id/edits` endpoint should detect when `customer-logo` is saved on a cover slide and propagate the new src to `customerLogoSrc` in `presentations.json` for all presentations in that deck.
