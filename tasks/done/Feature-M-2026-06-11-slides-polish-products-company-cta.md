---
title: Slide polish — Products overlap, Company IQC uploadable logos, CTA content & contact UX
type: Feature
priority: M
status: done
area: slides
commit: 9e65a45
---

Three slide polish fixes committed together.

## Products

Capability column wraps so the matrix stops overlapping the carousel.

## Company (IQC)

- Logos are now uploadable via `data-edit-type="image"`
- Add/remove partner cards up to 8 (runtime-managed)
- Dropped the monochrome filter on partner logos

## CTA

- Real SoftSolution content restored from lib-cta
- WhatsApp/email fields get empty-field placeholders
- Auto-disable send button when fields are empty
- Adaptive warning shown when contact fields are blank
