---
title: Dashboard — Finished Presentations — Published state, archive flow, and safe delete
type: Feature
priority: M
status: done
area: dashboard-ui, build-deploy
splits-off: Feature-M-2026-04-29-builder-save-replace-existing-presentation
---

Tracks whether a finished presentation has been published to Cloudflare Pages, changes the card actions accordingly, and protects published presentations from accidental deletion.

## Behaviour

### Published state
- When Publish succeeds, store `publishedAt` (ISO date string) on the presentation record in `presentations.json`
- Card shows a "Published" badge + the live Cloudflare Pages URL beneath the metadata

### Actions after publish
| Action | Before publish | After publish |
|--------|---------------|---------------|
| Edit | ✓ opens edit modal | ✓ still works — edits metadata, rebuilds, pushes same folder so link is unchanged |
| Publish | ✓ first publish | → removed (updating live content goes through the builder Replace flow) |
| Duplicate | ✓ | ✓ |
| Delete | ✓ | → replaced by **Archive** |

### Archive
- Soft-delete: sets `archivedAt` on the record, hides card from the main list
- Does NOT delete the `finished-presentations/[id]/` folder or push anything — the Cloudflare URL stays live
- Show an "Archived" in the same card with a filter 
- Archive action also available on unpublished presentations (to clean up the dashboard without deleting)

### Unarchive
- Archived cards show an **Unarchive** action to restore them to the main list
- Clears `archivedAt` on the record

### Hard delete (Phase 1 = strong confirmation modal, no role system yet)
- Only available on archived presentations
- **If `publishedAt` is set:** Warning modal: "This presentation is published and may already be shared with the customer. Deleting it will break their link. Consider republishing with updated content instead — that updates the page without changing the URL."
- **If never published:** Simpler modal: "Delete permanently — this cannot be undone."
- Two buttons: Cancel / Delete permanently
- On confirm: removes from `presentations.json`, removes the folder from disk (does NOT auto-push)

## Data changes
Add optional fields to each presentation record in `presentations.json`:
- `publishedAt` — ISO date string or null
- `archivedAt` — ISO date string or null

## Notes
- "Update without changing the link" already works today: Edit → Republish rebuilds into the same `finished-presentations/[id]/` folder and pushes. The customer URL never changes.
- Admin roles don't exist in Phase 1 — guard hard-delete with a strong confirmation modal for now.

## Implementation Summary

### Files changed
- `builder/server.js`
- `builder/features/dashboard/index.html`

### Server changes (`server.js`)

**`POST /api/presentations/:id/publish`** — after a successful `git push`, reads `presentations.json` and writes `publishedAt` (ISO timestamp) onto the record if it isn't already set. Also fixed a bug where the `nothingToCommit` check only inspected `stdout` — on some git versions the "nothing to commit" message goes to `stderr`, causing republish to error instead of returning `alreadyPublished: true`. Fixed by combining `stdout + stderr` for the check.

**`DELETE /api/presentations/:id`** — now requires `archivedAt` to be set on the record; returns 400 if the presentation has not been archived first. Uses `splice` instead of `filter` so the exact record can be validated before removal.

**`POST /api/presentations/:id/archive`** — new endpoint, sets `archivedAt` to current ISO timestamp and writes `presentations.json`.

**`POST /api/presentations/:id/unarchive`** — new endpoint, deletes `archivedAt` from the record and writes `presentations.json`.

### Dashboard UI changes (`index.html`)

**`buildItem(p)`** — rewritten to be state-aware:
- Shows a green **Published** badge + live URL row when `publishedAt` is set
- Shows a muted **Archived** badge and 60% opacity when `archivedAt` is set
- Action menu is conditional:
  - Active, unpublished: Edit · Duplicate · Publish · Archive
  - Active, published: Edit · Duplicate · Archive (Publish removed — update-without-changing-link goes through the builder Replace flow, split-off task)
  - Archived: Edit · Duplicate · (Re)publish · Unarchive · Delete permanently
- Archive, Unarchive, and hard delete handlers call the new API endpoints and update `allItems` + re-render in place

**`applyFilters()`** — added `_showArchived` flag (default `false`). When false, archived records are excluded; when true, only archived records are shown (the two views are mutually exclusive).

**Filter bar** — added **Show archived** toggle pill that flips `_showArchived`, toggles the `active` CSS class, and updates its own label to "Hide archived" when on.

**Hard delete modal (`#hardDeleteModal`)** — new modal with conditional body text: published presentations show the "breaks their link" warning; never-published presentations show a simple "cannot be undone" message. Confirm button calls `DELETE /api/presentations/:id`, removes the record from `allItems`, and re-renders. Modal background transparency bug fixed by removing the inline `background:var(--surface)` from the inner div so the CSS rule (`background: #1c1c1e`) applies correctly.

### Design decision recorded
Republish was removed from published cards during implementation. The original spec listed it as a dashboard action, but the user clarified that updating a live presentation's content should only happen through the builder's "Replace existing" flow (tracked in the split-off task `Feature-M-2026-04-29`). The Publish button disappears entirely once a presentation is published.
