---
title: Infrastructure — Phase 2 — Multi-User Migration — Supabase Free Tier
type: Feature
priority: H
status: pending
area: other
---

Migrate the app from single-user file-based (JSON in `builder/data/`) to a full multi-user SaaS using Supabase Cloud Free Tier for Postgres, auth, and file storage.

**Phase 1 — Foundation**
- Create Supabase Cloud project, get credentials (URL, anon key, service role key)
- Install `@supabase/supabase-js` in `builder/`
- Add credentials to `.env` and test connection

**Phase 2 — Schema & Data Migration**
- Write SQL migration files: `teams`, `team_members`, `presentations`, `decks`, `deck_slides`, `slide_library`, `settings`
- Use JSON columns (`config_json`, `edits_json`) for flexible per-row config — same data shape, now in Postgres
- Write one-time import script to move current `builder/data/*.json` files into the new tables

**Phase 3 — Replace Auth**
- Swap `.env` credential login (`builder/features/auth/auth.js`) for Supabase Auth (`signInWithPassword()`)
- Add registration page
- Switch sessions from in-memory to Postgres-backed (`connect-pg-simple`)

**Phase 4 — Replace Data Layer**
- Swap `fs.readFileSync`/`fs.writeFileSync` → Postgres queries in `server.js`, one domain at a time
- Existing read/write functions (`readDeckById`, `readDecks`, `readSettings`, etc.) keep the same signature — only their bodies change
- Order: settings → decks → slide library → presentations

**Phase 5 — Teams & Roles**
- Team model: `admin` (manages master deck, full access) vs `rep` (creates customer presentations only)
- All queries scoped to `team_id`
- Invite team members by email
- RBAC middleware enforcing role restrictions

**Phase 6 — File Storage**
- Move `uploads/` to Supabase Storage bucket
- Per-team quota enforcement on upload
- Image compression on upload (max 1920px, optimise JPEG/PNG)
- BYO S3 bucket option deferred to Phase 3 (enterprise feature)

**Current File-Based Sustainability Issues (found 2026-06-19)**

These are the specific problems observed in the current `builder/data/` layer that confirm why the migration is necessary before adding users:

1. **`slide-library.json` grows with every deck edit** — Each library slide stores a `deckEdits` object with one key per deck. Every time any user edits a library slide for their deck, a new key is added into that shared file. At 10 users × 10 decks × 20 slides, you get 200 deck-edit buckets in one file, plus raw HTML blobs (e.g. `gallery-track`) that can be several KB each. `deckEdits` must move out of the library into a per-deck edits table.

2. **`presentations.json` duplicates the full slide list per presentation** — Every published presentation stores a complete copy of its slide list (IDs, names, visibility), which already exists in `deck.json`. At 100 presentations × 15 slides = 1,500 redundant records in one never-trimmed file. Presentations should store only a reference/snapshot ID, not a full slide copy.

3. **Translations store `previous` alongside `current`** — Every translated field carries `current`, `previous`, and `dirty` keys. The `previous` value doubles storage with no expiry. At 20 slides × 10 fields × 3 languages, `previous` alone doubles the translations file size. In Postgres, translation history should be a versioned rows pattern, not inline duplication.

4. **`styleCss` blob embedded in `decks.json`** — Custom theme CSS (font imports + CSS variables) is stored as a raw multiline string inside the deck metadata with no size limit. In multi-user, that's one unbounded blob per deck per user in a shared file. Should be a separate column or file reference.

5. **No concurrent write safety** — All data files (`presentations.json`, `decks.json`, `slide-library.json`) are single flat files. Two users saving simultaneously causes silent data loss — the second write overwrites the first. No locking, no versioning, no partial updates.

6. **`activeDeckId` is a global singleton** — `decks.json` has one `activeDeckId` for the entire app. Multiple users would overwrite each other's active deck on every interaction. Must become a per-user/session value.

**Migration priority:** Do the database migration *before* adding any real users. Once production data exists across these flat files, migrating becomes significantly harder.

## ✅ DECISION CONFIRMED (2026-07-04): Supabase Cloud

Backend = **Supabase Cloud** (managed Postgres + Auth + Storage + Row-Level Security).

**Why (updated rationale):** the original note said "not self-hosted — too much ops." Since then we
now run Postgres comfortably on the Hetzner VPS, so self-hosting is *viable*. But Supabase is still the
pick — **the DB is the easy part of multi-user; auth + file storage + per-team access control are the
hard part, and Supabase hands us all three out of the box.** Fastest path to a working multi-user app.
Supabase is just Postgres underneath, so the schema + data migration is portable — we can move to the
VPS later if we ever want to drop the SaaS.

**Free tier (verified 2026-07-04):** $0 — 500 MB Postgres · 1 GB storage · 5 GB egress · 50,000 monthly
active users · 2 active projects · **pauses after 1 week idle**. Pro $25/mo removes the pause (8 GB DB,
100 GB storage). Free tier is enough to build + test the whole migration; go Pro before real clients.

## ▶️ NEXT SESSION STARTS HERE — Phase 1 (Foundation)
1. Create a Supabase Cloud project (dev) → grab URL + anon key + service role key.
2. `npm install @supabase/supabase-js` in `builder/`.
3. Add creds to `builder/.env` (never hardcode) → test the connection.
Then proceed to Phase 2 (schema) above.

**Current app state to migrate FROM (confirmed this session):**
- Data: flat JSON in `builder/data/` (`decks.json`, `presentations.json`, `slide-library.json`, `settings`).
- Auth: `.env` user/pass via `builder/features/auth/auth.js` + **in-memory** express-session (8h cookie) → becomes Supabase Auth + Postgres-backed sessions.

**Notes**
- Local dev connects directly to the Supabase Cloud dev project.
- App already deployed to the VPS (done: [Feature-H-2026-06-20-...deploy-docker-app-to-vps.md](done/Feature-H-2026-06-20-infrastructure-deploy-docker-app-to-vps.md)) — for prod, the VPS just needs the Supabase URL/keys in its `.env`; image + code otherwise unchanged.
