---
title: Zone Builder — 5 — Properties Panel — Text and Style Editing
type: Feature
priority: H
status: done
area: builder
order: 5
series: zone-builder
depends-on: Feature-H-2026-05-14-zone-builder-4-component-palette-drop-system.md
---

Wire the right properties panel for text editing and visual styling. When a component is selected on the canvas, the panel shows the editable fields and style controls for that component.

## Panel structure

```
┌────────────────────────────┐
│  Carousel                  │  ← component type label
│  ──────────────────────── │
│  CONTENT                   │
│  [component-specific       │
│   fields — see Task 6]     │
│                            │
│  ──────────────────────── │
│  STYLE                     │
│  Font size   [ 16 ▾ ]      │
│  Text color  [──────── ▾]  │  ← CSS var picker, not hex
│  Bold  [✓]  Italic [  ]    │
│  Align  [L] [C] [R]        │
│                            │
│  ──────────────────────── │
│  [ Remove component ]      │
└────────────────────────────┘
```

## Text editing — two modes

**Mode A — Direct canvas editing (preferred for simple text):**
Clicking a text element on the canvas activates `contenteditable` on that element directly. The properties panel shows style controls that apply to the selected text or the whole component.

**Mode B — Properties panel fields (for structured components):**
For components like carousels (caption per slide) or cards (title + body per card), the properties panel shows individual input fields. Changes update the canvas in real time.

Use Mode A for: Text Block, Heading, Stat Block, CTA Button label, section-label, headline.
Use Mode B for: Carousel items, Tab labels, Card Grid items, Numbered Steps items.

## CSS variable color picker

Never expose raw hex input. The color picker shows only the CSS variables available from the active style:

```
Text color:
  ○ --text          (Primary text)
  ○ --text-muted    (Secondary / muted)
  ○ --accent        (Brand accent)
  ○ --accent-light  (Light accent)
  ○ --bg            (Background)
  ○ --bg-card       (Card background)
  ○ --border        (Border)
```

Selecting a variable applies it as `color: var(--text)` (or `background-color` depending on context). The swatch next to each option shows the resolved color from the active deck style.

This enforces the anatomy rule: no hardcoded colors — ever.

## Font size control

Dropdown with sensible options (not free input):
- 12px / 14px / 16px / 18px / 20px / 24px / 28px / 32px / 40px / 48px

Applied as inline `font-size` style or via a scoped CSS rule in the slide's `<style>` block.

## Bold / Italic / Alignment

Standard toggle buttons. Applied as CSS class or inline style on the target element.

## Remove component

"Remove component" button at the bottom of the panel:
- Removes the selected component from the body zone
- Clears the properties panel
- Updates the in-memory slide state

## Selected state management

- Clicking a component on canvas → panel updates to show that component's controls
- Clicking empty canvas space → panel shows "Select a component to edit"
- Clicking the header zone text → panel shows text style controls only (no remove button — header can't be removed)

## Acceptance criteria

- [x] Clicking a component on canvas opens its properties in the right panel
- [x] CSS variable color picker shows all 6 variables with resolved color swatches
- [x] Color selection applies `color: var(--varname)` to the target element
- [x] Font size dropdown applies the selected size to the target element
- [x] Bold / italic toggles work
- [x] Alignment buttons work (left / center / right)
- [x] "Remove component" removes the component from the zone and clears the panel
- [x] Clicking the section-label or headline opens style controls (no remove button)
- [x] No raw hex values ever appear in the panel or get applied to elements
- [x] All style changes update the in-memory slide state

## Implementation Summary

**File modified:** `builder/features/zone-builder/index.html`

**What was built:**

1. **CSS additions** — New rule `.zb-component-content` (flex pass-through wrapper) plus a full set of properties panel control styles: `.props-section`, `.props-section-title`, `.props-row`, `.props-label`, `.color-swatch-list`, `.color-swatch-item`, `.color-dot`, `.color-var-name`, `.color-var-label`, `.props-select`, `.style-toggle-group`, `.style-toggle-btn`, `.props-remove-section`, `.props-remove-btn`.

2. **Constants** — `COLOR_VARS` (6 entries: `--text`, `--muted`, `--accent`, `--bg`, `--surface`, `--border`) and `FONT_SIZES` (10 fixed sizes 12px–48px) added after the `COMPONENTS` array.

3. **State extensions** — Added `selectedField: null` (tracks which header field is selected — `'section-label'` | `'headline'` | `null`) and `styles: {}` (maps component/field id → `{ fontSize, color, fontWeight, fontStyle, textAlign }`) to the state object. Both reset on layout pick.

4. **`compWrapper` update** — Now wraps fragment HTML in a `.zb-component-content` div. Reads from `state.styles[comp.id]` on render and applies as inline style (camelCase props converted to kebab-case for HTML), so styles survive canvas re-renders (e.g. after remove).

5. **`wireHeaderEvents` update** — Section-label and headline click handlers now also call `selectHeaderField(field)`, opening the style panel for the header text element without a Remove button.

6. **`deselectComponent` update** — Also clears `state.selectedField = null`.

7. **`renderPropsSelected`** — Rebuilt to show component type label + `renderStyleSection(id)` + Remove button.

8. **New functions:**
   - `selectHeaderField(field)` — deselects components, sets `state.selectedField`, calls `renderPropsHeader`
   - `renderPropsHeader(field)` — renders Section Label / Headline label + style section (no Remove button)
   - `renderStyleSection(id)` — shared function that builds the full STYLE section HTML: font size `<select>`, 6-var color picker with live swatches (`getComputedStyle` resolves each var), Bold/Italic toggles, L/C/R alignment buttons
   - `getStyleObj(id)` — returns or initializes `state.styles[id]`
   - `getStyleTarget(id)` — returns the DOM element to style: for header fields → `[data-edit="..."]`; for components → `.zb-component-content` inside the wrapper
   - `applyStyle(id, prop, val)` — updates state, applies to DOM via `target.style[prop]`, marks dirty, re-renders the panel to refresh active states
   - `removeComponent(id)` — filters component from `state.content.components`, deletes its style entry, calls `renderCanvas` (which re-wires both header and component events), then shows empty panel

9. **Window exports** — `zbApplyStyle`, `zbToggleStyle`, `zbSetAlign`, `zbRemoveComponent` added as global handlers for inline `onclick`/`onchange` in the generated panel HTML.

**Also fixed in this session:** Removed the erroneous `zbMarkDirty()` call from `selectComponent()` — selecting a component no longer triggers the "unsaved changes" confirmation on back navigation.
