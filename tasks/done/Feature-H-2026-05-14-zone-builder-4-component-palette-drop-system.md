---
title: Zone Builder — 4 — Component Palette + Drop System
type: Feature
priority: H
status: done
area: builder
order: 4
series: zone-builder
depends-on: Feature-H-2026-05-14-zone-builder-3-canvas-renderer-header-zone.md
---

Wire the left palette panel so that clicking a component type adds it to the body zone on the canvas. Each component dropped must arrive as an anatomy-compliant HTML fragment — with data-edit, data-lang-key, and tracking pre-wired.

## Component fragment library

Each component type has a pre-built HTML fragment template stored server-side (or as a JS module). When the user adds a component, the builder:

1. Fetches or loads the fragment template for that component type
2. Generates a unique slot ID (e.g. `carousel-1`, `tabs-2`)
3. Injects `data-edit`, `data-lang-key`, and tracking calls using the slot ID and the slide's ID
4. Inserts the fragment into the correct zone slot on the canvas

## Fragment templates — one per component type

Each fragment follows the anatomy spec exactly. Examples:

**Carousel fragment:**
```html
<div class="ls-carousel" data-edit="carousel-{n}" data-counter=""
     style="flex:1;min-height:0;width:100%;">
  <div class="ls-carousel-track">
    <div class="ls-carousel-slide">
      <img src="" alt="Image caption" data-zoom>
    </div>
  </div>
</div>
```
(tracking auto-handled by carousel.js — no explicit Track call needed)

**Editable List fragment:**
```html
<ul data-ls-list data-edit="list-{n}">
  <li>First item</li>
  <li>Second item</li>
  <li>Third item</li>
</ul>
<div data-ls-restore></div>
```

**CTA Button fragment:**
```html
<a class="slide-btn"
   href="#"
   data-edit="cta-{n}"
   data-lang-key="{slide-id}.cta-{n}"
   contenteditable spellcheck="false">
  Contact Us
</a>
```

**Trigger Button fragment:**
```html
<button class="slide-btn"
        data-trigger-slide=""
        data-edit="trigger-{n}"
        data-lang-key="{slide-id}.trigger-{n}"
        contenteditable spellcheck="false">
  View Detail
</button>
```
(target slide ID left empty — wired in Task 8)

## Palette panel UI

```
Components
──────────
Content
  [T] Text Block
  [H] Heading
  [#] Stat Block
  [•] Editable List
  [1] Numbered Steps
  [☖] Card Grid

Interactive
  [▷] Carousel
  [⊟] Tabs
  [⊞] Capability Table
  [↗] CTA Button
  [⟳] Trigger Button
  [◉] Tag Chips
  [☷] Logo Grid
```

Clicking any item adds it to the body zone. If the body zone has multiple slots (two-col: left and right), show a slot picker: "Add to: Left | Right".

## Body zone slot management

- Each layout defines available slots (single, left, right, panel-0, panel-1, etc.)
- Components stack within a slot (top to bottom)
- Each component shows a "×" remove button in builder mode (`data-builder-only`)
- No drag-reorder in this task — click-to-remove only

## Anatomy auto-wiring rules

When a fragment is inserted, the builder must:
- Replace `{n}` with a sequential counter per component type (carousel-1, carousel-2, etc.)
- Replace `{slide-id}` with the current slide's draft ID
- All `data-lang-key` values must be globally unique within the slide

## New component types (future)

When Claude builds a new component fragment not in this list, it is added to:
1. The fragment library (server-side file or JSON entry)
2. The palette component list
3. The claude-skill-template-creator.md "Standard Components" section

This is the extension point — adding a component = add fragment + add to palette list.

## Acceptance criteria

- [x] Palette shows all component types grouped into Content and Interactive
- [x] Clicking a component adds its anatomy-compliant fragment to the body zone
- [x] Slot picker appears for multi-slot layouts (two-col only)
- [x] Inserted components have correct data-edit, data-lang-key (no collisions)
- [x] Components render visually on the canvas immediately after insertion
- [x] Each component has a × remove button (data-builder-only) visible on hover
- [x] The in-memory slide state updates on every add/remove
- [x] Fragment templates live in a single clearly organized location (componentFragment function)

## Implementation Summary

**File modified:** `builder/features/zone-builder/index.html`

**What was built:**

1. **State additions** — `counters: {}` (per-type sequential counter), `slideId: 'draft-' + Date.now()` (unique draft ID for lang-keys), `pendingType: null` (slot picker state). All reset in `selectLayout`.

2. **`generateCompId(type)`** — increments `state.counters[type]` and returns e.g. `carousel-1`, `editable-list-2`. Used both for default components when picking a layout AND for new components added from palette. Default components now get meaningful IDs (`carousel-1`) instead of `comp-0`.

3. **`getAvailableSlots(skeleton)`** — returns `['left','right']` for `two-col` layouts, `['main']` for everything else.

4. **`addComponent(type, slot)`** — creates `{ id: generateCompId(type), type, slot }`, pushes to `state.content.components`, marks dirty, calls `renderCanvas`.

5. **`showSlotPicker(type)`** — sets `state.pendingType` and shows `#zbSlotPicker` floating bar over canvas.

6. **`zbPickComponent(type)`** (window export) — if two-col layout, calls `showSlotPicker`; otherwise calls `addComponent(type, 'main')` directly.

7. **`zbAddToSlot(slot)` / `zbCancelSlotPick()`** (window exports) — confirm or cancel slot selection, hide picker.

8. **Slot picker HTML** — `#zbSlotPicker` div inside `.zb-canvas-wrap` (which got `position: relative`). Shows "← Left | Right → | Cancel" buttons. Floats as an absolute overlay at the top of the canvas area when triggered.

9. **`compWrapper` update** — added `<button class="zb-comp-remove" data-builder-only="">✕</button>` inside each component wrapper. `onclick` uses `event.stopPropagation()` to prevent triggering component selection. Visible only on hover via CSS opacity transition.

10. **`componentFragment` update** — added `data-lang-key="{slideId}.{compId}"` to all text-bearing elements: tab buttons, list items, tag chips, table cells/headers, cta-button, trigger-button, text-block, stat-block value/label, capability-table labels. Component IDs in `data-edit` now use the type-based system (`carousel-1` etc.).

11. **`renderComponentList` update** — each `.component-item` now has `onclick="zbPickComponent('...')"`.

12. **CSS additions** — `.zb-slot-picker` (absolute positioned overlay), `.zb-slot-btn` (slot choice buttons), `.zb-slot-cancel`, `.zb-comp-remove` (× button: absolute top-right, opacity 0, fades in on `.zb-component:hover`).

**Architecture decision:** Fragment templates live entirely client-side in the `componentFragment()` JS function — no server round-trip needed. This was chosen over a server-side fragment file because the builder already has all component markup as JS strings, and adding `data-lang-key` dynamically requires `state.slideId` which is only available at runtime.
