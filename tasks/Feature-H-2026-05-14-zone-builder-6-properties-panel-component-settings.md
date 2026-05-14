---
title: Zone Builder — 6 — Properties Panel — Component-Specific Settings
type: Feature
priority: H
status: pending
area: builder
order: 6
series: zone-builder
depends-on: Feature-H-2026-05-14-zone-builder-5-properties-panel-text-style.md
---

Add component-specific editing controls to the properties panel. Each component type has its own set of fields beyond generic text styling — this task defines and builds those.

## Per-component panel content

### Carousel
```
Items: [+ Add slide]
┌─────────────────────────┐
│ [▲] [▼] Slide 1  [×]   │  ← reorder up/down, remove
│     [Upload image]       │
│     Caption: [________] │
└─────────────────────────┘
┌─────────────────────────┐
│ [▲] [▼] Slide 2  [×]   │
│     [Upload image]       │
│     Caption: [________] │
└─────────────────────────┘
Options:
  Show counter  [✓]
  Autoplay      [ ]  [4000ms ▾]
  Lightbox      [✓]
```

### Tabs (ls-tabs)
```
Tabs: [+ Add tab]
  Tab 1: [__________] [×]
  Tab 2: [__________] [×]
  Tab 3: [__________] [×]
(tab labels are editable inline)
Content per tab is edited directly on the canvas
```

### Card Grid
```
Cards: [+ Add card]  Columns: [2 ▾] [3]
┌─────────────────────────┐
│ Card 1  [×]             │
│ Title:  [__________]    │
│ Body:   [__________]    │
│ Icon:   [☆ none ▾]     │
└─────────────────────────┘
```

### Numbered Steps
```
Steps: [+ Add step]
  1. [__________________________] [×]
  2. [__________________________] [×]
  3. [__________________________] [×]
(drag handle for reorder)
```

### Editable List (data-ls-list)
```
Items: [+ Add item]
  • [__________________________] [×]
  • [__________________________] [×]
  • [__________________________] [×]
Style: ○ Bullet  ○ Numbered  ○ Checkmarks
```

### Capability Table (data-ls-table)
```
Columns: [+ Add column]
  Col 1: [__________]  Color: [accent ▾]  [×]
  Col 2: [__________]  Color: [none ▾]    [×]

Rows: [+ Add row]
  Row 1: [__________]
    Col 1: [● on ▾]  Col 2: [○ off ▾]
```

### Stat Block
```
Value:    [2050+]  (data-edit, or data-feed toggle)
Label:    [Systems Installed]
Sublabel: [Worldwide] (optional)
Live data feed: [ ] data-feed key: [___________]
```

### CTA Button / Trigger Button
(See Task 8 for Trigger Button — link picker is there)
```
Label:  [Contact Us]
Type:   ○ Link  ○ Action
  Link URL: [https://___________]
Style:  ○ Primary  ○ Secondary  ○ Outline
Size:   ○ Small  ○ Medium  ○ Large
```

### Tag Chips (slide-tag)
```
Tags: [+ Add tag]
  Tag 1: [Enterprise]  [×]
  Tag 2: [Cloud]       [×]
  Tag 3: [On-Premise]  [×]
Default active: [Tag 1 ▾]
```

### Logo Grid
```
Logos: [+ Add logo]
  [Logo 1 image]  [×]
  [Logo 2 image]  [×]
Columns: [3 ▾]
```

## Data binding

All fields in the properties panel are two-way bound to the in-memory slide state. Changes:
1. Update the in-memory state immediately
2. Re-render the affected component on the canvas (partial re-render, not full reload)
3. Are reflected in the final HTML when Save is triggered (Task 7)

## Acceptance criteria

- [ ] Each component type shows its own panel content when selected
- [ ] Carousel: add/remove/reorder slides, edit caption, upload image, toggle counter/autoplay/lightbox
- [ ] Tabs: add/remove/rename tabs; tab content edited directly on canvas
- [ ] Card Grid: add/remove cards, edit title+body, set column count
- [ ] Numbered Steps: add/remove/reorder steps, edit step text
- [ ] Editable List: add/remove items, edit text, choose bullet style
- [ ] Capability Table: manage columns + rows, toggle dot states
- [ ] Stat Block: edit value/label/sublabel, toggle data-feed mode
- [ ] CTA Button: edit label, set URL or action, choose style/size
- [ ] Tag Chips: add/remove/rename tags, set default active tag
- [ ] Logo Grid: add/remove logos, set column count
- [ ] All changes are reflected live on the canvas
- [ ] All changes update the in-memory slide state
