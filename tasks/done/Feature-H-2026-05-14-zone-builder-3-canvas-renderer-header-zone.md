---
title: Zone Builder — 3 — Canvas Renderer + Header Zone Editing
type: Feature
priority: H
status: done
area: builder
order: 3
series: zone-builder
depends-on: Feature-H-2026-05-14-zone-builder-2-three-panel-builder-shell.md
---

Make the canvas render the actual slide HTML (scaled), and wire the header zone for inline editing. This is the first task where real slide content appears on the canvas.

## Canvas rendering approach

The canvas center panel renders the slide using the same mechanism as the existing builder preview — an iframe or a scaled div that loads the slide HTML. The key difference: in builder mode, zones are visibly outlined and components inside them are selectable (click = opens Properties panel).

**Rendering options (choose one):**
- **Iframe approach**: render the slide in a sandboxed iframe, communicate via postMessage for selection/edit events
- **Direct DOM approach**: inject the slide HTML into a scaled div within the page, use pointer-events and CSS scoping to isolate it

Recommended: iframe approach — keeps slide CSS/JS isolated, matches how the existing builder works today.

## Header zone — what it is

The header zone is the top row of every slide. It always contains:
- Left: logo row (both company logos, always locked — not editable in the canvas)
- Right: section-label (small uppercase text) + headline (h1) + divider

```
┌──────────────────────────────────────────────────────┐
│  [Logo A]  |  Section Label (editable)               │
│            │  Headline (editable)                    │
│            │  ─────────────────────────────          │
├──────────────────────────────────────────────────────┤
│  BODY ZONE                                           │
└──────────────────────────────────────────────────────┘
```

## Header zone editing

Clicking the section-label or headline on the canvas activates inline editing for that field. This uses the existing `contenteditable` mechanism already in the app.

Changes auto-save to the builder's in-memory state (not to disk — disk write happens on Save in Task 7).

The header zone does NOT need a properties panel — editing happens directly on the canvas.

## Body zone rendering

The body zone renders the default components from the chosen layout skeleton. At this stage:
- Components are rendered from their HTML fragment templates (static, not interactive in builder mode)
- Each component has a selection highlight on hover and click
- Clicking a component selects it (highlights border, sends component ID to Properties panel slot)
- No editing of component content yet (that's Task 5 + 6)

## Zone labels (builder-only)

In builder mode only (stripped in final output), show subtle labels:
```html
<div class="zone-label" data-builder-only="">Header</div>
<div class="zone-label" data-builder-only="">Body</div>
```

## Acceptance criteria

- [x] Canvas renders the selected layout skeleton as a scaled slide
- [x] Header zone shows logo row (left) + section-label + headline (right) in the same row
- [x] Clicking section-label on canvas makes it contenteditable
- [x] Clicking headline on canvas makes it contenteditable
- [x] Header zone edits update the builder's in-memory state
- [x] Body zone renders the layout's default components as HTML fragments
- [x] Hovering a component shows a selection highlight
- [x] Clicking a component marks it as "selected" (border highlight)
- [x] Zone labels visible in builder mode, absent in preview mode
- [x] Canvas scale maintains 16:9 proportions and fits within the center panel

## Implementation Summary

**Approach chosen:** Direct DOM rendering (not iframe). Component scripts are loaded in the page `<head>` for CSS injection only — their `injectStyle()` IIFEs run on load, but `.init()` is never called, so components stay static and selectable in the canvas. This avoids postMessage complexity while still getting anatomy-correct CSS.

**Files modified:**
- `builder/features/zone-builder/index.html` — full rewrite; canvas rendering, header zone, body zone, component selection, and properties panel integration all added

**What was built:**

1. **CSS isolation**: Loads `/slides/style.css` alongside `/shared/app-style.css` — CSS variable names are identical across both files (both dark theme: `--bg: #000`, `--accent: #F5A623`), so no conflicts. Component scripts (carousel.js, tabs.js, list.js, table.js, button.js, tags.js) loaded for CSS injection only.

2. **Canvas structure**: 16:9 aspect-ratio container (`.zb-canvas`) using `padding-top: 56.25%` trick. Header zone + body zone rendered inside. Zone labels shown via `.zone-label` divs (builder-only).

3. **Header zone**: `.zb-header-row` flex container — logo column on the left (locked, not editable) and `.zb-header-text` on the right with `contenteditable` section-label div and `h1.slide-title`. CSS overrides applied for canvas context (`text-align: left`, `font-size: clamp(18px, 3vw, 32px)`).

4. **Body zone rendering**: `renderBodyZone()` routes by skeleton type — `full`, `two-col` (1:1 and 1:2 ratios), `tabbed`, `steps`, `grid`. Each slot gets a `.zb-slot` container populated with components from `state.content.components`.

5. **Component fragments**: `componentFragment()` returns anatomy-compliant HTML for all 12 component types: carousel, tabs, editable-list, capability-table, cta-button, tag-chips, trigger-button, text-block, stat-block, logo-grid, card-grid, numbered-steps.

6. **Component selection**: Each component wrapped in `.zb-component` div. `pointer-events: none` on inner content prevents interaction with component internals. Click → `selectComponent(id, type)` sets `state.selected`, applies `.selected` border, updates properties panel.

7. **Properties panel**: Shows component name when selected, empty-state message when not.

8. **Bug fixed**: Syntax error in `r()` SVG helper — `(extra||')` was missing a closing quote; corrected to `(extra||'')`.

**State shape:**
```js
state.content = {
  header: { sectionLabel: 'Section Name', headline: 'Dummy Headline Text' },
  components: [{ id, type, slot }]  // populated from skeleton.defaultComponents on layout pick
}
```
