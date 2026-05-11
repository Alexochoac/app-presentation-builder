---
title: Dashboard — Finished Presentations — Grid/List view toggle
type: Feature
priority: M
status: done
area: dashboard-ui
---

Add grid/list toggle to the Finished Presentations panel header. Grid shows 2-col card layout; list shows compact rows. Preference saved to localStorage `pb-fp-view`.

## Implementation Summary

Added two icon buttons (`#fpViewList`, `#fpViewGrid`) to the Finished Presentations panel header. Toggling adds/removes `.fp-grid-mode` on `#fpList`. Grid mode uses CSS grid (`auto-fill minmax(240px,1fr)`) with border + surface background per card. List mode stays as the default compact row layout. State persists across page reloads via `localStorage`.
