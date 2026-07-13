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

### Phase 4 — Write-through cache module ✅ DONE (2026-07-12)
- [x] Build builder/lib/store.js: load all tables into memory on boot, sync reads from cache,
      writes update cache + serialized per-table Postgres upsert queue, error logging,
      // MULTI-INSTANCE cache-invalidation marker
- [x] Smoke-tested loadAll(): all 13 tables load, counts match verified import
      (827 translations, 21 deck_slide_edits, 5 presentations). Write queue built, exercised in Phase 5.
- [x] Not wired into server.js yet (app still reads JSON) — cutover is Phase 5, slice by slice.

### Phase 5 — Domain cutover (vertical slices, verify + approve each before next)

Tables + data are ALREADY done (Phases 2–3). So each slice = **swap helper bodies in
server.js (reads, then writes) → verify → get approval → next.** Every slice starts with a
read-before-swap pass to confirm its exact call sites (line numbers drift). All 5 slices add
their domain helpers on top of store.js's cache + write queue (Phase 4). Reads stay synchronous;
writes update cache synchronously then enqueueUpsert/enqueueDelete to Postgres. JSON files stay
as rollback backup until every slice is verified in prod.

**DECISION (2026-07-12) — writes = cache + DB only, JSON frozen.** Once a domain cuts over,
writes update `store.cache` + `enqueueUpsert` to Postgres; the JSON file is NOT written (frozen
pre-migration snapshot). Postgres is the source of truth from cutover on. **Rollback caveat:**
reverting a slice means pointing reads back at the frozen JSON, so any edits made AFTER cutover
exist only in the DB and would be lost on rollback → verify each slice THOROUGHLY before the next.

- [ ] **Slice 0 — foundation: languages + templates** (teams already seeded; canvas store
      `slide-templates.json` is EMPTY + out of scope — leave on JSON)
  - [x] Read-before-swap: sites confirmed 2026-07-12 (line refs in the steps below)
  - [ ] Add `getTemplate(id)` + `getLanguages()` helpers (read from `store.cache`)
  - [ ] Swap `resolveTemplate()` body (server.js:1027) → `cache.templates.get(id)` — covers all
        9 resolver call sites (81, 454, 1676, 1935, 2579, 2642, 4240, 4513, 4631)
  - [ ] Swap the ~9 direct catalog reads (`readFileSync(TEMPLATE_CATALOG_PATH)`: 1642, 3987,
        4040, 4081, 4095, 4113, 4241, 4275, 4296) → cache
  - [ ] Swap the 3 language reads (`LANGUAGES_PATH`: 4788, 4848, 5039) → `cache.languages`
        (static, read-only)
  - [ ] Cut over 5 template writes (create/edit/delete: 4070, 4085, 4103, 4122, 4279) →
        cache + `enqueueUpsert('templates', …)` — **first real use of the write queue**
  - [ ] Verify: template resolution renders identically; language dropdowns populate; create/
        edit/delete a template → row updates in Postgres + reflects live without reboot
- [ ] **Slice 1 — settings** (singleton → one team row)
  - [ ] Read-before-swap: locate readSettings/writeSettings (plan ref server.js:1493) + call sites
  - [ ] Swap `readSettings` → `cache.settings.get(TEAM)`; `writeSettings` → cache + upsert
  - [ ] Verify: `GET /api/settings` byte-identical; edit a logo → row updates → render unchanged
        (HTML diff before/after)
- [ ] **Slice 2 — decks + deck_slides + translations + user_active_deck**
  - [ ] Read-before-swap: decks/translation helpers (plan ref server.js:1842–1912, ~4738);
        grep `.previous` to confirm only the dirty-check reads it before relying on the drop
  - [ ] Swap readDecks/writeDecks/readDeckById/writeDeckById/getDeckConfig/getActiveDeckId +
        translation helpers; `getActiveDeckId` reads `user_active_deck` for the sentinel user
        (signature unchanged)
  - [ ] Verify: deck list matches; active-deck switch persists across reboot; deck preview render
        byte-identical; an English edit flips the right `dirty` flags
- [ ] **Slice 3 — slide library + deckEdits split**
  - [ ] Read-before-swap: the ~27 inline `readFileSync(LIBRARY_PATH)` reads + ~15 writes
  - [ ] Add readLibrary/writeLibrarySlide/readDeckSlideEdits/writeDeckSlideEdits; `resolveSlideEdits`
        reads `deck_slide_edits` from cache — **all-or-nothing, no blend**
  - [ ] Verify: library list identical; a per-deck edit writes ONE `deck_slide_edits` row and
        leaves the library base row untouched (**proves issue #1 fixed**); render every slide of
        every deck and diff HTML vs pre-migration
- [ ] **Slice 4 — presentations + events table**
  - [ ] Read-before-swap: the ~24 read / ~11 write inline sites; `buildFrozenPresentation`
        (plan ref server.js:2339, async POST-only) swapped last
  - [ ] Add readPresentations/readPresentationById/writePresentation/appendPresentationEvent
  - [ ] Verify: list + detail identical; publish → row + `published` event + frozen HTML on disk;
        republish → `replaced_at` + appended `republished` event (prior events NOT overwritten —
        **proves the events-table win**)
- [ ] **Wrap-up:** all slices verified in prod → archive JSON to `data/_migrated-backup/` (not delete)

### Later phases (separate tasks, NOT this one)
- [ ] Phase 3 (auth) — Supabase Auth + registration + Postgres-backed sessions
- [ ] Phase 5 (teams/roles) — admin vs rep, team_id scoping, RLS policies
- [ ] Phase 6 (storage) — uploads → Supabase Storage bucket, quotas, compression

### Gotchas
- resolveSlideEdits stays all-or-nothing (no blend); presentation slides stay a frozen JSONB snapshot;
  `previous`-drop is one-way (grep `.previous` first); HTML/entities must round-trip unescaped;
  activeDeckId stays single-valued until auth.
