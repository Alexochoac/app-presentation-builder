---
title: Builder — Translation Center — Restore Button — Surface restore-to-previous in the grid
type: Issue
priority: M
status: pending
area: builder
---

The "↻ Restore" button that reverts a translation to its stored `previous` value only renders in
the per-field translation popup (`openTranslationPanel`, `preview.html:1139`) — the one that opens
when you click a `contenteditable` field directly on the slide. It does **not** appear in the
**Translation Center grid** (`renderTcTable`, `preview.html:1533+`), which is the primary place users
edit translations (the preview banner even tells them to "edit translations in the Translation
Center"). Result: the Restore feature is effectively undiscoverable — a user working in the TC never
sees it. (Reproduced: cover slide Spanish rows for `credit`/`badge`/`headline`/`subheadline` have a
`previous`, but no restore control shows in the TC.)

**The data is already there — fix is frontend-only.** `/api/translations/fields-summary`
(`server.js:5286`) already returns each language entry as the full `{ current, previous, dirty }`
object in `row.langs[lang]`, and `/api/translations/restore` works. The TC grid simply never reads
`.previous`. Fix: in `renderTcTable`, when `row.langs[lang].previous` is truthy, render a small
restore affordance in that language cell that calls the existing `restoreTranslation` /
`/api/translations/restore` path (mirror the popup at `preview.html:1138-1140`).

**Context:** surfaced while verifying the Supabase migration (Slice 2 — decks/translations). The
migration deliberately preserved the `previous` field (254 values round-tripped into Postgres), so
the underlying data + endpoint are intact — this is purely the missing grid UI. Not a migration bug.
Related: [[project_supabase_migration]], [[project_translation_center_styling]].
