---
title: Infrastructure — Database — Migrate to Supabase Postgres — Multi-user foundation
type: Feature
priority: H
status: pending
area: other
---

Execution task for Phase 2 of the multi-user migration. Consolidates every phase/step for moving the
app off flat-JSON single-user storage onto Supabase Postgres, fixing the documented sustainability
problems during the move. Decision + rationale live in
[Idea-L-2026-05-17-infrastructure-database-plan-postgres-for-app.md](Idea-L-2026-05-17-infrastructure-database-plan-postgres-for-app.md).

Rules: fix the sustainability problems DURING the move (not lift-and-shift); full data-layer swap,
one domain at a time (settings → decks → library → presentations); keep existing function signatures
(write-through in-memory cache, reads stay synchronous); the app keeps running and JSON files stay as
backup/rollback until each domain is verified. Supabase Free tier covers this whole phase (text/JSON
data is a few MB; Supabase bills on DB size/storage/egress, NOT per API call). Go Pro ($25/mo) before
real clients. Uploads stay on VPS disk; Supabase Storage is Phase 6 (optional, later).

### Phase 1 — Foundation ✅ DONE (2026-07-06)
- [x] Create Supabase dev project (presentation-builder-dev)
- [x] Install @supabase/supabase-js in builder/
- [x] Add URL + publishable + secret keys to builder/.env (gitignored) + document in .env.example
- [x] Verify live connection

### Phase 2 — Schema (all tables, one migration) ✅ DONE (2026-07-11)
- [x] Write builder/scripts/schema.sql: teams (seed default), settings, decks, user_active_deck,
      templates, languages, slide_library, deck_slide_edits, deck_slides, deck_translation_meta,
      deck_translations, presentations, presentation_events
- [x] team_id on every business table now; string IDs kept as PKs; JSONB only for dynamic blobs
- [x] Run in Supabase SQL editor; confirmed all 13 tables + default team seeded
- [x] Grant service_role access (we chose "don't auto-expose tables" at setup; grants added to schema.sql)

### Phase 3 — Import script ✅ DONE (2026-07-11)
- [x] Build builder/scripts/import-to-supabase.js (service_role key, idempotent upserts, FK order,
      --dry-run, per-table counts, validation pass comparing Postgres counts vs source)
- [x] Non-destructive: never delete JSON; keep as backup until verified
- [x] Imported + verified all 13 tables (827 translation rows, 21 deck_slide_edits, 5 presentations)
- [x] Orphan cleanup: skipped stale edits/presentation refs from 2 deleted decks (qm51y, k0md2)
- [x] Schema tweaks found during import: added archived_at (presentations), favorites
      (deck_translation_meta); dropped presentations.deck_id FK so frozen snapshots outlive decks

### Phase 4 — Write-through cache module
- [ ] Build builder/lib/store.js: load all tables into memory on boot, sync reads from cache,
      writes update cache + serialized per-table Postgres upsert queue, error logging,
      // MULTI-INSTANCE cache-invalidation marker

### Phase 5 — Domain cutover (vertical slices, verify + approve each before next)
- [ ] Slice 0 — foundation: teams/languages/templates (import + cache helpers)
- [ ] Slice 1 — settings: swap readSettings/writeSettings; verify render byte-identical
- [ ] Slice 2 — decks: decks + deck_slides + translations (normalized, drop `previous`) +
      user_active_deck; swap deck/translation helpers; verify active-deck persists + render identical
- [ ] Slice 3 — slide library + deckEdits split: verify a per-deck edit writes ONE deck_slide_edits
      row and leaves the library base row untouched (proves issue #1 fixed)
- [ ] Slice 4 — presentations + events table; verify publish/republish appends events, HTML on disk

### Later phases (separate tasks, NOT this one)
- [ ] Phase 3 (auth) — Supabase Auth + registration + Postgres-backed sessions
- [ ] Phase 5 (teams/roles) — admin vs rep, team_id scoping, RLS policies
- [ ] Phase 6 (storage) — uploads → Supabase Storage bucket, quotas, compression

### Gotchas
- resolveSlideEdits stays all-or-nothing (no blend); presentation slides stay a frozen JSONB snapshot;
  `previous`-drop is one-way (grep `.previous` first); HTML/entities must round-trip unescaped;
  activeDeckId stays single-valued until auth.
