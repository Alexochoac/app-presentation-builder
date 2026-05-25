---
title: Builder — Slide Edits — Fix default deck edits contaminating all other decks
type: Issue
priority: M
status: done
area: builder
---

`resolveSlideEdits` always merges `deckEdits['default']` as the base for every non-default deck. This means any edit made to a library slide while the 'default' deck is active bleeds into all other decks that use the same library slide. Going forward, new decks should start with a clean slate from the template — not inherit from the default deck's saved edits. Fix should change `resolveSlideEdits` so non-default decks only use their own `deckEdits[deckId]` without inheriting from 'default'. Existing data is unaffected (backward compatible).
