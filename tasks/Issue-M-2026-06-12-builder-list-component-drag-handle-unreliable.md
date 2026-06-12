---
title: Builder — List Component — Drag Handle — Fix unreliable drag-and-drop on list items
type: Issue
priority: M
status: pending
area: builder
---

The drag handle icon on list component items is unreliable: clicking it sometimes starts a drag correctly, but other times moves/drags the icon element itself instead of the list item. The hit target or drag initiation logic on the handle needs to be tightened so the grab always registers on the row, not the icon.
