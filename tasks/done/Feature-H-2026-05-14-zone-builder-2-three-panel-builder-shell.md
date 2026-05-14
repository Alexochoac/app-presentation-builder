---
title: Zone Builder — 2 — Three-Panel Builder Shell UI
type: Feature
priority: H
status: done
area: builder
order: 2
series: zone-builder
depends-on: Feature-H-2026-05-14-zone-builder-1-layout-library-data-model.md
---

Create the three-panel layout shell for the new zone-based slide builder. No component logic yet — just the structural UI frame and the layout picker entry screen.

## Entry point

A new route or section in the builder app: `/slide-builder` (or a new tab in the Slides section replacing the old Layout Builder tab). The user arrives here when they click "New Slide" or "Build from Scratch".

## Layout picker screen (first screen)

Before the 3-panel canvas opens, the user sees a layout picker:

```
┌─────────────────────────────────────────────────────┐
│  Choose a starting layout                           │
│  ─────────────────────────────────────────────────  │
│  [Hero]  [Tabbed]  [Two-Col Compare]  [Steps + CTA] │
│  [Carousel + Cards]  [Selector]  [Partner Grid] ...  │
│                                                     │
│  Each card shows: layout name + thumbnail preview   │
│  (thumbnail = static screenshot of the source slide)│
└─────────────────────────────────────────────────────┘
```

Clicking a layout opens the 3-panel canvas pre-loaded with that skeleton.

## Three-panel canvas layout

```
┌──────────────┬───────────────────────────┬──────────────────┐
│  PALETTE     │  CANVAS                   │  PROPERTIES      │
│  (240px)     │  (flex-grow)              │  (280px)         │
│              │                           │                  │
│  Components  │  [Slide preview area]     │  (empty until a  │
│  ─────────── │                           │   component is   │
│  [list of    │                           │   selected)      │
│   component  │                           │                  │
│   types]     │                           │                  │
│              │                           │                  │
│  Layouts     │                           │                  │
│  ─────────── │                           │                  │
│  [change     │                           │                  │
│   layout]    │                           │                  │
└──────────────┴───────────────────────────┴──────────────────┘
```

## Top bar

```
[← Back]  [Slide name (editable)]  [Preview]  [Save]
```

- Back → returns to Slides section (prompts if unsaved changes)
- Slide name → inline editable, defaults to "New Slide"
- Preview → full-screen modal showing the rendered slide (mobile/desktop toggle)
- Save → assembles and saves the HTML (wired in Task 7)

## Panel specs

**Left — Palette panel:**
- Section: "Components" — list of component types (name + icon), clickable to add
- Section: "Layout" — shows current layout name + "Change layout" link (reopens picker)
- No drag-and-drop in this task — click-to-add only

**Center — Canvas:**
- Shows a scaled representation of the slide (aspect ratio 16:9 or actual slide proportions)
- Header row and body zone are visually distinct (subtle zone labels in builder-only mode)
- Placeholder state when a zone is empty: dashed outline + "Drop a component here" text
- Components inside zones are rendered as real HTML (iframe or direct render)

**Right — Properties panel:**
- Empty / "Select a component to edit" state by default
- Panel content defined in Task 5 and Task 6

## Acceptance criteria

- [x] Layout picker shows all skeletons from layout-skeletons.json as cards
- [x] Clicking a layout opens the 3-panel canvas
- [x] Three panels render at correct widths with correct sections
- [x] Top bar: back button, editable slide name, Preview button (can be non-functional), Save button (can be non-functional)
- [x] Canvas shows header zone and body zone visually separated
- [x] Left panel shows list of component types (static list, click does nothing yet)
- [x] "Change layout" reopens the layout picker
- [x] Shell is responsive enough to work at 1280px+ screen width

## Implementation Summary

**Files created:**
- `builder/features/zone-builder/index.html` — full zone builder page (both screens)

**Files modified:**
- `builder/server.js` — added `GET /zone-builder` route

**What was built:**

Created a standalone full-page zone builder at `/zone-builder` (no sidebar, takes full viewport). The page handles two screens via JS state — no page reloads.

**Screen 1 — Layout Picker:**
- Fetches skeletons from `GET /api/layout-skeletons`
- Renders a card grid with name, description, zone type badge, and a procedurally generated SVG thumbnail per layout type. SVG thumbnails visually represent the body zone structure: full (single rect), two-col (split rects), tabbed (tab pills + content area), steps (circles + bars + CTA), grid (cell grid). Header zone shown in all thumbnails as logo column + text lines.
- Cards hover with accent border + subtle lift animation
- Clicking a card calls `selectLayout()` which switches to Screen 2

**Screen 2 — 3-Panel Builder:**
- Top bar (52px): ← Back button | slide name input | Preview btn | Save btn (both non-functional stubs for later tasks)
- Left panel (240px): component palette grouped into Interactive and Content, with icons. 12 component types listed. Layout section shows current layout name, type, and a "Change layout" link that returns to the picker.
- Center (flex): canvas renders the selected layout's header zone (logo col + section-label + headline + divider) and body zone with type-specific placeholders (dashed slot outlines, tab bars, step rows, grid cells).
- Right panel (280px): empty state with "Select a component to edit its properties"

**URL deep-linking:** `?layout=<id>` param pre-selects a layout on load, persisted via `history.replaceState` on every layout selection.

**Unsaved-changes guard:** `zbGoBack()` checks `state.dirty` and prompts before discarding. Escape key also triggers back.

**Route:** `GET /zone-builder` → 302 redirect to login when unauthenticated (auth middleware working correctly). 200 when authenticated.
