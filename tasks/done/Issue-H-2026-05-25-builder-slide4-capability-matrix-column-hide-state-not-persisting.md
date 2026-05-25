---
title: Builder — Slide 4 Capability Matrix — Column Hide/Show — Fix state not persisting on reload
type: Issue
priority: H
status: done
area: builder
---

Column hide/show state on the capability matrix tables (Tabs 1 & 2 of Slide 4 — Products Overview) was not persisting after a page reload. Toggling columns worked visually but reset on every load.

## Root Cause

`saveTable` (table.js) correctly saves the entire tabs HTML blob (including `ls-col-collapsed` on the `<col>` element) under the `tabs` edit key. However, on the next render, `applyEditsToBlob` (server.js) re-applied the individually-stored `capability-matrix` and `proc-matrix` edit keys on top of the blob. Those keys are stale snapshots that do not include the collapse state, so they overwrote it — erasing the hidden column on every load.

The individual table keys (`capability-matrix`, `proc-matrix`) are never independently updated when a column is toggled; the only save path goes through the tabs blob. So re-applying them was always destructive.

## Fix

Added a guard in `applyEditsToBlob` (server.js ~line 807) to skip elements that carry the `data-ls-table` attribute. These tables are always managed through the tabs blob, so the blob is the authoritative state and individual keys must not override it.

```js
if ($(this).attr('data-ls-table') !== undefined) return;
```
