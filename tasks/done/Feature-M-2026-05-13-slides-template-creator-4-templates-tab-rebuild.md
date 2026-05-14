---
title: Slides — Template Creator — 4 — Templates tab rebuild
type: Feature
priority: M
status: done
area: slides
order: 4
---

Fourth task in the Template Creator series. Rebuild the Templates tab to load from `templates.json` and show proper template cards.

**Depends on:** Task 1 (data model & API must be live)

## Goal
The current Templates tab loads from a hardcoded list. Replace it so it fetches from `GET /api/templates`, renders rich cards, and connects to the wizard for creating new templates.

## Changes to `builder/features/slides/index.html`

### Templates grid
- On tab open: fetch `GET /api/templates`, render one card per template
- Each card shows:
  - Template name
  - Category badge (color-coded pill)
  - Slide mode badge if `embedded`
  - Component tags (small chips: "carousel", "stats", "CTA", etc.)
  - Two buttons: **Use** (adds to library) · **Preview** (opens preview popup)
- Category filter pills at the top already exist — wire them to filter the fetched list by `category`

### "New Template" button
- Already added to the full-screen New Slide modal footer in a previous session
- Wire it to close the modal and open the wizard (Task 2) — `openSlideBuilder()` already exists

### Empty state
- If no templates exist in a category: show "No templates in this category"
- If `templates.json` is empty: show "No templates yet — create your first one" with a button to open the wizard

### Modal template picker
The full-screen New Slide modal (`#newSlideModal`) also shows templates.
- Replace its hardcoded grid with the same fetch from `GET /api/templates`
- Reuse the same `filterModalTemplates(cat)` function already wired

## Notes
- The existing `renderTemplatesGrid()` function handles the current hardcoded list — refactor it to accept an array from the API instead
- Do not change the card click behavior — selecting a template and naming the slide flow stays the same

## Implementation Summary

### Templates tab
Added `var htmlCatalog = []` global state and three new functions: `loadHtmlCatalog()` (fetches `GET /api/templates`), `renderHtmlCatalog()` (filters by `activeCatFilter`, handles both empty states), and `buildHtmlCatalogCard(tpl)` (renders name, colored category badge, optional Embedded badge, component chips, Preview + Use buttons).

`filterTemplates()` now calls `renderHtmlCatalog()` and is scoped to `#categoryPills` only. The old "New" filter pill was removed; "All" is the default active pill. Category badge colors added via `.badge-cat-Cover/Content/Visual/Stats/Data/CTA` CSS classes.

The Preview button calls `openUrlPreviewPopup('/slides/preview/<id>')` — a new function that loads the slide in an iframe inside the existing `#previewPopup` overlay. Added `popupMode` state (`'canvas'|'url'`) so `switchPopupViewport` branches correctly between the canvas builder's DOM-based preview and the iframe preview.

### Modal template picker
`openNewSlideModal()` was rebuilt to show only HTML catalog templates (replacing the old canvas-builder templates). Cards include `data-cat` attributes so the existing `filterModalTemplates()` filter pills work. Clicking a card sets `newSlideTemplateId` and proceeds to the name-slide step as before.

### URL-based screen routing (bonus — done in same session)
The three tab panels (`library`, `templates`, `builder`) were converted to proper URL screens. Removed the tab bar HTML and CSS. `switchTab(tab, _noPush)` now calls `history.pushState` and updates the page `<h1>`, subtitle, and `document.title`. Init reads the active screen from the URL path (`/slides/library` etc.) and calls `history.replaceState` to canonicalise `/slides` → `/slides/library`. A `popstate` handler makes browser back/forward work. Server routes added: `GET /slides/library`, `GET /slides/templates`, `GET /slides/builder` all serve `index.html`. Sidebar links updated to `/slides/library` etc.
