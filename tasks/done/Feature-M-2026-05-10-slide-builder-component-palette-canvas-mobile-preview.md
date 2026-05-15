---
title: Slide Builder — Component palette, canvas editor, mobile/tablet preview
type: Feature
priority: M
status: done
area: slides
order: 5
depends-on: Feature-H-2026-05-10-slides-section-my-library-templates-slide-builder-tabs.md
---

## Goal

The Slide Builder tab in the Slides section is where users build new slides from scratch. The existing Layout Builder (`/layouts`) has the core canvas engine already — this task enhances it into a full slide builder with a richer component palette, better UX, and a mobile/tablet preview popup.

## Current State (what `/layouts` already has)

- Row-based canvas: add rows, set col count (1–3), drop components into cells
- Component picker modal with 7 types: Text Block, Title, Tabs, Carousel, Table, List, Button
- Live preview panel: Desktop and Mobile (390px phone) viewport toggle
- Save layout to `/api/layouts`
- Drag handles exist (visual only, not functional)

## What This Task Adds

### 1. Component palette (enhanced)
Expand the component list and add descriptions:

| Component | Description |
|---|---|
| **Title** | Large headline, optional subtitle below |
| **Text Block** | Body text, supports bold and inline links |
| **List** | Bullet or numbered list, items editable one by one |
| **Tabs** | Tab bar + panels, user sets tab count and labels |
| **Carousel** | Image + caption slides, swipeable |
| **Matrix / Table** | Grid of cells with headers, data rows |
| **Button** | CTA button, can link to a tab, carousel, or external URL |
| **Image** | Single image with optional caption |
| **Stat Block** | Large number + label + optional sublabel (e.g. "2050+ systems installed") |
| **Section Label** | Small uppercase label (used as a section intro) |

Components are grouped in the picker: **Content** (Title, Text, List, Section Label, Stat Block) and **Interactive** (Tabs, Carousel, Button, Image, Matrix).

### 2. Column resize (within guardrails)
- 3-col row: each col can be 1/3 or the user can set ratios like 1:2 or 2:1
- Always snaps to clean grid fractions — no free pixel resize
- This keeps mobile layout safe

### 3. Drag-to-reorder rows
- Make the existing drag handles functional (currently "coming soon")
- Rows can be dragged up/down within the canvas
- Uses HTML5 drag events or a lightweight sortable library (no heavy deps)

### 4. Mobile / tablet preview popup
- "Preview" button in the builder top bar opens a popup overlay
- Popup shows 3 viewport tabs: **Desktop** (1920px scaled), **Tablet** (768px), **Mobile** (375px)
- The preview renders the current slide at that viewport width inside a scaled iframe
- This is a popup/modal, not an inline panel change

### 5. "Save" flow
Two save actions at the top:
- **Save as Template** — saves the structure (rows/cols/components) to slide-templates. Template has dummy placeholder content. No user content is saved.
- **Save as Library Slide** — saves the structure AND the current content as a library slide. This lets users skip the "use template → fill content" two-step.

### 6. Edit existing template
When opened from Templates tab "Edit Template" action:
- The canvas pre-loads the template's row/col/component structure
- Saving overwrites the existing template (with confirmation if any library slides use it)

## What This Task Does NOT change
- The underlying component HTML/CSS — components remain the same as they are today
- The `renderLayoutToHtml` function in server.js — still used
- The data model — templates still live in `slide-templates.json` / `layouts.json`

## Acceptance Criteria
- [ ] Component palette shows all 10 component types with descriptions, grouped
- [ ] Adding a component inserts it into the selected canvas cell
- [ ] Column ratio picker works (1/3 + 2/3, 1/2 + 1/2, etc.)
- [ ] Row drag-to-reorder is functional (not just visual)
- [ ] "Preview" button opens popup with Desktop / Tablet / Mobile tabs
- [ ] "Save as Template" saves to templates, shows in Templates tab
- [ ] "Save as Library Slide" saves to library, shows in My Library tab
- [ ] "Edit Template" pre-loads the template's structure into the canvas
