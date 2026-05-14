---
title: Zone Builder — 8 — Linking System — Trigger Button + Embedded Slides
type: Feature
priority: H
status: pending
area: builder
order: 8
series: zone-builder
depends-on: Feature-H-2026-05-14-zone-builder-7-html-assembler-save.md
---

Wire the linking system: a Trigger Button component on the canvas can point to an Embedded Slide. Embedded slides are built using the same zone/component system but are hidden from the main presentation flow — they appear as a lightbox/overlay when triggered.

## Concepts (from anatomy spec)

- **Sequence slide** (`data-slide-mode="sequence"`) — appears in normal presentation flow. This is what the builder creates by default.
- **Embedded slide** (`data-slide-mode="embedded"`) — hidden from flow. Only shown when a trigger button is clicked.
- **Trigger button** (`data-trigger-slide="[target-id]"`) — a button on a sequence slide that opens a specific embedded slide.

## UI — Embedded slides tray

Below the main canvas, a collapsible tray shows all embedded slides attached to this slide:

```
┌─────────────────────────────────────────────────────┐
│  MAIN SLIDE CANVAS                                  │
└─────────────────────────────────────────────────────┘

Embedded slides  [+ New embedded slide]
┌───────────────┐  ┌───────────────┐
│  [Detail A]   │  │  [Detail B]   │
│  (tabbed)     │  │  (carousel)   │  ← click to edit
│  ← linked to  │  │  ← linked to  │
│  "View More"  │  │  "See Images" │
└───────────────┘  └───────────────┘
```

Each embedded slide card:
- Shows a thumbnail (mini canvas preview)
- Shows which trigger button(s) point to it
- Click → opens that embedded slide in the main canvas for editing (swaps the canvas)
- Has a "×" delete button (warns if a trigger button points to it)

## UI — Trigger Button link picker

When a Trigger Button component is selected in the properties panel:

```
┌────────────────────────────────┐
│  Trigger Button                │
│  ─────────────────────────── │
│  Label:  [View Detail   ]      │
│                                │
│  Opens:  [── select ──────▾]  │
│           ○ Detail A           │
│           ○ Detail B           │
│           + New embedded slide │
│                                │
│  [ Remove component ]          │
└────────────────────────────────┘
```

Selecting "New embedded slide" → opens a mini layout picker → creates the embedded slide → links it automatically.

## Editing an embedded slide

When the user clicks an embedded slide card in the tray:
- The main canvas switches to show that embedded slide
- A breadcrumb appears: [Main Slide] › [Detail A]
- Clicking [Main Slide] returns to the sequence slide canvas
- Embedded slides use the same zone/component/properties system as sequence slides
- They have their own header zone (or can optionally suppress it for compact panels)

## How this serializes in the HTML assembler (Task 7 extension)

The assembler must handle multiple slides in one save operation. The final output for a slide with embedded slides writes:

```html
<!-- Sequence slide -->
<div class="slide content ls20-product-overview"
     data-slide="ls20-product-overview"
     data-slide-mode="sequence">
  ...
  <button data-trigger-slide="ls20-detail-a" class="slide-btn" ...>View Detail</button>
  ...
</div>

<!-- Embedded slide -->
<div class="slide content ls20-detail-a"
     data-slide="ls20-detail-a"
     data-slide-mode="embedded">
  ...
</div>
```

Both divs are saved into the same `.html` file. The presentation engine (PE) handles showing/hiding embedded slides when triggered.

## Anatomy compliance for embedded slides

Embedded slides follow all 5 anatomy layers. The only difference from sequence slides:
- `data-slide-mode="embedded"` on the root element
- Their slide ID is derived from the parent: `[parent-id]-[slug]` (e.g., `ls20-detail-a`)
- Their lang keys are scoped to their own slide ID (no collision with parent)

## Acceptance criteria

- [ ] "Embedded slides" tray appears below the main canvas
- [ ] "+ New embedded slide" opens a mini layout picker, creates an embedded slide, adds it to the tray
- [ ] Trigger Button properties panel shows a "Opens:" picker listing all embedded slides for this slide
- [ ] Selecting an embedded slide in the picker sets `data-trigger-slide` on the button
- [ ] Clicking an embedded slide card in the tray opens it in the canvas for editing
- [ ] Breadcrumb navigation: [Main Slide] › [Embedded Slide] with back link
- [ ] Deleting an embedded slide warns if a trigger button links to it
- [ ] HTML assembler (Task 7) writes both the sequence slide and all its embedded slides into the same file
- [ ] Embedded slides have `data-slide-mode="embedded"` in the saved output
- [ ] Trigger buttons have `data-trigger-slide="[correct-id]"` in the saved output
- [ ] The presentation viewer correctly opens embedded slides when their trigger button is clicked
