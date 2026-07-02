---
title: Analytics — Stable presentation id across re-publish (period-over-period continuity)
type: Feature
priority: M
status: pending
area: other
---

Keep a presentation's analytics continuous when it is re-published.

**Problem**
Every published deck is tracked by its URL `/public/<id>/`, and Umami ties all
views/events to that exact URL. Re-publishing mints a **new id** (new URL), so:
- the old views stay orphaned under the old id,
- the dashboard counts only currently-live ids, so a re-published deck looks like it
  was born on re-publish day (no history),
- period-over-period deltas reset to "new" and cumulative totals undercount after
  every re-publish (a deck's history is split across every id it has ever had).

**Evidence (2026-07-02)**
Current live decks `00000001 / 00000003 / 00000004` showed "new" on the Last-7-days
KPIs because the prior week's views were on old ids `00000007 / 00000008` — the same
decks before a re-publish. Confirmed via direct Umami query on the TEST website.

**Fix (options)**
1. Give each presentation a **stable id/URL that survives re-publishing** (re-publish
   overwrites the same `/public/<id>/` instead of minting a new id). Cleanest.
2. Or **alias/merge** old ids → the current one so the dashboard queries can fold a
   deck's full history together (keep an id-history list per presentation).

Ties into the publishing flow. See project memory `project_publish_via_git_is_legacy`
and the analytics event taxonomy note.
