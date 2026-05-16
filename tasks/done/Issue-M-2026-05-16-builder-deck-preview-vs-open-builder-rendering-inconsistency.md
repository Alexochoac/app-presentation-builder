---
title: Builder — Deck Preview vs Open Builder — Fix rendering inconsistency
type: Issue
priority: M
status: done
area: builder
---

Slides rendered in the builder canvas (deck-preview endpoint) looked different from slides in the Open Builder / preview.html view for the TEST deck. Root causes: (1) the /slides/:deckSlideId.html fragment route used by preview.html was missing the injectDeckBranding call (hero background image, focal point, fit), (2) preview.html had no way to apply the deck's custom accent color. Fixed by adding injectDeckBranding to the fragment route and surfacing accentCss in the /api/deck response so preview.html can inject it into <head>.
