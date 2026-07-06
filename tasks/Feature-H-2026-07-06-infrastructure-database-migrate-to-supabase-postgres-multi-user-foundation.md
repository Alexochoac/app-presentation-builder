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

### Phase 2 — Schema (all tables, one migration)
- [ ] Write builder/scripts/schema.sql: teams (seed default), settings, decks, user_active_deck,
      templates, languages, slide_library, deck_slide_edits, deck_slides, deck_translation_meta,
      deck_translations, presentations, presentation_events
- [ ] team_id on every business table now; string IDs kept as PKs; JSONB only for dynamic blobs
- [ ] Run in Supabase SQL editor; confirm tables + auto-RLS present

### Phase 3 — Import script
- [ ] Build builder/scripts/import-to-supabase.js (service_role key, idempotent upserts, FK order,
      --dry-run, per-table counts, validation pass that deep-compares Postgres vs source JSON)
- [ ] Non-destructive: never delete JSON; keep as backup until verified

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
