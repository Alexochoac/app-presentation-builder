---
title: Builder — Save as finished: "Replace existing presentation" option
type: Feature
priority: M
status: pending
area: builder-ui, build-deploy
depends-on: Feature-M-2026-04-26-dashboard-published-presentation-state-archive-flow-safe-delete
---

Adds a second option to the builder's "Save as finished presentation" step so the user can overwrite an existing finished presentation instead of always creating a new one. This keeps the customer's link unchanged.

## Context

The parent task (dashboard-published-presentation-state-archive-flow-safe-delete) introduces `publishedAt` and `archivedAt` on presentation records and changes the dashboard actions accordingly. This task builds on top of that — the Replace dropdown should show published presentations first, and warn the user before overwriting a live one.

Currently the "Save as finished" flow always calls `POST /api/presentations` which generates a new ID and folder. A republish via Edit → Republish on the dashboard already overwrites the same folder (the link never changes), but there is no way to do this from a fresh builder session.

## Behaviour

### Two-option modal in the builder

When the user clicks "Save as finished presentation", show a modal with two options:

**Option A — New presentation (new link)**
- Current behaviour: generates a new ID and `finished-presentations/[new-id]/` folder
- Customer gets a brand-new URL

**Option B — Replace an existing presentation (same link)**
- Dropdown lists all non-archived presentations, published ones grouped first
- User selects the target presentation from the dropdown
- On select, auto-fill Company name, Contact Name, Role, and Presentation name from the target record — these fields become read-only (the identity fields must match; if the user needs different metadata, they should create a new presentation instead)
- If any identity field differs from what the builder has, warn: "The selected presentation belongs to [Company] / [Contact]. Your builder session has different metadata — select a different presentation or use New to create one."
- On confirm: rebuilds into `finished-presentations/[existing-id]/` overwriting `index.html` and assets
- Records `replacedAt` (ISO timestamp) on the presentation record
- If the selected presentation has `publishedAt` set, show inline warning before confirm: "This will overwrite the live version at [URL]. The customer's link will continue to work but will show the updated content."

### Identity field rule (simple Phase 1 implementation)
- Identity fields: `customerName`, `contactName`, `contactTitle`, `presentationName`
- If all four match the builder session → allow replace silently
- If any differ → show the warning above and block confirm until the user acknowledges or switches to Option A

## Data changes

Add optional field to presentation records:
- `replacedAt` — ISO date string (updated each time a replace is performed)

Note: `publishedAt` and `archivedAt` are added by the parent task — do not duplicate that work here.

## Server changes

### Existing endpoint to modify
`POST /api/presentations` — add an optional `replaceId` field to the request body:
- If `replaceId` is present: validate it exists, overwrite `finished-presentations/[replaceId]/` instead of creating a new folder, update the existing record in `presentations.json` with `replacedAt`, return the existing presentation's ID and URL
- If absent: current new-presentation behaviour unchanged

Alternatively, a dedicated `POST /api/presentations/:id/replace` endpoint is cleaner — use whichever fits the existing server structure better.

### Validation
- `replaceId` must be alphanumeric + hyphens (same regex as other IDs)
- Target presentation must exist in `presentations.json`
- Target must not be archived (`archivedAt` must be absent/null)

## Builder UI changes

The "Save as finished" button currently lives in the builder at:
`builder/features/dashboard/index.html` — find the exact trigger and modal.

Changes needed:
1. Replace single-step save with a two-option modal (Option A / Option B radio or tab)
2. Option B: dropdown populated via `GET /api/presentations` (filter out archived), published grouped first
3. Auto-fill and lock identity fields on dropdown select
4. Show inline warning if target is published
5. On submit: send `replaceId` to server if Option B is selected

## UX notes
- Default selection on modal open: Option A (no regressions for the common case)
- Dropdown label format: "[Customer] — [Presentation name] (Published)" or "(Draft)"
- "Replace existing" path should feel like a deliberate choice, not the default

## Out of scope
- Auto-push / republish after replace (user handles publish separately from the dashboard)
- Role-based access control (Phase 2)
- Merging slide content between sessions (always a full overwrite)
