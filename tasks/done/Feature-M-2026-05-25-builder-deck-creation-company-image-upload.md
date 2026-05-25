---
title: Builder — Deck Creation — Company Image — Add image upload to New Deck modal
type: Feature
priority: M
status: done
area: builder
---

The New Deck modal now includes a "Company Image" upload field (shown only on create, hidden on rename). The uploaded image is saved to `/slides/uploads/` and stored as `deck.logo` in the deck store, appearing immediately as the thumbnail in the deck sidebar. This lets users visually differentiate decks when managing multiple companies. Server-side POST /api/decks updated to accept `logoFilename` and `logoData` fields.
