---
title: Slides — My Library — Grid/list view, folder sidebar, search and filtering
type: Feature
priority: M
status: done
area: slides
---

Rebuild the My Library section of the Slides page with a proper browsing UI: view toggle (grid/list), a folder sidebar auto-derived from decks, and real-time search filtering.

## Implementation Summary

**Problem:** My Library was a flat, unorganised card grid with no way to filter, search, or group slides by deck. As the library grew it became harder to find specific slides.

**Files changed:**

- `builder/server.js` — `GET /api/slide-library` endpoint enhanced
- `builder/features/slides/index.html` — HTML, CSS, and JS all updated

**Backend (`server.js`):**

The endpoint previously returned `{ success: true, data: slides[] }`. It now builds a deck membership map by reading `decks.json` (via `readDecks()`) and each deck's `deck.json` (via `readDeckById()`), matching `slide.librarySlideId` to library slide IDs. Each slide in the response gains a `decks: [{ id, name }]` field listing every deck that references it. The response shape changed to `{ success: true, data: { slides: [], decks: [] } }` — both the enriched slides and the full deck list are returned so the frontend can render the folder sidebar without a second API call. The membership lookup is wrapped in try/catch so a missing or corrupt deck file is non-fatal.

**Frontend — HTML (`#panel-library`):**

Replaced the flat header + grid structure with:
- A **toolbar** row: search input (`#libSearch`), grid/list view toggle (`#viewBtnGrid` / `#viewBtnList`), New Slide button
- A **two-column body**: `#libFolders` sidebar on the left + `.lib-content` on the right
- Inside `.lib-content`: count row, loading state, empty state, `#libraryGrid` (cards), `#libraryList` (list rows)

**Frontend — CSS:**

Added: `.lib-toolbar`, `.lib-search`, `.lib-view-toggle`, `.lib-view-btn`, `.lib-body`, `.lib-folders`, `.lib-folder-item`, `.lib-folder-name`, `.lib-folder-count`, `.lib-folder-divider`, `.lib-content`, `.lib-count-row`, `.lib-list`, `.lib-list-row`, `.lib-list-thumb`, `.lib-list-name`, `.lib-list-template`, `.lib-list-deck-tags`, `.lib-list-deck-tag`, `.lib-list-actions`.

**Frontend — JS:**

New state variables: `libraryDecks`, `activeFolder` (default `'all'`), `libraryView` (default `'grid'`), `librarySearch`.

New functions:
- `getFilteredSlides()` — applies folder filter + search string to `librarySlides`
- `renderLibraryFolders()` — renders the folder sidebar: All Slides, one item per deck (count of slides in that deck), Unassigned at bottom if any slides have no deck membership
- `buildFolderItem(id, label, count)` — helper for a single folder item
- `setActiveFolder(id)` — sets `activeFolder`, re-renders folders + grid
- `setLibraryView(view)` — toggles between `'grid'` and `'list'`, re-renders
- `setLibrarySearch(val)` — updates `librarySearch`, re-renders
- `buildLibraryCardActions(slide)` — extracted from `buildLibraryCard()` so actions are shared with list rows
- `buildLibraryListRow(slide)` — builds a compact list row with thumb iframe, editable name, template label, deck tags, and action buttons

Updated functions:
- `loadLibrary()` — handles both old `data: []` and new `data: { slides, decks }` response shapes; calls `renderLibraryFolders()` before `renderLibraryGrid()`
- `renderLibraryGrid()` — now uses `getFilteredSlides()` for count and content, branches on `libraryView` to populate either the grid or the list container
- `buildLibraryCard()` — actions section extracted into `buildLibraryCardActions()`; all other behaviour unchanged
