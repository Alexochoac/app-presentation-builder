---
title: Zone Builder — 7 — HTML Assembler + Save to Disk
type: Feature
priority: H
status: done
area: builder
order: 7
series: zone-builder
depends-on: Feature-H-2026-05-14-zone-builder-6-properties-panel-component-settings.md
---

Wire the Save button. The builder reads its in-memory state, assembles a complete anatomy-compliant HTML file, and writes it to disk. The slide is then registered in slide-library.json.

## What "Save" produces

A valid slide HTML file at `builder/features/slides/slide-NN-[name].html` that:
- Passes the anatomy spec checklist (all 5 layers)
- Uses CSS variables only — no hardcoded colors
- Has data-edit + data-lang-key on every text node
- Has all interactive elements wired via Track.*() in the IIFE script
- Has a scoped `<style>` block (layout only, no component CSS)
- Has a scoped `<script>` IIFE block
- Has `data-slide` and `data-slide-mode` on the root element

## HTML assembler — how it works

The assembler takes the in-memory slide state and produces the final HTML by:

1. **Root element**: inject slide-id and data-slide-mode="sequence"
2. **Logo + header row**: inject from the anatomy skeleton template, bind section-label and headline values
3. **Body zone**: iterate over slots → for each slot, iterate over components → render each component's HTML fragment with actual content values substituted
4. **Style block**: collect all scoped CSS from components + any layout-specific rules. Strip any class names that belong to component scripts (ls-tabs, ls-carousel, etc. — they inject their own CSS)
5. **Script block**: build one IIFE that:
   - Gets slide and slideId
   - Includes Track.*() calls for any non-standard interactive elements
   - Calls `setTimeout(function() { if (window.PE) PE.initSlide(slide); }, 0)`
6. **data-builder-only strip**: remove all elements marked `data-builder-only` (these are builder controls, not customer content)

## Anatomy checklist — enforced at save time

Before writing to disk, the assembler validates:
- [ ] data-slide present on root
- [ ] data-slide-mode present on root
- [ ] Every contenteditable element has data-edit + data-lang-key
- [ ] No inline color styles with hardcoded hex (regex scan)
- [ ] Script block contains the Track.slideId + PE.initSlide pattern

If validation fails, show an error in the UI and do NOT write the file.

## Slide ID and file name assignment

On first save:
- User is prompted for a slide name (if not already set in the top bar)
- The next available slide number is found by scanning existing files in builder/features/slides/
- File is written as `slide-NN-[slug].html`
- Slide is registered in `builder/data/slide-library.json` with a new entry

On subsequent saves (editing existing slide):
- File is overwritten in place
- slide-library.json entry is updated (lastModified timestamp)

## API endpoint

`POST /api/slide-builder/save`

Request body:
```json
{
  "slideId": "ls20-product-overview",
  "slideName": "Product Overview",
  "layoutId": "tabbed",
  "headerZone": {
    "sectionLabel": "Our Product",
    "headline": "Built for Modern Teams"
  },
  "bodyZone": {
    "slots": {
      "main": [
        { "component": "tabs", "id": "tabs-1", "content": { ... } }
      ]
    }
  },
  "style": { },
  "slideMode": "sequence"
}
```

Response:
```json
{
  "ok": true,
  "filePath": "builder/features/slides/slide-20-product-overview.html",
  "slideId": "ls20-product-overview"
}
```

## slide-library.json registration

New entry added on first save:
```json
{
  "id": "ls20-product-overview",
  "name": "Product Overview",
  "file": "slide-20-product-overview.html",
  "layoutId": "tabbed",
  "createdAt": "2026-05-14T...",
  "lastModified": "2026-05-14T...",
  "builtWith": "zone-builder"
}
```

The `builtWith: "zone-builder"` flag distinguishes slides built with the new builder from those written by hand or via Claude.

## Acceptance criteria

- [ ] Clicking Save assembles the full anatomy-compliant HTML from in-memory state
- [ ] Anatomy validation runs before write — invalid slides show an error, nothing is written
- [ ] File is written to builder/features/slides/ with correct NN prefix
- [ ] slide-library.json is updated with the new/updated entry
- [ ] Saved slide is immediately previewable in the existing slide browser
- [ ] Subsequent saves overwrite the file and update lastModified
- [ ] `data-builder-only` elements are stripped from the saved output
- [ ] No hardcoded hex colors in the saved HTML (enforced by validation)
- [ ] The saved file passes a manual anatomy checklist review

## Implementation Summary

**Files modified:**
- `builder/features/zone-builder/index.html` — client-side assembler + Save button wiring
- `builder/server.js` — POST /api/slide-builder/save endpoint + zone-builder handling in library-preview and library-edit

**What was built:**

**Client-side (zone-builder/index.html):**
- Added `savedSlideId: null` to state (null = new slide, real lsNN-slug after first save)
- Wired Save button: `onclick="zbSave()"` replacing the placeholder title
- `zbSave()` — validates slide name, calls `assembleHtml()`, runs `validateSlide()`, POSTs to API, stores returned `slideId` in `state.savedSlideId`, resets dirty flag, shows "Saved" flash on button
- `assembleHtml()` — clones the canvas DOM, strips `.zone-label`, `.zb-component-label`, `.zb-comp-remove`, `[data-builder-only]`, stamps `data-lang-key` on header fields (section-label and headline), removes `pointer-events:none` from all inline styles, flattens `.zb-component` wrappers by replacing each with its `.zb-component-content` child (preserving user-applied inline styles), then wraps in `<div class="slide" data-slide="__SLIDE_ID__" data-slide-mode="sequence">` with a `<style>` layout block and `<script>` IIFE block
- `buildLayoutCss(slideId)` — generates scoped CSS rules for all `.zb-*` layout classes so the slide renders correctly in the viewer (which doesn't load zone-builder's stylesheet)
- `buildScriptBlock(slideId)` — IIFE with `Track.slideId(slideId)` + `PE.initSlide(slide)` wrapped in setTimeout
- `validateSlide(html)` — checks for: data-slide, data-slide-mode, data-lang-key, PE.initSlide, no inline hex colors. Returns array of error strings; save is blocked if non-empty.

**Server-side (server.js):**
- `POST /api/slide-builder/save` — new slides: scans all `slide-NN-` and `lsNN-` files to find next available NN, generates `slideId = lsNN-slug`, filename = `slide-NN-slug.html`, replaces `__SLIDE_ID__` placeholder in HTML, writes file, pushes entry to `library.slides` with `builtWith: 'zone-builder'`. Re-saves: finds existing entry by `savedSlideId`, overwrites file in place, bumps `lastModified`. Both paths write updated slide-library.json.
- `GET /slides/library-preview/:id` — added early-exit for zone-builder slides: reads `libSlide.file` directly from disk, strips contenteditable for readonly display
- `GET /slides/library-edit/:id` — same zone-builder handling so the slide appears in the library editor view

**Key design decisions:**
- `__SLIDE_ID__` placeholder in the assembled HTML — client assembles HTML before the server knows the real ID; server does a global replace on save
- `.zb-*` class names kept in saved output — layout CSS is embedded in the slide's own `<style>` block, making the fragment self-contained
- `builtWith: 'zone-builder'` flag in library entry — lets preview/edit endpoints branch without relying on templateId presence
