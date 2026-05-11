---
title: Builder — Slides — Slide 5 & 6 — Fix text cards not editable and slide 6 not independent from slide 5
type: Issue
priority: H
status: pending
area: slides
---

Slide 5 has text cards that are not editable in the builder preview (missing or incorrect `data-edit` attributes). Slide 6 was based on slide 5's template but is pulling the same text content as slide 5 instead of having its own independent values — and its text cards are also not editable. Slide 6 must be fully decoupled from slide 5 with its own editable fields.
