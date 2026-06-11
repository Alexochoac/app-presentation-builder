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

**Notes**
- Use Supabase Cloud Free Tier (not self-hosted — self-hosted is 7+ Docker containers, too much ops overhead)
- Free tier pauses DB after 7 days inactivity → upgrade to Pro ($25/mo) before going live with clients
- Local dev connects directly to Supabase Cloud dev project
- Deploy app to Railway or Render when ready for production
