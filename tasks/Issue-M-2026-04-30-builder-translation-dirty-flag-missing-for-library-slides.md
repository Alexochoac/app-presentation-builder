---
title: Builder — Translation — Dirty Flag — Missing hook for library-backed slides
type: Issue
priority: M
status: pending
area: builder
---

The dirty-flag hook that marks translations as outdated when English content changes is only wired into `POST /api/save` (hardcoded slide files). Library-backed slides save via `POST /api/deck/slides/:id/edits` — that endpoint has no dirty-flag hook, so editing a library slide never marks its translations as dirty.

## Fix
Add the same dirty-flag logic (compare new `en` value, set `dirty: true` for translated languages) to `POST /api/deck/slides/:id/edits` in `server.js`, mirroring what was done in `POST /api/save`.
