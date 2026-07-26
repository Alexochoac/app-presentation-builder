---
title: Infrastructure — Auth — Replace .env login with Supabase Auth (email+password + social)
type: Feature
priority: H
status: pending
area: other
---

Phase 3 of the multi-user migration. Replace the single hard-coded `.env` credential login with
**Supabase Auth** (real, separate per-user accounts) and move sessions off the in-memory store.
This is the natural next step after the Postgres data migration
([Feature-H-2026-07-06 …migrate-to-supabase-postgres… — DONE 2026-07-25](done/Feature-H-2026-07-06-infrastructure-database-migrate-to-supabase-postgres-multi-user-foundation.md)),
and it unblocks teams/roles + RLS (Phase 5). Design already sketched in
[Idea-L-2026-05-17 …plan-postgres-for-app.md](Idea-L-2026-05-17-infrastructure-database-plan-postgres-for-app.md)
("Phase 3 — Replace Auth") and [PLAN.md](../PLAN.md) ("Auth & Accounts"). This file is the
execution checklist (same relationship the migration task had to the Idea-L decision record).

## Scope decision (confirmed with user 2026-07-25)

**Build first = Path A + Path C, NO transactional email:**
- **A — email + password**, with email confirmation **turned OFF** in Supabase (so no signup/confirm
  email is sent — dodges the built-in 2-emails/hour testing limit).
- **C — social login**: "Sign in with Google and/or GitHub" (both free on the Supabase Free tier;
  the provider verifies identity, so no email and no password storage on our side).
- Both feed the **same** Supabase Auth user table and the same express-session, so they coexist.
- **Postgres-backed sessions** (replace the in-memory `express-session` MemoryStore).

**Explicitly OUT of scope here (each a clear follow-on):**
- **Path B — email verification + self-serve password reset** → needs a custom SMTP provider
  (e.g. Resend free tier). Deferred; until then a forgotten password is reset by the admin from the
  Supabase dashboard. (Supabase built-in email = 2/hr, testing-only; custom SMTP lifts it to 30/hr,
  adjustable — Free tier allows custom SMTP.)
- **Teams / roles (admin vs rep) + RLS policies** → Phase 5, separate task. **See the ⚠️ risk below.**
- **Per-user GitHub repo publishing / GitHub OAuth *for publishing*** → separate idea
  ([idea-2026-04-22 per-user-github-repo-publish-flow](idea-2026-04-22-build-deploy-per-user-github-repo-publish-flow.md)).
  Note: GitHub *login* (Path C) and GitHub *publish-token* are different OAuth scopes — don't conflate.
- **Viewer/audience access gate** for published presentations → separate idea
  ([idea-2026-04-14 viewer-auth-gate](idea-2026-04-14-viewer-auth-gate-static-presentations-github-pages.md)).

## ⚠️ Critical coupling — auth WITHOUT RLS is not data isolation

The data migration seeded **one default team** and used a single **sentinel user UUID** for
`user_active_deck` and `presentations.created_by`. RLS is currently **OFF** (the server uses the
service_role key, which bypasses RLS). So if we ship auth with **open registration**, every new
account lands in the one shared team and can see/edit **all** existing data — there is no isolation
until Phase 5 (RLS + real teams).

**Therefore Phase 3 ships auth for a KNOWN, TRUSTED set of users only** (you + any invitees you
explicitly create) — registration stays **admin-gated / closed self-serve**. Real multi-tenant
isolation is a Phase-5 gate, and public open signup must NOT be enabled until RLS lands. This
boundary is the whole reason auth and RLS are two phases: build the front door now, fit the locks
next.

## Current state to replace (grounded 2026-07-25)

- `builder/features/auth/auth.js` — `requireAuth` checks `req.session.loggedIn`; `registerAuthRoutes`
  compares `req.body` against `BUILDER_USER`/`BUILDER_PASS` from `.env`, sets `req.session.loggedIn`.
  Public paths: `/auth/login`, `/auth/logout`.
- `builder/features/auth/login.html` — the login page.
- `builder/server.js:30` — `express-session` with the default **in-memory MemoryStore**, 8h
  `httpOnly` cookie, `SESSION_SECRET` from `.env`. `app.use(requireAuth)` at server.js:60 gates
  everything after the public assets/config endpoints.
- `builder/lib/store.js` — already exports a Supabase **service_role** client (admin, bypasses RLS).
  Auth needs an additional client using the **anon/publishable** key for user-facing `auth.*` calls,
  plus the service_role **admin** API (`auth.admin.*`) for creating/inviting users.

## Read-before-swap (do FIRST, like every migration slice)

- [ ] Confirm every place `req.session.loggedIn` / `req.session.username` is read or set (grep).
- [ ] Confirm the `SENTINEL_USER` usages in server.js (`user_active_deck` key, `created_by`) — these
      become "the logged-in user's id". Decide the remap for existing rows (see step 4).
- [ ] Confirm no other code assumes the `.env` single-user model (e.g. hardcoded username in UI).

## Steps

### 1. Supabase Auth setup (dashboard + config)
- [ ] In the Supabase project: enable **Email** provider, **turn OFF "Confirm email"** (Path A).
- [ ] Enable **Google** and/or **GitHub** providers (Path C): register an OAuth app with each
      provider, paste client id/secret into Supabase, add the redirect URL
      (`<app>/auth/callback`) to both Supabase and the provider's allowed callbacks.
- [ ] Keep self-serve signup effectively closed (see ⚠️): either disable public signups in Supabase
      Auth settings, or gate `/auth/register` behind an admin check. Decide which.
- [ ] Add the **anon/publishable key** to `builder/.env` (+ `.env.example`). service_role already present.

### 2. Server-side auth wiring (keep express-session; closest to today's model)
- [ ] Add an anon-key Supabase client (for `signInWithPassword`, `signInWithOAuth`,
      `exchangeCodeForSession`, `signOut`) alongside the existing service_role client in store.js.
- [ ] Rewrite `registerAuthRoutes`:
  - `POST /auth/login` → `auth.signInWithPassword({email,password})`; on success store the Supabase
    **user id + email** on `req.session` (replace `loggedIn` boolean with a real user record).
  - `GET  /auth/login/:provider` (google|github) → `auth.signInWithOAuth(...)` → redirect to the
    provider.
  - `GET  /auth/callback` → `auth.exchangeCodeForSession(code)` → store user on the session → redirect `/`.
  - `GET  /auth/logout` → `auth.signOut()` + `req.session.destroy()`.
  - `POST /auth/register` (admin-gated) → `auth.admin.createUser(...)` (or invite) for a new account.
- [ ] Update `requireAuth` to check `req.session.user` (the Supabase user), keeping the public-path +
      JSON-401-for-`/api/` behavior identical.

### 3. Postgres-backed sessions
- [ ] Install `connect-pg-simple`; point `express-session` at the Supabase Postgres connection so
      sessions survive a server restart and can be shared across instances later. Create its session
      table (its own DDL; keep it out of the app schema or note it in schema.sql).

### 4. Wire the logged-in user into the existing data model
- [ ] Create the **first real user** (you) via Supabase Auth; capture its UUID.
- [ ] Replace `SENTINEL_USER` reads with `req.session.user.id`: `getActiveDeckId` / active-deck writes
      key on the real user; `presentations.created_by` stamps the real user on new publishes.
- [ ] **Remap existing rows**: decide + script whether `user_active_deck` (sentinel) and any
      `created_by = sentinel` rows are re-pointed to your real UUID, or the sentinel stays as a
      legacy fallback. (Small one-off script, like the migration resyncs.)
- [ ] All new users join the **one default team** for now (team scoping is Phase 5).

### 4b. Login UI
- [ ] Update `login.html`: real email+password form + "Sign in with Google/GitHub" button(s);
      error states; link to a (admin-gated) register page if in scope.

### 5. Verify
- [ ] Log in with email+password as the real user → lands in the app, session persists across a
      **server restart** (proves Postgres-backed sessions).
- [ ] Log in via Google/GitHub → same session behavior; the social identity maps to a Supabase user.
- [ ] `/api/*` returns 401 JSON when logged out; pages redirect to `/auth/login` (unchanged behavior).
- [ ] Active-deck + new publishes are stamped with the **real** user id (query Postgres directly).
- [ ] Confirm public routes (`/public/:id/`, config endpoint, shared assets) still work logged-out.
- [ ] Confirm the old `.env` `BUILDER_USER`/`BUILDER_PASS` path is fully removed (no dead login).

## Gotchas
- Auth ≠ isolation: do NOT enable open public signup before Phase-5 RLS (⚠️ above).
- Built-in Supabase email = 2/hr, testing only → that's WHY Path A turns confirmation off and Path B
  (SMTP) is deferred. Password reset is admin-driven until B lands.
- GitHub *login* scope ≠ GitHub *publish* token scope — keep them separate from the publish idea.
- Keep function signatures/behavior of `requireAuth` identical (public paths, JSON-401 for `/api/`) —
  it gates the whole app; a regression locks you out.
- Free tier pauses a project after 1 week idle — go Pro before this matters for real users (already
  noted in the migration plan).

## References
- [Idea-L-2026-05-17 postgres plan](Idea-L-2026-05-17-infrastructure-database-plan-postgres-for-app.md) — Phase 3 "Replace Auth" + Phase 5 "Teams & Roles".
- [Feature-H-2026-07-06 data migration (DONE)](done/Feature-H-2026-07-06-infrastructure-database-migrate-to-supabase-postgres-multi-user-foundation.md) — the foundation this builds on (team_id, created_by, user_active_deck, sentinel user).
- [PLAN.md](../PLAN.md) — product roadmap Auth & Accounts.
- Supabase Free tier (checked 2026-07-25): 50,000 MAU included; social OAuth included; basic MFA
  included; SSO/SAML + SMS MFA are paid; custom SMTP allowed; project pauses after 1 week idle.
