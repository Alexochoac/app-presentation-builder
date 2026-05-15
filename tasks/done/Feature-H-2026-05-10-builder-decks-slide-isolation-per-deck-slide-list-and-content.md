---
title: Builder — Decks — Slide Isolation — Give each deck its own slide list and content
type: Feature
priority: H
status: pending
area: builder
---

Each deck currently shares the same global slide list (`data/deck.json`) and the same flat slide content (`edits` in `slide-library.json`). This task makes slides fully per-deck: each deck owns its own slide list and its own content edits, so switching decks loads a completely different set of slides.

## Current Architecture (problem)

```
data/
  deck.json          ← single global slide list (all decks share this)
  slide-library.json ← edits: { key: value }  ← flat, shared across all decks
```

Switching the active deck changes branding only — the slide list and content stay the same.

## Target Architecture

```
data/
  decks/
    default/
      deck.json        ← slide list for the Default/SoftSolution deck
    deck-1778.../
      deck.json        ← slide list for the TEST deck (empty on creation)
  slide-library.json   ← deckEdits: { [deckId]: { key: value } }
```

## Implementation Plan

### 1. Migrate data on server startup (one-time)

- Create `data/decks/default/` folder and move `data/deck.json` → `data/decks/default/deck.json`
- For each library slide in `slide-library.json`: move `edits: {...}` → `deckEdits: { default: {...} }`
- For any existing deck folder that has no `deck.json`, create an empty one: `{ "title": "", "slides": [] }`
- Run migration automatically on first boot if `data/decks/default/deck.json` does not exist

### 2. Server path helpers

```js
function getDeckJsonPath(deckId) {
  return path.join(__dirname, 'data', 'decks', deckId, 'deck.json');
}
function readDeckById(deckId) {
  var p = getDeckJsonPath(deckId);
  if (!fs.existsSync(p)) return { title: '', slides: [] };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeDeckById(deckId, data) {
  var dir = path.join(__dirname, 'data', 'decks', deckId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getDeckJsonPath(deckId), JSON.stringify(data, null, 2));
}
function getActiveDeckId() {
  return readDecks().activeDeckId || 'default';
}
```

### 3. Update `/api/deck` endpoints

All four deck endpoints read/write using `readDeckById(getActiveDeckId())`:

| Endpoint | Change |
|---|---|
| `GET /api/deck` | `readDeckById(activeDeckId)` instead of reading `DECK_PATH` |
| `PUT /api/deck` | `writeDeckById(activeDeckId, merged)` |
| `POST /api/deck/slides` | same — write to active deck folder |
| `DELETE /api/deck/slides/:id` | same |

### 4. Scope slide content edits per deck

In `slide-library.json`, replace:
```json
{ "id": "lib-company", "edits": { "title": "SoftSolution" } }
```
With:
```json
{ "id": "lib-company", "deckEdits": { "default": { "title": "SoftSolution" }, "deck-1778...": {} } }
```

Update `POST /api/deck/slides/:id/edits`:
- Write to `libSlide.deckEdits[activeDeckId]` instead of `libSlide.edits`

Update `POST /api/library/:id/edits`:
- Accept an optional `deckId` param; write to `deckEdits[deckId]`

Update all slide renderers (`renderLayoutToHtml`, `GET /slides/deck-preview/:id`, frozen build):
- Resolve edits as: `Object.assign({}, libSlide.deckEdits?.default, libSlide.deckEdits?.[activeDeckId])`
- Falls back to flat `edits` for backward compatibility during migration

### 5. New deck creation

When `POST /api/decks` creates a deck:
- Create `data/decks/[newId]/` folder
- Write an empty `deck.json`: `{ "title": "", "slides": [] }`
- Initialize `deckEdits[newId] = {}` for every library slide (or do lazily on first edit)

When `POST /api/decks/:id/duplicate` copies a deck:
- Deep-copy source deck's `deck.json` to `data/decks/[newId]/deck.json`
- Deep-copy `deckEdits[sourceId]` → `deckEdits[newId]` for every library slide

### 6. Active deck switch

When `POST /api/decks/active` sets a new active deck:
- No file copy needed — the server now reads the right `deck.json` dynamically
- The builder UI reloads `GET /api/deck` which now returns the new deck's slides

### 7. Builder UI (`/slides`)

- On load, `GET /api/deck` now returns the active deck's slides — no UI change needed
- The deck name shown in the builder header should come from `GET /api/decks/active` 
- "Open Builder" from `/builder` always opens the currently active deck

### 8. Update `/builder` preview

- `GET /slides/deck-preview/:id` needs `deckId` context to resolve the right `deckEdits`
- Pass `?deckId=[id]` or read active deck from session
- Simplest: always use `getActiveDeckId()` server-side (already in session)

## Migration Safety

- Keep `data/deck.json` as a fallback read if `data/decks/default/deck.json` is missing
- Keep flat `edits` on library slides as fallback if `deckEdits` is absent
- This means the migration is non-destructive and backward-compatible

## Dependencies

- Blocked by: `Feature-H-2026-04-25-builder-my-decks-card-per-deck-branding-settings-premium.md` ✅ (done)
- After this: `Feature-L-2026-04-30-builder-translation-settings-move-to-deck-folder-multi-deck.md` should follow
