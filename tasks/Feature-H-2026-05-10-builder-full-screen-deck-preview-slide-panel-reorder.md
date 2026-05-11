---
title: Builder — Full-screen deck preview, slide panel, reorder, hide, inline edit
type: Feature
priority: H
status: done
area: builder
order: 2
depends-on: Feature-H-2026-05-10-nav-merge-builder-decks-restructure-sections.md
---

## Goal

The Builder section is where users build and refine a finished presentation. It has three zones:
1. **Left sidebar** — deck list + "Add deck" button
2. **Slide panel** — ordered list of slides in the active deck
3. **Main canvas** — full-screen preview of the currently selected slide, inline-editable

## Layout

```
┌──────────────┬──────────────────────────────────────────┐
│  Deck List   │                                          │
│  ─────────── │         Main Canvas (16:9)               │
│  > SoftSol ● │      (current slide, full width)         │
│    TEST       │      inline-editable contenteditable     │
│  ─────────── │                                          │
│  + New Deck  │                                          │
├──────────────┼──────────────────────────────────────────┤
│   Slide Panel (horizontal strip, bottom or right)       │
│  [Slide 1] [Slide 2] [Slide 3] ... drag to reorder     │
└─────────────────────────────────────────────────────────┘
```

## Deck List Sidebar

- Lists all decks from `GET /api/decks`
- Active deck highlighted (dot or border)
- Click a deck → sets it as active via `POST /api/decks/active`, reloads slide panel + canvas
- Actions per deck (via dropdown or right-click): Rename, Duplicate, Delete, Settings
- "Settings" opens per-deck settings drawer/modal (see Task 4)
- "+ New Deck" button at bottom (same premium modal as today)
- Deck shows: name, logo thumbnail (if set), theme badge

## Slide Panel

- Horizontal strip at the bottom (or vertical strip on the right — decide on build)
- Shows all slides in the active deck (`GET /api/deck`)
- Click a slide → loads it into the main canvas
- **Drag to reorder** — updates slide order via `PUT /api/deck` with new slide order
- **Eye toggle** — hide/show slide (updates `visible` flag)
- **Remove slide** — remove from deck via `DELETE /api/deck/slides/:id`
- **+ Add Slide** button in panel → opens Slides section in pick-mode (My Library)
- Badge: "⬆ Update available" if the slide's template has a newer version (design only in this task — backend in Task 6)
- Each slide: small thumbnail iframe (readonly), slide name, eye icon, drag handle

## Main Canvas

- Full-width 16:9 iframe showing the current slide (`/slides/deck-preview/:id`)
- **Inline editing is ON** (not readonly) — user can click text, edit contenteditable fields
- Edits auto-save via `POST /api/deck/slides/:id/edits` (same as today in /slides)
- User can swap images, edit text, add items to existing tabs/carousel components
- User CANNOT add new component types here (that is Slide Editor in Slides section)
- Canvas header bar: slide name, "Edit in Slide Editor" button (opens /slides with this slide)

## Finished Presentations (per-deck)

- Below the slide panel or in a collapsible drawer: "Published Presentations" for this deck
- Lists published snapshots of the current deck (from `GET /api/presentations` filtered by deck)
- Each: presentation name, company, date, link to view, actions (archive, duplicate, delete)
- "Publish" button at top right → triggers the publish/save flow (same as today)

## Data / API

No new API endpoints needed. Reuses:
- `GET /api/decks` — deck list
- `POST /api/decks/active` — switch active deck
- `GET /api/deck` — slide list for active deck
- `PUT /api/deck` — reorder slides
- `DELETE /api/deck/slides/:id` — remove slide
- `POST /api/deck/slides/:id/edits` — save inline edits
- `GET /api/presentations` — finished presentations list

## Acceptance Criteria
- [x] Deck list sidebar shows all decks, clicking switches active deck
- [x] Slide panel shows active deck's slides, clicking loads slide in canvas
- [x] Main canvas shows current slide, inline editing works and saves
- [x] Drag-to-reorder slides works and persists
- [x] Hide/show (eye toggle) works and persists
- [x] "+ Add Slide" opens Slides section in pick-mode (passes deck id + name)
- [x] Finished presentations for active deck shown below slide panel
- [ ] "Edit in Slide Editor" button navigates to Slides section with correct slide — not yet wired
