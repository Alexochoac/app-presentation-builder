---
title: Slides — Template Creator — 1 — Data model & API
type: Feature
priority: H
status: done
area: slides
order: 1
---

First task in the Template Creator series. Establish the data layer before any UI is built.

## Goal
Define how templates are stored and served. Everything else in the Template Creator depends on this.

## Tasks

1. Define the template JSON schema. Each entry has:
   - `id` — e.g. `ls01-cover`
   - `name` — display name e.g. `Cover Slide`
   - `category` — one of: `Cover | Content | Stats | Visual | CTA | Data`
   - `slideMode` — `sequence` or `embedded`
   - `components` — array of block types used e.g. `["headline", "carousel", "logo"]`
   - `file` — relative path to the HTML file e.g. `features/slides/slide-01-cover.html`
   - `createdAt` — ISO date string

2. Create `builder/data/templates.json` — seed it with entries for the existing slides (slide-01 through slide-15), converting each into a template entry using the schema above.

3. Add `GET /api/templates` to `builder/server.js` — returns the full list. Accepts optional `?category=Cover` query param to filter.

4. Add `POST /api/templates` to `builder/server.js` — accepts `{ id, name, category, slideMode, components, html }`, writes the HTML file to `builder/features/slides/slide-[NN]-[name].html`, appends the entry to `templates.json`.

5. Add `DELETE /api/templates/:id` to `builder/server.js` — removes the entry from `templates.json`. Does NOT delete the HTML file (keep it safe, just deregister).

## Reference
- `architecture/template-anatomy.md` — the anatomy spec all templates must follow
- `builder/data/slide-library.json` — existing pattern for how slides are stored (reference only)

## Acceptance criteria
- `GET /api/templates` returns all 15 seeded entries
- `GET /api/templates?category=CTA` returns only CTA slides
- `POST /api/templates` writes file + updates JSON
- `DELETE /api/templates/:id` removes entry without touching the file

## Implementation Summary

**Files created:**
- `builder/data/templates.json` — new file seeded with 15 entries (one per existing slide-01 through slide-15). Schema: `id` (ls[NN]-[name]), `name`, `category`, `slideMode`, `components`, `file`, `createdAt`.

**Files modified:**
- `builder/server.js` — added `TEMPLATE_CATALOG_PATH` constant pointing at `data/templates.json` (distinct from the existing `TEMPLATES_PATH` which points at `slide-templates.json`). Added three new API routes:
  - `GET /api/templates` — reads the catalog, filters by `?category=` if provided (case-insensitive)
  - `POST /api/templates` — validates required fields + category enum, auto-increments the slide number by scanning existing files, writes HTML to `features/slides/`, appends entry to `templates.json`, returns 201
  - `DELETE /api/templates/:id` — removes entry from JSON without touching the HTML file

**Verified:** `GET /api/templates` returned all 15 entries in browser; `GET /api/templates?category=CTA` returned 1 entry (ls14-cta).
