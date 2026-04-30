---
title: Slides — CSS — Responsive Layout — Fix tablet landscape image display
type: Issue
priority: M
status: pending
area: css
---

Slides look good on desktop and stack correctly on mobile, but break on tablet and small laptop screens (roughly 768px–1200px, e.g. iPad landscape). Images in this range can appear oversized, stretched, or disproportionate relative to the text content.

Design should be **mobile-first**: start with the stacked/single-column layout as the base, then layer in the two-column desktop layout via `min-width` breakpoints — not the other way around.

Key things to fix:
- Add a mid-range breakpoint (around 900px or 1024px) to handle the tablet landscape zone.
- Images must look good at every breakpoint — constrain with `max-width`, `max-height`, or `aspect-ratio` so they never dominate the layout or appear distorted.
- Audit every slide that has a side-by-side image + text layout and verify it degrades cleanly from desktop → tablet landscape → mobile.
