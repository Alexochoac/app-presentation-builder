---
title: Slides — Template Creator — 3 — HTML generator
type: Feature
priority: H
status: done
area: slides
order: 3
---

Third task in the Template Creator series. Server-side generator that takes wizard data and outputs a fully anatomy-compliant HTML template file.

**Depends on:** Task 1 (data model & API), Task 2 (wizard UI — defines the input shape)

## Goal
Build a generator function in `builder/server.js` (or a separate `builder/lib/template-generator.js`) that receives the wizard payload and outputs a complete, valid HTML slide template with all 5 anatomy layers pre-wired.

## Input shape (from wizard)
```json
{
  "id": "ls16-stats",
  "name": "Stats Slide",
  "category": "Stats",
  "slideMode": "sequence",
  "layout": "stats-grid",
  "blocks": [
    { "type": "headline" },
    { "type": "section-label" },
    { "type": "stat", "feedKey": "revenue-q1", "feedType": "number" },
    { "type": "stat", "feedKey": "lead-count", "feedType": "number" },
    { "type": "paragraph" }
  ]
}
```

## Generator rules (must follow architecture/template-anatomy.md exactly)

### Root element
```html
<div class="slide content [id]" data-slide="[id]" data-slide-mode="[slideMode]">
```

### For every text block
- Add `data-edit="[key]"` with a short kebab-case key
- Add `data-lang-key="[id].[key]"` 
- Add `contenteditable spellcheck="false"`
- Add dummy placeholder text (never real content)

### For every interactive element (buttons, links)
- Add a `Track.click(slideId, 'label')` call in the scoped script block

### CSS block
- Layout only — no hardcoded theme colors
- All colors via CSS variables: `var(--accent)`, `var(--text)`, `var(--bg-card)`, `var(--border)`, `var(--text-muted)`
- Mobile-first, desktop override in `@media(min-width:769px)`
- Scoped to `.${id}` class

### Script block (always an IIFE)
```js
(function () {
  var slide = document.currentScript.closest('[data-slide]');
  var slideId = Track.slideId(slide);
  // tracking wired here per block
  setTimeout(function () { if (window.PE) PE.initSlide(slide); }, 0);
})();
```

### data-feed blocks
For each block with `feedKey` set:
```html
<span data-feed="[feedKey]" data-feed-type="[feedType]">0</span>
```

### Embedded mode
If `slideMode === 'embedded'`, add a comment at the top:
```html
<!-- embedded slide — triggered by data-trigger-slide="[id]" on parent -->
```

## Output
- Write the HTML file to `builder/features/slides/slide-[NN]-[name].html`
- Return the file path in the API response
- The file must pass the anatomy checklist in `architecture/template-anatomy.md`

## Suggested approach
Build layout templates as JS template strings per layout type (single-column, two-column, stats-grid, hero, list, cta). The generator picks the right base and injects the blocks into it.

## Reference
- `architecture/template-anatomy.md` — the canonical spec, read this first
- Existing slides in `builder/features/slides/` — reference for what valid output looks like
- `builder/features/slides/components/tracker.js` — Track helper API

## Implementation Summary

Created `builder/lib/template-generator.js` — a standalone module that exports `generateHtml({ id, slideMode, layout, blocks })`. It produces anatomy-compliant HTML with all 5 layers: scoped CSS (CSS variables only), `data-edit` + `data-lang-key` + `contenteditable` on every text block, `data-feed` on live-data blocks, a `Track.slideId()` IIFE script block, and an embedded-mode comment when `slideMode === 'embedded'`.

Six layout templates are supported: `single-col`, `two-col`, `stats-grid`, `hero`, `list`, `cta`. Each maps to a specific HTML structure; blocks are injected into the appropriate column slots.

`POST /api/templates` in `builder/server.js` was updated to require `builder/lib/template-generator.js` and invoke it when `layout` is present in the request body. When no `layout` is provided it falls back to accepting a raw `html` field (direct/import mode). The endpoint auto-numbers the output file (`slide-NN-slug.html`), writes it to `builder/features/slides/`, and appends the entry to `builder/data/templates.json`.

The wizard (`wzGenerate()` in `builder/features/slides/index.html`) was updated to send `layout + blocks` instead of client-generated HTML, so all generated templates pass through the server-side generator.
