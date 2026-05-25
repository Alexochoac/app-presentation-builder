---
title: Builder — Cover Slide — Logo — Unify customer-logo key names across builder and publisher
type: Issue
priority: M
status: done
area: builder
---

Two different key names are used for the same concept across different code paths: the builder saves the cover logo as `customer-logo` in `deckEdits`, while the published presentation path injects it as `customer-logo-src` from `presentations.json`. This mismatch means a logo set in the builder is ignored when building the finished presentation, and vice versa. All paths should use a single consistent key, or there must be an explicit handoff that maps one to the other when generating a finished presentation.
