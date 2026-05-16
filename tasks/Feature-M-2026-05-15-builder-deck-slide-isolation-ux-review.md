---
title: Builder — Deck — Slide Isolation — UX review and clarification
type: Feature
priority: M
status: pending
area: builder
---

The slide isolation data model is already correct: each deck has its own `deck.json` slide list, and edits are stored per-deck via `deckEdits[deckId]` in `slide-library.json`. A slide added to deck A does not appear in deck B. However, the user raised a concern that a slide in My Library cannot belong to two decks simultaneously and expected it to be duplicated.

Review the UX flow for adding slides across decks: determine whether the current behavior is clear enough to the user, and whether an explicit "duplicate to this deck" action is needed in the slides UI. Consider adding a visual indicator that a library slide already exists in another deck, and/or a confirmation when adding the same template to a second deck.
