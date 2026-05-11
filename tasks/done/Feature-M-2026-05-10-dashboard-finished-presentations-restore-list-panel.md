---
title: Dashboard — Finished Presentations — Restore full list panel
type: Feature
priority: M
status: done
area: dashboard-ui
---

The "Finished Presentations" panel was removed from the Dashboard during the May 2026 nav restructure (`Feature-H-2026-05-10-nav-merge-builder-decks-restructure-sections.md`) with the intent to move it into the Builder section — but only a compact collapsible strip was added there, not the full list. Restore it as a second panel on the Dashboard (below the "Publication Activity" analytics panel) with the original functionality: paginated card/list view of all published presentations from `GET /api/presentations`, search by name/customer, date filter, sort options (newest/oldest/name), delete (`DELETE /api/presentations/:id`), and a publish/re-publish button per item. Related idea files for future enhancements: `idea-2026-04-22-dashboard-finished-presentations-track-shares-and-show-shared-to.md` and `idea-2026-04-22-dashboard-finished-presentations-preset-filter-views.md`.

## Implementation Summary

**Problem:** The Finished Presentations full-list panel had been removed from the Dashboard during a prior nav restructure. The Builder section only got a compact strip; the dashboard lost the full CRUD list entirely.

**File changed:** `builder/features/dashboard/index.html`

**What was added:**

A new `<section class="panel">` below the "Recent Activity" panel containing:

1. **Filter bar** — search input (client-side, filters by presentation name + customer name), a flatpickr date range picker pill (filters by `publishedAt`/`createdAt`), and a sort dropdown (Newest first / Oldest first / Name A–Z).

2. **Paginated list** (`#fpList`) — 10 items per page. Each row shows:
   - Presentation name (bold) + customer name · slide count (sub-line)
   - Relative time ago (e.g. "3 days ago")
   - Action buttons: **View** (link to `/view/:id`, opens new tab), **Re-publish** (`POST /api/presentations/:id/publish`), **Delete** (confirm dialog → `POST /api/presentations/:id/archive` then `DELETE /api/presentations/:id`, required by server's two-step delete constraint)

3. **Pagination controls** (`#fpPagination`) — Prev/Next buttons + "Page N of M" label, hidden when only one page.

4. **CSS additions** — `.fp-list`, `.fp-card`, `.fp-card-info`, `.fp-card-name`, `.fp-card-sub`, `.fp-card-meta`, `.fp-card-actions`, `.fp-btn`, `.fp-btn-danger`, `.fp-pagination` — all using existing CSS variables from `app-style.css`.

**Data strategy:** The panel reuses `window._viewsPresentations` already fetched by the dashboard's existing IIFE (no extra network request on load). After a delete, it re-fetches `GET /api/presentations` to sync both the FP list and `window._viewsPresentations`.

**Flatpickr reuse:** The existing `flatpickr` CDN import (already on the page for the views chart date picker) is reused for the FP date range filter — no additional script tag needed.
