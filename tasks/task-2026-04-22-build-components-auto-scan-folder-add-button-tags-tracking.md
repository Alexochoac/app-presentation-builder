---
title: Build — Components — Auto-scan components folder and add button.js + tags.js with tracking
priority: normal
status: pending
area: build-deploy
---

Two related fixes to ensure tracking works for all slides including layout-builder-generated ones:

1. Replace the hardcoded components array in buildFrozenPresentation() (server.js:3132) with a dynamic fs.readdirSync scan of the components folder. This way any new .js file added to builder/features/slides/components/ is automatically inlined into finished presentations without touching server.js.

2. Create button.js and tags.js shared component files (alongside carousel.js, tabs.js, etc.) that attach Track.click() calls on page load to any .slide-btn and .slide-tag elements. This ensures layout-builder-generated slides with buttons or tags get tracking for free in finished presentations, just like carousel and tabs already do.
