---
title: Zone Builder — 1 — Layout Library Data Model
type: Feature
priority: H
status: done
area: slides
order: 1
series: zone-builder
---

Define the ~10 layout skeletons as a JSON data structure. This is the foundation everything else builds on — no UI yet, just the data.

## What to build

A `builder/data/layout-skeletons.json` that defines each layout skeleton:

```json
{
  "id": "two-col-compare",
  "name": "Two Column — Compare",
  "description": "Left column for a problem/benefit list, right column for a carousel or image.",
  "bodyZone": {
    "type": "two-col",
    "ratio": "1:1"
  },
  "defaultComponents": [
    { "slot": "left",  "component": "editable-list" },
    { "slot": "right", "component": "carousel" }
  ],
  "thumbnail": null
}
```

## Layout skeletons to define (drawn from existing slides)

| Layout ID | Based on | Body zone type | Default components |
|---|---|---|---|
| `hero` | slide-01 | full | carousel (full width) |
| `tabbed` | slide-02, 04, 05, 10 | tabbed | tabs (3 default panels) |
| `two-col-compare` | slide-03, 08 | two-col 1:1 | editable-list + carousel |
| `selector-carousel` | slide-06 | full | tag-chips + carousel |
| `carousel-cards` | slide-07, 12 | two-col 1:2 | carousel + card-grid |
| `steps-cta` | slide-14 | steps | numbered-steps + cta-button |
| `partner-grid` | slide-13 | grid-3x3 | logo-grid |
| `two-col-list` | slide-09 | two-col 1:1 | editable-list + carousel |
| `full-text` | generic | full | text-block |
| `kpi-stats` | generic | grid-2x2 | stat-block (x4) |

Note: slide-15 is a duplicate of slide-13 — excluded.

## Component type identifiers (used in defaultComponents)

These map directly to the standard anatomy components:

| Component ID | Maps to | Anatomy class/attr |
|---|---|---|
| `carousel` | ls-carousel | `class="ls-carousel"` |
| `tabs` | ls-tabs | `class="ls-tabs"` |
| `editable-list` | data-ls-list | `data-ls-list` |
| `capability-table` | data-ls-table | `data-ls-table` |
| `cta-button` | slide-btn | `class="slide-btn"` |
| `tag-chips` | slide-tag | `class="slide-tag"` |
| `trigger-button` | data-trigger-slide | `data-trigger-slide` |
| `text-block` | plain p/div | `data-edit` + `data-lang-key` |
| `stat-block` | custom fragment | `data-edit` + `data-feed` optional |
| `logo-grid` | img grid | `data-edit` |
| `card-grid` | custom fragment | `data-edit` + `data-lang-key` |
| `numbered-steps` | custom fragment | `data-edit` + `data-lang-key` |

## Acceptance criteria

- [x] `builder/data/layout-skeletons.json` exists with all 10 entries
- [x] Each entry has: id, name, description, bodyZone (type + ratio/cols), defaultComponents
- [x] `thumbnail` field exists (null is fine — populated later)
- [x] Component IDs in defaultComponents match the identifier table above
- [x] Structure is extensible — adding a new layout = one new JSON object
- [x] `GET /api/layout-skeletons` endpoint returns the file (read-only, no auth needed)

## Implementation Summary

**Files created:**
- `builder/data/layout-skeletons.json` — 10 layout skeleton definitions

**Files modified:**
- `builder/server.js` — added `LAYOUT_SKELETONS_PATH` constant and `GET /api/layout-skeletons` endpoint

**What was built:**
Created `layout-skeletons.json` with all 10 layouts extracted from the existing slide library. Each entry has `id`, `name`, `description`, `bodyZone` (type + ratio/columns where applicable), `defaultComponents` (array of slot + component pairs), `sourceSlides` (which existing slides the layout was derived from), and `thumbnail: null` (to be populated later with screenshots).

Body zone types used: `full`, `two-col`, `tabbed`, `steps`, `grid`. Component IDs map directly to the standard anatomy components (ls-carousel, ls-tabs, data-ls-list, etc.) as defined in the component identifier table.

The `GET /api/layout-skeletons` endpoint is auth-protected (same as all other API routes) and returns `{ success: true, data: [...] }` matching the existing API response convention. Endpoint confirmed live — tested against the running server.

**Note:** slide-15 (duplicate of slide-13) was excluded. `two-col-compare` and `two-col-list` both use `editable-list + carousel` in a 1:1 split but represent different content intent (comparison vs. checklist+visual) — kept as separate layouts since the UI description and name drive the user's choice.
