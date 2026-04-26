---
title: Dashboard — Finished Presentations — Published state, archive flow, and safe delete
type: Feature
priority: M
status: pending
area: dashboard-ui, build-deploy
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
| Publish | ✓ first publish | → becomes **Republish** (same git flow, overwrites same folder, URL never changes) |
| Duplicate | ✓ | ✓ |
| Delete | ✓ | → replaced by **Archive** |

### Archive
- Soft-delete: sets `archivedAt` on the record, hides card from the main list
- Does NOT delete the `finished-presentations/[id]/` folder or push anything — the Cloudflare URL stays live
- Show an "Archived" section at the bottom of the dashboard (collapsed by default)
- Archive action also available on unpublished presentations (to clean up the dashboard without deleting)

### Hard delete (Phase 1 = strong confirmation modal, no role system yet)
- Only available on archived presentations
- Warning modal: "This presentation is published and may already be shared with the customer. Deleting it will break their link. Consider republishing with updated content instead — that updates the page without changing the URL."
- Two buttons: Cancel / Delete permanently
- On confirm: removes from `presentations.json`, optionally removes the folder from disk (does NOT auto-push)

## Data changes
Add optional fields to each presentation record in `presentations.json`:
- `publishedAt` — ISO date string or null
- `archivedAt` — ISO date string or null

## Builder — Create presentation: New link vs. Replace existing

When finishing a new deck in the builder, the "Save as finished presentation" step should offer two options:

**Option A — New presentation (new link)**
- Current behaviour: generates a new ID and folder
- Creates a fresh `finished-presentations/[new-id]/` — gives the customer a brand-new URL

**Option B — Replace an existing presentation (same link)**
- User picks an existing finished presentation from a dropdown (shows published ones first)
- Builder rebuilds into the same `finished-presentations/[existing-id]/` folder, overwriting `index.html` and assets
- The customer's link stays identical — no need to resend anything
- Should warn if the selected presentation is already published: "This will overwrite the live version at [URL]. The customer's link will continue to work but will show the updated content."
- Records a `replacedAt` timestamp on the presentation record

This flow is the intentional "update without breaking the link" path, complementing the Republish action on the dashboard card.

## Notes
- "Update without changing the link" already works today: Edit → Republish rebuilds into the same `finished-presentations/[id]/` folder and pushes. The customer URL never changes.
- Admin roles don't exist in Phase 1 — guard hard-delete with a strong confirmation modal for now.
