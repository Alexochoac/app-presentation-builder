---
title: Slides — My Library + Templates + Slide Builder tabs, add-to-deck pick-mode
type: Feature
priority: H
status: done
area: slides
order: 3
depends-on: Feature-H-2026-05-10-nav-merge-builder-decks-restructure-sections.md
---

## Goal

The Slides section is the slide workshop. Everything about creating, editing, and browsing slides lives here. It has three tabs:

| Tab | What it is |
|---|---|
| **My Library** | Library slides — template + your content. Editable. |
| **Templates** | Structural blueprints — dummy content. Starting points. |
| **Slide Builder** | Build a new slide from scratch using the component canvas. |

## Tab 1: My Library

- Grid of library slides from `GET /api/slide-library`
- Each card: slide name, thumbnail iframe preview (readonly), last edited date, template name
- Actions per card: **Edit** (open in Slide Editor), **Add to Deck** (pick-mode), **Duplicate**, **Delete**
- Search bar + filter by template type
- Empty state: "No library slides yet — start from a template or build from scratch"

### Slide Editor (opens from "Edit")
- Opens as a full-page view or right-side panel within the Slides section
- Full-screen preview of the slide (like current `/slides` editing experience)
- Contenteditable editing works (same mechanism as today)
- Can add items inside existing components (new tab to tabs block, new image to carousel)
- Cannot add new component types — that is Slide Builder
- Changes auto-save to `deckEdits[activeDeckId]` via existing API
- "Save as New Template" button → promotes this slide's structure to a template

### Add-to-Deck Pick-Mode
- When navigated to from Builder ("+ Add Slide"), the My Library tab shows a "Pick a slide" banner
- Each card gets a "Add to [DeckName]" primary button
- Clicking adds via `POST /api/deck/slides` and returns user to Builder
- Can also browse Templates tab in pick-mode to pick a template → creates a new library slide instance

## Tab 2: Templates

- Grid of templates from `GET /api/slide-templates` (or `GET /api/layouts`)
- Each card: template name, category badge, preview iframe, component count
- Filter pills by category (same as current templates tab in slides/index.html)
- Actions: **Preview** (full-screen modal), **Use Template** (creates a new library slide from it and opens in Slide Editor), **Edit Template** (opens in Slide Builder)
- "New" badge on recently added templates

### Template Status
Templates know which library slides are based on them (via `templateId` on library slides).
When a template is updated (structure change), library slides based on it get a dirty flag.
- Badge: "X slides using this" on the template card
- Badge: "⬆ Update available" on library slides whose template changed (visual only in this task — backend in Task 6)

## Tab 3: Slide Builder

This is the existing Layout Builder (`/layouts`) embedded into the Slides section.

### What it does
- Build a new slide structure from scratch using rows, columns, and components
- Component palette: Text Block, Title, Tabs, Carousel, Table, List, Button
- Live canvas preview (desktop + mobile viewport toggle)
- Resize columns (1–3 cols per row), add/remove rows
- Mobile preview popup (375px iframe)
- **Save as Template** button — saves the layout as a new entry in `slide-templates`
- **Save as Library Slide** button — saves with content as a library slide (skips the template step)

### What changes vs current `/layouts` page
- Visually embedded in the Slides section tab layout (not a standalone page)
- "Save" terminology changes: "Save as Template" not "Save Layout"
- "Use Template" button removed (now lives in Templates tab)
- The component palette modal is the same
- If navigated here from "Edit Template" (Templates tab), it pre-loads that template

## Data / API

Reuses existing:
- `GET /api/slide-library` — library slides
- `GET /api/slide-templates` (or `/api/layouts`) — templates
- `POST /api/deck/slides` — add slide to deck
- `POST /api/deck/slides/:id/edits` — save edits

New endpoints needed:
- `POST /api/slide-library/:id/duplicate` — duplicate a library slide
- `DELETE /api/slide-library/:id` — delete a library slide (with warning if used in decks)
- `POST /api/slide-library` — create a new library slide from a template (used in "Use Template")

## Acceptance Criteria
- [x] Three tabs: My Library, Templates, Slide Builder
- [x] My Library shows all library slides with thumbnail previews (scaled iframes via /slides/library-preview/:id)
- [ ] Clicking Edit opens inline Slide Editor with contenteditable + auto-save — Edit opens Slide Builder tab with template rows loaded (no per-field contenteditable editing yet)
- [x] Templates tab shows all templates with filter pills
- [x] "Use Template" creates a library slide (opens name modal → adds to library)
- [x] Slide Builder tab embeds the layout canvas inline (not full-screen overlay)
- [x] "Save as Template" in Slide Builder creates/updates a template entry
- [x] Pick-mode works when navigated from Builder "Add Slide" button (?mode=pick&deck=&deckName=)
- [x] "Add to Deck" in pick-mode adds the slide and returns to Builder

## New endpoints added (this task)
- `GET /slides/library-preview/:id` — read-only HTML render of a library slide (no deck context)
- `POST /api/slide-library/:id/duplicate` — duplicate a library slide
