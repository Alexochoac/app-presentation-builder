---
title: Builder — Cover Slide — Logo — Inject deck logo as default when none set
type: Issue
priority: H
status: done
area: builder
---

When the builder loads a cover slide and no builder-specific logo has been saved yet for that deck, the deck's customer logo (stored as `logo` in `decks.json`) should be used as the default. Currently the cover slide ignores the deck logo entirely and falls back to whatever is hardcoded in the original template HTML. The fix should inject the deck logo into the resolved edits before passing them to `applyEditsToHtml`, only when no explicit `customer-logo` override exists in `deckEdits` for that deck.
