---
title: Slides — CSS — Responsive Layout — Fix tablet landscape image display
type: Issue
priority: M
status: done
completed_at: 2026-06-09 20:22
area: css
---

Slides look good on desktop and stack correctly on mobile, but break on tablet and small laptop screens (roughly 768px–1200px, e.g. iPad landscape). Images in this range can appear oversized, stretched, or disproportionate relative to the text content.

Design should be **mobile-first**: start with the stacked/single-column layout as the base, then layer in the two-column desktop layout via `min-width` breakpoints — not the other way around.

Key things to fix:
- Add a mid-range breakpoint (around 900px or 1024px) to handle the tablet landscape zone.
- Images must look good at every breakpoint — constrain with `max-width`, `max-height`, or `aspect-ratio` so they never dominate the layout or appear distorted.
- Audit every slide that has a side-by-side image + text layout and verify it degrades cleanly from desktop → tablet landscape → mobile.

## Implementation Summary

Resolved at the system level by the **`pb-responsive`** responsive-model standardization (2026-06-09) — see `Feature-H-2026-06-09-builder-slides-standardization-responsive-model-why-us-render-path.md` and rulebook §3.

**Root cause** of the tablet/laptop (≈768–1200px) breakage: the shared `@media(min-width:769px)` model forced content slides to a fixed viewport height with `.slide-body { overflow:hidden }` and `justify-content:center` on a non-scroll container. In that mid-range, content overflowed the fixed height and was **clipped with no way to reach it** (the top especially), and inner elements with `flex:1; min-height:0; height:100%` collapsed or distorted images.

**The fix went further than a single mid-range breakpoint** (the original proposal):
- **No device breakpoint at all** — columns/grids go multi-column via width-driven `repeat(auto-fit, minmax(<min>px, 1fr))`, so they stack exactly when there isn't room, at any width.
- **The slide is the sole scroll container** — content stacks and the whole slide scrolls (mobile-like) at every size; nothing inner-clips; `justify-content: safe center` prevents the unreachable-top clip.
- **Images constrained** — e.g. Company's map panel is now an `aspect-ratio:16/9` box and its carousel a viewport-relative `clamp(240px,42vh,380px)` (was fill-height); corner chrome scales with `clamp()`.

**Scope:** applied to all rebuilt slides — Why Us, Company (#2, the side-by-side image+text + tabs/carousel case this issue called out), CTA, and Cover (hero, `pb-chrome`). Documented as a build requirement in rulebook §3 and enforced by a new `responsive-model` validator WARN, so every future slide degrades cleanly desktop → tablet → mobile by default.

**Remaining (tracked elsewhere):** legacy `tpl-new-*` canvas slides still in the `default` deck keep the old fixed-height model until they are rebuilt (intentional — `pb-responsive` is opt-in so legacy is untouched). They inherit the fix as the rebuild loop reaches them.
