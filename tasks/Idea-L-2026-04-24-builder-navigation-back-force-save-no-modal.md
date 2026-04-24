---
title: Idea — Builder — Navigation — Force-save on Back, remove unsaved-changes modal
type: Idea
priority: L
status: pending
area: builder
---

Instead of prompting the user with a modal when clicking Back, always call doSave() silently before navigating away. Back becomes a guaranteed save checkpoint — no user decision needed. Keep auto-save as a background safety net so changes are also protected if the user closes the tab without clicking Back. Trade-off: simpler UX, but if auto-save fails and the user closes the tab, changes could still be lost.
