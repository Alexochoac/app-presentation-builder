---
title: Slides — Template Creator — 5 — Import template from file
type: Feature
priority: L
status: done
area: slides
order: 5
---

Fifth task in the Template Creator series. Allow importing an existing HTML file as a template.

**Depends on:** Task 1 (data model & API), Task 4 (Templates tab)

## Goal
Users can generate templates externally (e.g. using the Claude Desktop skill) and import them into the app. The import flow validates anatomy compliance and registers the template.

## Flow

1. User clicks **Import Template** button on the Templates tab
2. File picker opens — accepts `.html` files only
3. On file select:
   - Read the file content
   - Run client-side anatomy validation (see below)
   - Show a review panel with validation results
4. User fills in metadata: name, category, slide mode (pre-filled if readable from the HTML)
5. User clicks **Import** → POST to `/api/templates` with the HTML + metadata
6. Template appears in the Templates tab

## Client-side anatomy validation
Check the uploaded HTML for the 5 anatomy layers and show a checklist:
- `data-slide` attribute on root element
- `data-slide-mode` attribute on root element
- At least one `data-lang-key` attribute present
- No hardcoded hex colors in `<style>` blocks (warn, don't block)
- At least one `Track.` call in `<script>` blocks (warn if missing)
- `data-edit` attributes present

Show green checkmarks for passing checks, yellow warnings for soft issues, red errors for missing required attributes. Allow import even with warnings — block only on missing `data-slide`.

## UI placement
- Add **Import Template** button to the Templates tab header (next to category filter pills)
- The review panel can be a modal overlay

## Notes
- This is the delivery mechanism for templates created with the Claude Desktop skill
- Do not validate image paths — they may differ between environments

## Implementation Summary

### Import UI (`builder/features/slides/index.html`)
Added a `.templates-header` wrapper around the filter pills with the "Import Template" button on the right. A hidden `<input type="file" accept=".html" id="importFileInput">` is triggered by the button.

On file select: `FileReader` reads the HTML as text, `DOMParser` parses it, and `validateAnatomy(html, doc)` runs 6 checks — `data-slide` (required), `data-slide-mode` (required), `data-lang-key` (required), `data-edit` (required), no hardcoded hex colors in `<style>` (warn), `Track.` calls in `<script>` (warn). Returns an array of `{ label, status, msg }` objects rendered as a checklist with green/yellow/red icons.

The import modal (`#importModal`) opens automatically after file select showing: the checklist, a pre-filled Name field (derived from `data-slide` value or filename), a Category dropdown, and a Slide Mode dropdown. The Import button is disabled when any required check fails.

`submitImport()` derives the template ID from `data-slide` or the name, POSTs `{ id, name, category, slideMode, html, components: [] }` to `POST /api/templates` (direct mode), then closes the modal and reloads the catalog.

### Server-side template resolution fix (`builder/server.js`)
Discovered that `deck-preview`, `library-preview`, and `POST /api/library` all only searched `TEMPLATES_PATH` (`slide-templates.json` — the old canvas system) and called `renderLayoutToHtml()`. HTML catalog templates were never found, causing "Template not found" errors when imported slides were added to decks.

Added `resolveTemplate(templateId)` helper that checks `TEMPLATES_PATH` first, then falls back to `TEMPLATE_CATALOG_PATH` (`templates.json`). Returns `{ source: 'canvas'|'html', tpl, filePath? }` or null.

Updated all three callers:
- `GET /slides/deck-preview/:id` — uses `resolveTemplate`; for HTML catalog templates reads the file directly and serves it in the existing page shell instead of calling `renderLayoutToHtml()`
- `GET /slides/library-preview/:id` — same pattern
- `POST /api/library` — uses `resolveTemplate` to get template version (defaults to 1 for HTML catalog templates)

**Known gap:** HTML catalog slides in a deck are served as static HTML — edits stored in `library.slides[].edits` are not yet applied. A follow-on task (`applyEditsToHtml`) is needed to inject stored edits and `contenteditable` attributes at render time.
