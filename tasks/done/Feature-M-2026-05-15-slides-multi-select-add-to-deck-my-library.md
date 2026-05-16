---
title: Slides — My Library — Multi-select slides when adding to a deck
type: Feature
priority: M
status: done
area: builder
---

When opening /slides in pick mode (via "+ Add Slide" from the builder), there was no way to add more than one slide at a time. Each card had its own "Add to [deck]" button that redirected back to the builder immediately.

Add a multi-select mode to the My Library tab (and Templates tab) in pick mode: a "Select" toggle button appears in the toolbar, clicking it enters select mode where card clicks toggle selection, and a floating action bar shows the count plus an "Add N to [deck name]" button that adds all selected slides sequentially then redirects once.

## Completed

- Added `libSelectMode` / `selectedLibIds` state variables
- Added "Select" toggle button to My Library toolbar (hidden unless in pick mode)
- Added floating `#libSelectBar` with count + "Add N to [deck name]" + Cancel
- Added `toggleLibSelectMode()`, `toggleLibSelection()`, `renderLibSelectionBar()`, `addSelectedLibToDeck()` functions
- Added 8px selection dot badge (`.tpl-select-check`) to every library card — empty ring when unselected, filled accent dot when selected
- `.lib-card.tpl-selectable .lib-card-actions` gets `pointer-events: none` so card click always toggles selection in select mode
- Same pattern also added to Templates tab (`tplSelectMode` / `selectedTplIds`) for multi-select when picking templates to add to a deck
