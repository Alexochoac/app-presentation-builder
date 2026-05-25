---
id: Issue-H-2026-05-24-integrations-slide-cards-grid-logo-upload-add-delete-fix
title: "Integrations slide — logo upload broken, no delete card, count floor locked at 9"
status: done
priority: high
area: builder
created_at: 2026-05-24
completed_at: 2026-05-24 18:00
---

## Problem

On the SoftSolution deck, slide 15 (Integrations / `tpl-new-cards-grid`) had three broken behaviours:

1. **`+ Logo` button did nothing** — clicking it opened a file picker but the upload silently failed every time with no error shown.
2. **No way to delete cards** — only "Add card" existed; once a card was added it could not be removed.
3. **Card count could never go below 9** — even if the user tried to reduce cards, the template always rendered at least 9 (the default count) because of a `Math.max` floor.

## Root Causes

### 1. Wrong upload endpoint and response field
The logo upload JS called `POST /upload-image` with a `FormData` body, but this route does not exist on the server.
The real endpoint is `POST /api/upload-image`, which expects a JSON body `{ filename, data }` where `data` is a base64 data URL.
Additionally, the response field was read as `j.url` but the server returns `{ path: '...' }`.

**Before:**
```js
var fd = new FormData(); fd.append('file', file);
fetch('/upload-image', { method: 'POST', body: fd })
  .then(r => r.json())
  .then(j => { var url = j.url; ... });
```

**After:**
```js
var reader = new FileReader();
reader.onload = function(ev) {
  fetch('/api/upload-image', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, data: ev.target.result })
  })
  .then(r => r.json())
  .then(j => { var url = j.path; ... });
};
reader.readAsDataURL(file);
```

### 2. No delete button
The `renderCardsGridLayout` function in `server.js` rendered each card without a delete control. Nothing in the client JS handled removal either.

### 3. Card count floor
```js
// Before — Math.max locks the floor at DEFAULT_CARDS.length (9)
var totalCards = Math.max(DEFAULT_CARDS.length, Math.min(20, parseInt(...)));

// After — only use DEFAULT_CARDS.length when no saved count exists
var totalCards = savedEdits['int-card-count'] != null
  ? Math.min(20, Math.max(1, parseInt(savedEdits['int-card-count'], 10)))
  : DEFAULT_CARDS.length;
```

## Key Learning: Slide files vs server-side templates

This session also surfaced an important architectural distinction that is easy to miss:

| Type | Where | How identified |
|---|---|---|
| File-based slide | `builder/features/slides/slide-NN-*.html` | Referenced directly by file path |
| Server-side template | `renderXxxLayout()` in `server.js` | `templateId: 'tpl-new-*'` in `slide-library.json` |

**How to find which template a deck slide actually uses:**
1. Open `builder/data/decks/default/deck.json` → find the slide's `librarySlideId`
2. Look up that ID in `builder/data/slide-library.json` → read the `templateId` field
3. Search `server.js` for that `templateId` → that function is the real template

In this case:
- Deck slide 15 → `librarySlideId: "lib-integrations"` → `templateId: "tpl-new-cards-grid"` → `renderCardsGridLayout()` in `server.js`

The HTML file `slide-15-clone-of-integrations.html` is a separate, unrelated file not used by any active deck.

## Files Changed

- `builder/server.js` — `renderCardsGridLayout()` function (~line 2880):
  - Fixed card count floor (3 lines)
  - Added `int-del-btn` button to each rendered card (1 line)
  - Added `.int-del-btn` CSS styles (2 lines)
  - Fixed `attachLogoBtn`: wrong endpoint → `/api/upload-image`, FormData → FileReader+base64, `j.url` → `j.path`
  - Added `deleteCard()` function: removes card from DOM, renumbers remaining cards' `data-edit` keys, dispatches `slide-carousel-save` for each renamed key + new count
  - Added `attachDelBtn()` helper
  - Updated add-card HTML to include `int-del-btn` in new cards
  - Updated add-card JS to call `attachDelBtn()` on newly created cards

- `builder/features/slides/slide-15-clone-of-integrations.html` — updated as a side effect of the investigation (fixed logo paths, added `data-edit="logo-row"`, added customer logo upload, added add/delete card support). This file is not used by the SoftSolution deck but may be useful as a standalone template in future.
