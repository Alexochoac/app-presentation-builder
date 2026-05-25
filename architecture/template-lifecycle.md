# Template Lifecycle — From Blueprint to Frozen Presentation

How a slide moves through the system: Template → Library Slide → Deck Slide → Finished Presentation.

---

## The Analogy

| Stage | Real-world analogy |
|---|---|
| Template | Cookie cutter — the blank mold, never changes |
| Library Slide | Cookie dough — your filled-in master copy |
| Deck Slide | Decorated cookie — per-deck customizations layered on top |
| Finished Presentation | Packaged cookie — frozen, self-contained, sent to the customer |

---

## Stage 0 — Template (the blueprint)

**Where it lives:** `builder/data/templates.json` + an HTML file in `builder/features/slides/`

**What it contains:**
- `id` — unique, never changes (e.g. `tpl-new-cover`)
- `name`, `category` — shown in the Templates tab UI
- `slideMode` — `"sequence"` (normal) or `"embedded"` (drill-down only)
- `components` — which interactive components the slide uses (carousel, tabs, etc.)
- `defaultEdits` — placeholder field values shown before any real content is added
- `file` — path to the HTML source (for zone-builder templates)
- `builtWith` — `"zone-builder"` if created in the Zone Builder; omitted for code-built templates

**Key HTML conventions:**
- `data-edit="fieldname"` on every editable element — this is how the builder knows what to save
- `data-builder-only=""` on any UI controls that should be stripped in the final output

**How it appears in the UI:** Grid of cards in the Templates tab. Nothing is saved, nothing is customized yet.

---

## Stage 1 — Library Slide (the reusable master copy)

**Triggered by:** User clicks "Use Template" in the Templates tab.

**Where it lives:** `builder/data/slide-library.json`

**What gets created:**
```json
{
  "id": "lib-company",
  "name": "Company Intro",
  "templateId": "tpl-new-company",
  "edits": {
    "headline": "Quality inspection is all we do",
    "section-label": "Our Company"
  },
  "deckEdits": {}
}
```

- `templateId` — permanent link back to the template it came from
- `edits` — real content that applies everywhere this slide is used (across all decks)
- `deckEdits` — starts empty; filled in per-deck as customizations are made

**Key point:** One library slide can be used in many decks. The `edits` field is the shared baseline.

---

## Stage 2 — Deck Slide (the per-deck customization)

**Triggered by:** User adds a library slide to a deck and edits it inside the Builder.

**Where it lives:** Two places:
- `builder/data/decks/[deckId]/deck.json` — the slide's position in the deck
- `builder/data/slide-library.json` → `deckEdits[deckId]` — the overrides

**deck.json entry:**
```json
{ "id": "deck-lib-company-xxx", "librarySlideId": "lib-company", "visible": true }
```

**deckEdits entry (inside slide-library.json):**
```json
"deckEdits": {
  "deck-abc123": {
    "headline": "Osprey Technology — a closer look"
  }
}
```

**Render rule:** `edits` (base) **+** `deckEdits[deckId]` (overrides) = what the user sees.
Deck-specific values always win over base values.

**In the Builder canvas:**
- `contenteditable` is ON — user can click and type directly
- `data-builder-only` elements are visible (edit controls, add buttons, etc.)
- Saves go to `POST /api/deck/slides/:id/edits`

---

## Stage 3 — Finished Presentation (the frozen output)

**Triggered by:** User clicks Publish in the Builder.

**Where it lives:**
- `builder/data/presentations.json` — metadata snapshot
- `finished-presentations/[presId]/index.html` — the self-contained HTML file

**What `buildFrozenPresentation()` does:**

1. Resolves each deck slide → library slide → template
2. Merges `edits` + `deckEdits[deckId]` into final field values
3. Renders the full HTML via the template's render function
4. **Strips** `contenteditable` — no editing in the customer view
5. **Removes** `data-builder-only` elements — no builder controls visible
6. **Copies** images to `finished-presentations/shared/` and rewrites all image paths
7. **Bakes** translations: wraps `[data-edit]` text in `<span data-lang="en">` / `<span data-lang="es" hidden>` siblings
8. **Inlines** CSS and JS so the file works with no server

**Result:** A single `index.html` that is completely self-contained — no app, no server, no live data needed.

---

## Side-by-Side Comparison

| Aspect | Library / Deck Preview | Frozen Presentation |
|---|---|---|
| `contenteditable` | YES | Stripped out |
| `data-builder-only` elements | Visible | Removed |
| Image paths | `/slides/uploads/...` (live server) | `../shared/...` (local copy) |
| Translations | Runtime switcher | Baked-in `<span data-lang>` spans |
| CSS | Linked files | Inlined `<style>` block |
| JavaScript | Linked component scripts | Inlined `<script>` blocks |

---

## Data Flow Summary

```
templates.json          ← the blueprint (never changes per use)
    ↓ "Use Template"
slide-library.json      ← edits{}  (shared master content)
    ↓ "Add to Deck"
deck.json               ← slide list order + visibility
slide-library.json      ← deckEdits[deckId]{}  (per-deck overrides)
    ↓ "Publish"
presentations.json      ← snapshot metadata
finished-presentations/[presId]/index.html  ← frozen output
```

---

## Render Chain (technical)

`GET /slides/deck-preview/:id`
→ look up deck slide in `deck.json`
→ find `librarySlideId` → look up in `slide-library.json`
→ find `templateId` → look up in `templates.json`
→ merge `edits` + `deckEdits[deckId]`
→ call render function (e.g. `renderHeroLayout`) in `server.js`
→ return full HTML page with component JS loaded

**⚠️ `server.js` is the sole source of truth for slide structure.** The `.html` files in `features/slides/` are reference only. All slide structure changes must go into render functions in `server.js`.
