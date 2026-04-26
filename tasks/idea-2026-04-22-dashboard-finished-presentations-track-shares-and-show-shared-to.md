---
title: Dashboard — Finished Presentations — Track shares and show Shared To section
priority: normal
status: pending
area: dashboard-ui
---

When a viewer submits the share form (name, role, email or WhatsApp number), save that data to a database tied to the presentation. On the Dashboard > Finished Presentations detail view, add a "Shared To" section that lists every person the presentation was shared with — showing their name, role, and contact (email or WhatsApp number).

The stored contact (email or phone number) is also used downstream to control access: only people the presentation was shared with can view it (auth gate — see related idea task `idea-2026-04-14-viewer-auth-gate-static-presentations-github-pages.md`).

Requires deciding on a backend storage approach for Phase 1 (likely a lightweight JSON store or a simple hosted DB like Supabase/PocketBase) since the project is currently file-based with no database.
