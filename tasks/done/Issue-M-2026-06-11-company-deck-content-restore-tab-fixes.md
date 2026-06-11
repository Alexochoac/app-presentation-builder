---
title: Company deck content restore + tab fixes
type: Issue
priority: M
status: done
area: slides
commit: cc7ecc0
---

Rebuilt the corrupted About/Technology panels in the deck-rebuild Company slide. Duplicate/missing elements were blanking descriptions on render.

## Fixes

- Restored real legacy content for About panel (Tab 1) and Technology panel (Tab 2) in `deck-rebuild`
- Fixed label typo: "TechnolYeogies" → "Technologies"
- Removed stray empty tab that was appearing as a blank third tab
