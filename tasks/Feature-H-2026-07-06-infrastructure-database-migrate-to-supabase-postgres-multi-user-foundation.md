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

- [x] **Slice 0 — foundation: languages + templates** ✅ DONE (2026-07-16) (teams already
      seeded; canvas store `slide-templates.json` is EMPTY + out of scope — left on JSON)
  - [x] Read-before-swap: sites confirmed 2026-07-12
  - [x] Step A: wired store.loadAll() into boot (fail-fast) + loader retry for JWT skew (commit c6ba1eb)
  - [x] Step B: added dbTemplateToApp reshaper + getCatalog/getTemplate; swapped resolveTemplate
        body (covers 9 resolver sites) + 4 read-only catalog reads. createdAt normalized ISO 'Z'.
  - [x] Step C: added getLanguages(); swapped 3 language reads → cache (content + order identical)
  - [x] Step D: cut over 5 template writes (POST/DELETE/PATCH/duplicate/defaultEdits) → cache +
        enqueueUpsert/enqueueDelete (awaited), NO JSON write. First real use of the write queue.
  - [x] Verify: read fidelity — all 13 templates match cache-vs-JSON on every render-relevant
        field (incl. createdAt); languages content+order identical; write path round-trips
        create/patch/delete to Postgres with HTML entities preserved, 13 real templates intact;
        live boot serves cache-backed routes. (JSONB reorders object keys — irrelevant, keyed lookup.)
- [x] **Slice 1 — settings** (singleton → one team row) ✅ DONE (2026-07-17)
  - Surface confirmed (line numbers are post-Slice-0; re-grep to be safe):
    - Helpers: `readSettings()` server.js:1587 (try JSON.parse SETTINGS_PATH, catch → `{}`),
      `writeSettings(data)` server.js:1591 (writeFileSync whole object).
    - `readSettings()` callers (10): 48, 421, 486, 494, 515, 528, 551, 1554, 1572, 2441 — auto-covered by swapping the body.
    - `writeSettings()` callers (4): 496, 517, 533, 553 — auto-covered by swapping the body.
    - DIRECT `fs.readFileSync(SETTINGS_PATH)` bypassing the helper (~13): umami siteId fallbacks
      1134,1168,1204,1243,1282,1316,1359,1390,1428,3311 (`…|| JSON.parse(readFileSync).umamiWebsiteId`)
      + full-settings reads 3180, 3247, 3265 → replace all with `readSettings()` (now cache-backed).
    - DIRECT `fs.writeFileSync(SETTINGS_PATH)` bypassing the helper (1): 1574 → replace with `writeSettings(s)`.
  - Field map (settings.json camelCase ↔ settings table snake_case) — ALL 10 keys map, no orphans:
    umamiWebsiteId↔umami_website_id, homepageUrl↔homepage_url, homepageLabel↔homepage_label,
    logos↔logos, logosOnAllSlides↔logos_on_all_slides, heroBg↔hero_bg, heroBgFocal↔hero_bg_focal,
    heroBgFocalGrid↔hero_bg_focal_grid, defaultPrimaryColor↔default_primary_color,
    defaultDeckTheme↔default_deck_theme. (DB-only extras: team_id, updated_at.)
  - [x] Added `dbSettingsToApp(row)` (snake→camel; kept the OLD file-read fallback object when row
        missing, not `{}`, for exact behavioral fidelity — never triggers once cache is loaded) +
        `appSettingsToDb(obj)` (camel→snake + `team_id: store.TEAM` + `updated_at` stamp).
        Placed just above readSettings (server.js ~1587).
  - [x] Swapped `readSettings()` body → `dbSettingsToApp(store.cache.settings.get(store.TEAM))`.
  - [x] Swapped `writeSettings(data)` body → cache set + **fire-and-forget** `enqueueUpsert('settings',
        row, 'team_id')`. Stays SYNCHRONOUS — the non-async 1572–1574 site is unchanged. NO JSON write.
  - [x] Swapped all 13 direct reads (10 umami siteId fallbacks + 3 full-settings reads) → `readSettings()`
        and the 1 direct write (1574) → `writeSettings(s)`. Only SETTINGS_PATH def line 1020 remains (dead).
  - [x] Verify (live, on user's running new-code server): `GET /api/settings` returns all 10 fields
        correctly (camelCase). Real edit through the app (Default Theme dark→light) landed in Postgres
        (`default_deck_theme=light`, fresh `updated_at`); JSON stayed frozen at `dark`; value survived a
        full server shutdown+restart (read back from Postgres, not JSON) → reboot-persistence proven.
  - NOTE (not a migration bug): the **App Appearance** toggle (builder UI light/dark) is browser-only
    (`localStorage['pb-theme']`), NEVER in settings.json/Postgres — untouched by this migration. It only
    LOOKED related because the separate New-Deck-Defaults "Default Theme" also read light. App-theme
    dark-on-reboot quirk logged as its own task (see Bug-M-2026-07-17 app-appearance-theme…).
- [x] **Slice 2 — decks + deck_slides + translations + user_active_deck** ✅ DONE (2026-07-18)
  - [x] Read-before-swap: confirmed sites — readDecks/writeDecks server.js:1979/1983, getDeckConfig
        :2003, readDeckById/writeDeckById :2010/:2015, getActiveDeckId :2020, readTranslations/
        writeTranslations :4896/:4903. **`.previous` grep OVERTURNED the drop plan (risk #6):** it is
        NOT dead bloat — it powers the Translation Center "↻ Restore" feature (254 live non-null
        values) via `/api/translations/restore` + `openTranslationPanel`. `previous` ≠ the English
        source (English is stored separately). **User approved PRESERVING it.**
  - [x] Schema deviation: `alter table deck_translations add column previous text` (schema.sql
        updated); backfilled 254 previous values via `scripts/backfill-translation-previous.js`
        (deck_translations ONLY — a full re-import would clobber the already-cut-over settings/
        templates); `import-to-supabase.js buildTranslations` fixed to keep previous going forward.
  - [x] Swapped readDecks/writeDecks/readDeckById/writeDeckById/getDeckConfig/getActiveDeckId +
        readTranslations/writeTranslations to cache (dbDeckToApp/appDeckToDb + dbTranslationsToApp
        reshapers). `getActiveDeckId` reads `user_active_deck` for the sentinel user. writeDecks
        orders the active-pointer upsert BEFORE deck deletes (user_active_deck has no cascade);
        writeDeckById rebuilds deck_slides + preserves brand columns; both preserve the field the
        other owns (title vs brand). Redirected 1 direct DECKS_PATH write (styleRef promotion).
        FIXED boot ordering: `rebuildSlideDecks()` now runs AFTER `store.loadAll()` (was a load-time
        IIFE that would read the empty cache and wipe library decks[]).
  - [x] Verify: read-fidelity script = byte-identical (deck list + all fields incl. timestamps,
        title + slide order/visibility, translations incl. 254 previous round-tripped). Live on
        restarted new-code server: active-deck switch landed in Postgres (user_active_deck, fresh
        stamp) while JSON stayed frozen + survived reboot; English edit flipped es/fr `dirty=true`
        (en stays false); TC "." edits landed in deck_translations.value; previous preserved through
        edits. NOTE: the "↻ Restore" button is only in the per-field popup, not the TC grid — logged
        as Issue-M-2026-07-18-builder-translation-center-restore-button-add-to-grid (not a mig bug).
- [x] **Slice 3 — slide library + deckEdits split** ✅ DONE (2026-07-21)
  - [x] Read-before-swap: mapped ~27 LIBRARY_PATH reads + ~15 writes + 10 deckEdits sites.
        **Cleanup wins (user asked to prune obvious dead code during the move):**
        (a) 5 slide fields were silently dropped by the original import — 4 are LIVE and were
        recovered as columns (`template_version`, `template_update_ignored_at`, `style_ref`,
        `style_css`); the 5th, `themeId`, is **write-only dead** (redundant with style_ref/css) →
        NOT migrated, and its write at the create endpoint was removed.
        (b) stored `decks[]` usage list is **derivable** — `/api/slide-library` already recomputed
        it — so it is no longer stored; `readLibrary()` rebuilds it from `deck_slides`.
  - [x] Schema deviations (schema.sql updated): added `slide_library.position` (My Library renders
        in server order and does NOT sort client-side → needed a deterministic ORDER BY) + the 4
        recovered columns. Resynced via `scripts/resync-library-to-supabase.js` (slide_library +
        deck_slide_edits ONLY — library was still JSON-source so this also caught post-import drift;
        valid deck ids read from Postgres, 7 orphan deckEdits buckets for deleted decks skipped).
        `import-to-supabase.js buildLibrary` updated to carry position + the 4 columns.
  - [x] Added `readLibrary()` (reconstructs deckEdits from `deck_slide_edits` + decks[] from
        `deck_slides` so `resolveSlideEdits` and all ~27 readers stay UNCHANGED — all-or-nothing
        preserved) + `writeLibrary()` (base → slide_library incl. position; each deckEdits bucket →
        ONE deck_slide_edits row; upsert-only; handles slide deletion w/ FK cascade). Swapped ~27
        reads + ~14 writes. `store.js` loads slide_library ORDER BY position. `findImageUsage` now
        scans live data (also catches deck logo/heroBg it missed before). `rebuildSlideDecks` →
        `enforceOneDeckPerSlide` (decks[] is derived now; no library-file write). Fixed a real
        ordering bug in deck-duplicate: `writeLibrary` MUST precede `writeDeckById` (deck_slides FK).
  - [x] Verify: read-fidelity script PASS — 26 slides identical order, base fields (incl. 4 recovered
        columns) identical, 21 deck×slide buckets identical, `resolveSlideEdits` byte-identical for
        every in-deck slide. Live on restarted new-code server: a cover edit wrote ONE
        `deck_slide_edits` row (headline), left the slide_library base row untouched, total edit rows
        stayed 21 (updated in place, library does NOT grow) — **issue #1 fixed**. JSON frozen.
        ACCEPTED divergence (user 2026-07-21): 5 unassigned "(Copy)" leftovers of deleted deck k0md2
        had deckEdits only for that dead deck → old code previewed them blank; now they fall back to
        their real global edits. In no live deck → zero render/presentation/translation impact.
- [x] **Slice 4 — presentations + events table** ✅ DONE (2026-07-25)
  - [x] Read-before-swap: confirmed 26 reads + 11 writes; `buildFrozenPresentation` (server.js:2705)
        NEVER read the presentation store (takes the object as arg; only writes frozen HTML to disk) —
        so nothing to swap there. **KEY FINDING: no schema drift AND no ALTER TABLE needed** — Postgres
        matched presentations.json field-for-field (5/5 records, 11/11 events, slides JSONB canonically
        identical), so the resync was a proven no-op and **skipped** (user-approved). One deviation from
        the brief's "no gap": `editedAt` was written (server.js:4144) with no column; its only reader is
        a dashboard fallback that can't fire (the same endpoint appends an `edited` EVENT on the next
        line) → **dropped as dead** (user-approved, like Slice 3's `themeId`).
  - [x] Added dbPresentationToApp/dbPresEventToApp/appPresentationToDb reshapers (created_at date used
        as-is; *_at timestamptz → ISO-'Z'), readPresentations (newest-first by descending id —
        reproduces the old unshift order, NO `position` column needed unlike Slice 3), readPresentationById,
        writePresentation, and **appendPresentationEvent (INSERTs one presentation_events row — the win:
        republish appends, never rewrites the list)**. Removed pushPresEvent. Swapped all 26 reads →
        readPresentations(); 11 writes → base/writePresentation, events/appendPresentationEvent,
        delete/enqueueDelete (FK cascade drops events). publish/republish/save/delete/duplicate await the
        upsert (create awaits base FIRST so the event's FK parent exists); archive/unarchive/PUT/edit/
        cover-logo fire-and-forget. findImageUsage now scans live data. presentations.deck_id has NO FK
        (frozen snapshot outlives its deck). slides stay a frozen JSONB snapshot (plan risk #5).
  - [x] Verify: read-fidelity script (scratchpad/verify-slice4.js) PASS — 5 presentations byte-identical
        on every field incl. slides JSONB + timestamps, 11 events identical in order. Live on restarted
        new-code server: published a new presentation (00000006) → row + frozen HTML on disk
        (finished-presentations/00000006/index.html); republish → `replaced_at` set + a `republished`
        event APPENDED as its own bigserial row (id14) with `created`(id12)+`published`(id13) LEFT INTACT
        — **events-table win proven**. presentations.json stayed frozen at 5 records (00000006 DB-only).
- [x] **Wrap-up** ✅ DONE (2026-07-25): all 5 slices verified → archived the 6 migrated JSON files
      (settings, decks, slide-library, presentations, templates, languages) + the `decks/` per-deck
      folder to `data/_migrated-backup/` via `git mv` (moved, NOT deleted). Left live (out of scope,
      still JSON-backed): slide-templates.json, layouts.json, layout-skeletons.json. Migrated-file path
      consts in server.js are now dead (never read) — confirmed no surviving fs reads before the move.

### Later phases (separate tasks, NOT this one)
- [ ] Phase 3 (auth) — Supabase Auth + registration + Postgres-backed sessions
- [ ] Phase 5 (teams/roles) — admin vs rep, team_id scoping, RLS policies
- [ ] Phase 6 (storage) — uploads → Supabase Storage bucket, quotas, compression

### Gotchas
- resolveSlideEdits stays all-or-nothing (no blend); presentation slides stay a frozen JSONB snapshot;
  `previous`-drop is one-way (grep `.previous` first); HTML/entities must round-trip unescaped;
  activeDeckId stays single-valued until auth.
