---
title: Builder — Deck Settings — Hero Background — Fix color/opacity not updating in canvas
type: Issue
priority: H
status: pending
area: builder
---

Hero background color mode and opacity slider save correctly to `decks.json` but the canvas preview does not reflect the changes. Root cause traced to active deck mismatch: the deck being edited via the settings drawer may not be the active deck, so the iframe always renders the wrong deck's hero. Two partial fixes were applied (auto-switch active deck on drawer open, guard `reloadSlideFrame` to skip when editing a non-active deck), but the issue still persists during testing. Needs a full end-to-end debugging pass: verify the deck switches before the frame reloads, confirm `renderHeroLayout` receives the correct `heroBgType`/`heroBgColor` values, and confirm the iframe src actually triggers a reload with updated data.
