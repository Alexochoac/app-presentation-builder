---
title: Infrastructure — Auth — Phase 5: teams, roles & real data isolation
type: Feature
priority: H
status: pending
area: other
---

Phase 5 of the multi-user migration — the one where **"different users see different things"**
finally becomes true. Phase 3 shipped real accounts
([Feature-H-2026-07-25 …supabase-auth… — PR #1 merged 2026-08-16](Feature-H-2026-07-25-infrastructure-auth-replace-env-login-with-supabase-auth-multi-user.md));
this replaces the single shared default team with a real team model, roles, per-user attribution,
and enforced scoping. Design origin:
[Idea-L-2026-05-17 …plan-postgres-for-app.md](Idea-L-2026-05-17-infrastructure-database-plan-postgres-for-app.md)
("Phase 5 — Teams & Roles") and [PLAN.md](../PLAN.md) ("Teams & Permissions").

---

## Ground truth (measured 2026-08-21, not assumed)

Read this before planning anything — several long-held assumptions turned out to be wrong.

**1. RLS is already ON for all 15 public tables — with ZERO policies.**
Previous notes said "RLS is OFF". It isn't. `relrowsecurity = true` everywhere, and
`pg_policies` returns nothing. RLS ON + no policies = **deny-all** to the `anon` and
`authenticated` roles. The app works *only* because `store.js` uses the **service_role** key,
which bypasses RLS entirely. So Phase 5 does **not** need to "turn on RLS" — it needs to write
policies *and* decide whether any code path stops using service_role (see the Big Decision below).

**2. `presentations.created_by` is NULL on all 6 rows** — not the sentinel. Attribution was
never stamped. Only `user_active_deck.user_id` actually holds the sentinel
`11111111-1111-1111-1111-111111111111`.

**3. Current data is tiny — migrate now while it's cheap.**

| Table | Rows | Scoping column |
|---|---|---|
| `teams` | 1 (`0000…0001` "Default team") | — |
| `decks` | 2 | `team_id` NOT NULL |
| `slide_library` | 26 | `team_id` NOT NULL |
| `presentations` | 6 | `team_id` NOT NULL, `created_by` uuid **all NULL** |
| `deck_translations` | 827 | `team_id` NOT NULL |
| `deck_slide_edits` | 21 | `team_id` NOT NULL |
| `deck_translation_meta` | 2 | `team_id` NOT NULL |
| `settings` | 1 | `team_id` NOT NULL |
| `templates` | 14 | `team_id` **NULL = global/shared** |
| `user_active_deck` | 1 | `team_id` + `user_id` (already per-user shaped ✅) |
| `deck_slides` | 21 | **no team_id** — scoped via `deck_id` → `decks.team_id` |
| `presentation_events` | 14 | **no team_id** — scoped via `presentation_id` |
| `languages` | 103 | none — global reference data, never team-scoped |
| `session` | 0 | connect-pg-simple, direct pg connection, not PostgREST |

**4. Three real auth users exist**, all Alex:
- `5acd6399-8e79-446b-adbd-c5e24347f842` — alex@wbtm.io (email)
- `d5548b4b-f314-4327-b180-31f4a94dceb7` — alexochoac@gmail.com (email + google)
- `5e99f47c-ad9c-4d3e-8e63-cd646baa74b8` — alexochoac@hotmail.com (linkedin_oidc)

**5. No `team_members` table exists.** That is the core missing piece.

**6. `store.TEAM` is hardcoded at ~10 sites in server.js** (1692, 1708, 1712, 2074, 2097, 2137,
2235, 2302, 3516, 5333, 5355) and `SENTINEL_USER` at 2 (2097 `ACTIVE_DECK_KEY`, 2137).

---

## ⚠️ The Big Decision — read before writing any code

`store.js` is a **process-wide, synchronous, write-through cache**. It exists precisely because
`renderCartridge()` and ~30 GET/render sites call `readSettings()` / `readDeckById()` /
`resolveSlideEdits()` **synchronously**. Its own header says making them async "would ripple
through the whole render tree and add a network round-trip per slide."

That collides head-on with textbook RLS. Real DB-enforced isolation means a per-request Supabase
client carrying the user's JWT — which is inherently async and per-request, i.e. the exact thing
the cache was built to avoid. **You cannot have both the synchronous cache and DB-enforced RLS.**

Two honest options:

**Option A — App-layer isolation (RECOMMENDED).** Keep service_role and the sync cache. Re-key
every cache Map by `team_id`, change hot readers to take a `teamId` argument resolved from
`req.session.user.teamId`, and scope every write. Add RLS policies too, but understand they are
**inert defense-in-depth** while service_role is the only client — they only start mattering if a
non-service_role path ever appears (browser-side Supabase calls, the public viewer, a future
mobile client).
- ✅ Keeps the render tree synchronous; contained, mechanical change.
- ❌ A forgotten `team_id` filter is a silent cross-team leak. Mitigate with a lint/grep rule and
  a test that asserts every cache read goes through a team-scoped accessor.

**Option B — True RLS.** Per-request user-scoped client; drop or rebuild the sync cache; make the
render path async.
- ✅ Fails closed. A forgotten filter returns nothing rather than someone else's data.
- ❌ Large refactor of the hottest, most fragile code path in the app, for a benefit that is
  invisible until there is a second real team.

**Recommendation: A now, keep B as the Phase 6+ hardening story.** Alex is one user with one team;
the value of Phase 5 is the *model* (teams, roles, attribution), not DB-level enforcement. Revisit
B before onboarding a second paying company.

---

## Scope

### In scope
- `team_members` table + role model (`admin` | `rep`)
- Session carries `teamId` + `role`; RBAC middleware replaces the `ADMIN_EMAILS` env allowlist
- Team-scoped cache + queries (kill hardcoded `store.TEAM`)
- Real `created_by` attribution; kill `SENTINEL_USER`
- Admin UI: assign/change role, list members
- RLS policies written (defense-in-depth, per Option A)

### Out of scope (deliberately)
- **Email invites** — needs SMTP (Path B, still deferred). Admin creates the account at
  `/admin/users` and assigns a role; no invite email.
- **Open public signup** — still NO. Revisit only once isolation is proven with 2+ real teams.
- **Multiple companies per user** — that's Phase 3 of the *product* roadmap, not this.
- Supabase Storage / uploads migration (Phase 6).

---

## Progress

- [x] **Step 1 — `team_members` + backfills** (`builder/scripts/phase5-teams.sql`). Applied in one
      transaction; **verified idempotent** by re-running (identical state). 3 users → default team as
      `admin`; `presentations.created_by` 6×NULL → alex@wbtm.io; sentinel `user_active_deck` row
      replaced by 3 real per-user rows.
- [x] **Step 2 — session carries `teamId` + `role`** from `team_members`, on **both** login paths.
      No membership ⇒ **refused** (`?error=noteam` / 403 `code:'noteam'`), never defaulted into a team.
      `requireAuth` now also requires `teamId`, so pre-Phase-5 sessions still in the Postgres store
      are treated as expired and self-heal via one re-login.
- [x] **Step 3 — RBAC replaces `ADMIN_EMAILS`.** `requireRole(role)` reads `req.session.user.role`;
      `isAdmin` is now DB-backed. `ADMIN_EMAILS` survives *only* as the ALLOWED_EMAILS fallback.
      `/api/users` is team-scoped + shows roles; `POST /api/users` takes a role and creates the
      membership (rolling back the account if that insert fails); `PATCH /api/users/:id` changes a
      role behind a last-admin guard.
- [x] **Step 6 (brought forward) — admin UI**: role picker on create, per-row role selector, "you"
      badge on self.

**Verified live** (throwaway accounts, cleaned up after): orphan account with no membership → refused
with `error=noteam` and **no session granted**; `rep` → `/api/users` 403 + `/admin/users` redirect;
`admin` → 200 + full member list; a second team's admin saw **only their own team's members**;
last-admin self-demotion → 400, refused, team keeps its admin; stale pre-Phase-5 cookie → 401.

- [x] **Step 5 — RLS policies** (`builder/scripts/phase5-rls.sql`, re-runnable). 17 policies +
      `is_team_member()` / `has_team_role()` SECURITY DEFINER helpers (definer avoids infinite
      recursion when a policy on `team_members` queries `team_members`). GRANTs opened to
      `authenticated` for the first time — previously it was locked out twice over (no grants AND
      RLS-with-no-policies). `session` explicitly revoked from `authenticated`.
      **Verified by `builder/scripts/verify-rls.js` — 21/21 checks with REAL user JWTs:** team B saw
      0 rows of team A's decks/library/presentations/settings/translations/edits/slides; insert
      stamped with team A → rejected by policy; update/delete of team A → 0 rows; rosters not
      cross-visible; anon sees nothing; service_role still bypasses (the app depends on it).

## ⚠️ DECISION MADE (2026-08-23): **Option B — the database enforces**

User chose DB-enforced isolation over app-layer scoping, understanding it's the larger build.
The Big Decision section above is superseded: **B is the plan.** Step 5 (above) is B's first half
and is DONE. The app half remains.

- [x] **Step 4 — the app half (B2). DONE 2026-08-28.** The server no longer reads team data as
      service_role. **Verified 29/29 by `builder/scripts/verify-team-isolation.js`** — two real
      logins over HTTP, each seeing only its own team.

The design, as built: **the cache is a projection of what RLS allowed**, rather than every read
becoming async.

- `builder/lib/store.js` keeps **one cache per team** (`store.cacheFor(teamId)`), filled lazily by
  `loadTeam(teamId, accessToken)` using a client carrying **the user's JWT**. RLS decides what lands
  in memory, so a reader that forgets its filter cannot reach another team's rows — they were never
  fetched. Boot loads only globals (templates, languages, the presentation-id counter).
- `builder/features/auth/team-context.js` is the one `await` per request: refresh the token if
  needed → `ensureTeamLoaded` → bind the context. **Not one await per slide; the render tree is
  untouched and every reader stayed synchronous.**
- `builder/lib/ctx.js` carries `{ teamId, userId, role }` through **AsyncLocalStorage** instead of a
  `teamId` parameter. That was the call that kept this tractable: `readSettings`/`readDeckById`/
  `resolveSlideEdits` are called from ~230 sites, many nested inside `renderCartridge()`, so a
  parameter would have rippled through exactly the tree store.js exists to protect. Signatures are
  unchanged; only the ~15 helper bodies moved to `tc()`. `ctx.teamId()` **throws** when there is no
  request context — there is deliberately no default team to fall back to.

**The two complications — decided, not hand-waved:**

1. **Token expiry → the session carries the whole bundle** (`access_token`, `refresh_token`,
   `expires_at`), refreshed *on demand* in `builder/features/auth/tokens.js`, 60s before expiry, not
   on a timer (sessions outlive the process; a timer would refresh for users who went home).
   **Single-flight per session id** — a page load fires many parallel requests, and without that they
   would all redeem the same rotating refresh token and race Supabase's reuse window. A refresh that
   fails destroys the session and sends the user to `/auth/login?error=expired`; there is **no
   fallback to service_role**, which would silently reopen the hole precisely when something is
   already wrong. Verified: expiry→refresh, rotation persisted, 6 concurrent stale requests, and a
   dead refresh token → 401 + session row gone.

2. **The write-behind queue → writes STAY on service_role, with the team captured at *enqueue*
   time.** The alternative — carrying the user's token with the queued item — was rejected for a
   concrete reason: under RLS an `UPDATE`/`DELETE` that matches nothing returns **success with 0 rows
   affected**, so the queue could not tell "wrote it" from "silently wrote nothing" on the app's
   highest-stakes path (publish, deck save). Invisible data loss is worse than a documented bypass.
   The insight that makes this safe rather than a cop-out: **the queue never needed the token, it
   needed the team** — and the team is known synchronously at enqueue time, while `ctx` is still
   bound. Only the network round-trip is deferred. `store.js` then enforces it:
   - team-scoped tables — every row's `team_id` must equal the enqueuing request's team, or it
     throws `TeamScopeError` **before** reaching Postgres;
   - deletes get `team_id` merged into the match, so a delete aimed at another team matches nothing;
   - `deck_slides` / `presentation_events` (no `team_id`) are checked against their parent in that
     team's cache — the same rule the RLS `EXISTS` subquery uses, so app and DB agree;
   - an undeclared table is refused rather than assumed safe.
   This is **weaker than RLS on writes and is written down as such**: defence-in-depth over a cache
   that already can't see other teams, not the only thing between two customers.

**Also fixed on the way (would have been silent cross-team corruption):**
`presentations.id` is a **global** PK minted as `max+1`. Once reads became team-scoped, team B's max
no longer saw team A's rows, so both teams would mint the same id — and `upsert(…, 'id')` on
service_role would have **overwritten** the other team's presentation, with RLS unable to stop it.
Now primed once from a global count at boot (`store.nextPresentationSeq()`).

**Other decisions made explicitly:**
- **`deck_slides` / `presentation_events`: scoped via parent, no new column.** Matches the RLS
  policies exactly, so there is one rule rather than two that can drift.
- **Templates stay GLOBAL (`team_id IS NULL`), on purpose.** Their HTML lives at a filesystem path
  that is not team-scoped (`features/slides/slide-NN-*.html`), so stamping the row while the file
  stays shared would be isolation theatre. Templates+files together is Phase 6.
- **`store.TEAM` / `SENTINEL_USER` are gone.** One constant survives — `store.BOOTSTRAP_TEAM` —
  used *only* by the boot-time Umami provisioner, which has no request and writes its one column
  directly via service_role, outside the cache and the queue. That is provisioning, not data access.
- **`enforceOneDeckPerSlide()` moved from boot to a once-per-team first-load hook**, since there is
  no boot-time team load any more.
- **The duplicate `GET /api/settings` registered before `requireAuth` is deleted.** Being first in
  the chain it shadowed the real one and served the whole settings row — logos included — to anyone
  who asked. Nothing unauthenticated fetched it.
- **`POST /auth/session` now requires `refresh_token`** and *verifies* it (redeems it once, checks it
  resolves to the same user as the access token) rather than trusting a token posted by the browser.

### Still open after step 4
- Rep restrictions (step 3's last bullet): reps still aren't blocked from editing the master deck /
  slide library server-side.
- `finished-presentations/<id>/` is one shared filesystem namespace served unauthenticated at
  `/public`. Ids are globally unique so there is no collision, but the id is the only secret —
  unchanged by this phase, worth revisiting with Storage in Phase 6.
- The cache is still single-instance (`// MULTI-INSTANCE:` note in store.js). Per-team caches make a
  stale cross-team cache *worse*, not better — LISTEN/NOTIFY before scaling out.

## Build order

Each step ships and is verified before the next. Same restart-before-testing gotcha as every
previous slice — **restart the server on new code or you are testing the old build.**

### 1. Schema — `team_members`
- [ ] Create table: `team_id uuid NOT NULL`, `user_id uuid NOT NULL`, `role text NOT NULL
      CHECK (role IN ('admin','rep'))`, `created_at timestamptz NOT NULL DEFAULT now()`,
      PK `(team_id, user_id)`. FK `team_id → teams(id)`; `user_id` references `auth.users(id)`.
- [ ] Backfill: all 3 existing auth users → default team `0000…0001`, role `admin`
      (all three are Alex; demote later if a real rep appears).
- [ ] Backfill `presentations.created_by` — all 6 rows currently NULL → alex@wbtm.io
      (`5acd6399-…`), the account that actually created them.
- [ ] Migrate `user_active_deck`: sentinel row → real per-user rows (or delete; it self-heals on
      next deck switch — confirm which before dropping).
- [ ] Write it as a checked-in SQL migration, not dashboard clicks — this has to replay on prod.

### 2. Session carries team + role
- [ ] On login (**both** paths — `POST /auth/login` and `POST /auth/session`), look up
      `team_members` for the user and put `teamId` + `role` on `req.session.user`.
- [ ] A user with **no** `team_members` row must be refused with a clear message — do not
      silently default them into the default team. That default is exactly how a stranger would
      have landed in Alex's data pre-`db08fc4`.
- [ ] `GET /api/me` returns `{ email, id, teamId, role }`; user-chip may show the role.

### 3. RBAC replaces the env allowlist
- [ ] `requireRole('admin')` reading `req.session.user.role`; `isAdmin`/`requireAdmin` become
      thin wrappers or are deleted.
- [ ] **`ADMIN_EMAILS` stops being the admin gate.** Keep `ALLOWED_EMAILS` as the *sign-in*
      allowlist (it guards social-login signup, a different job — see the Phase 3 gotcha).
      Update `.env.example` so the two stop looking interchangeable.
- [ ] Rep restrictions per the roadmap: reps create/edit **customer presentations**; they cannot
      edit the master deck or slide library. Enforce server-side, then hide the UI.

### 4. Team-scoped data layer — the real work ✅ DONE (see "the app half (B2)" above)
- [x] Re-key the cache by team — became one cache object *per* team (`store.cacheFor(teamId)`),
      filled through the user's JWT so RLS decides its contents.
- [x] Hot readers stayed **synchronous** and kept their signatures — team comes from
      AsyncLocalStorage (`lib/ctx.js`), not a parameter, so `renderCartridge()` was untouched.
- [x] All `store.TEAM` / `SENTINEL_USER` sites replaced with session values.
      `store.BOOTSTRAP_TEAM` survives only for the boot-time Umami provisioner.
- [x] `created_by` stamped on presentation create, and *preserved* on update (every caller does a
      full-row upsert, so editing would otherwise rewrite who made it).
- [x] `templates.team_id IS NULL` = global — kept global deliberately (their HTML files are shared).
- [x] `deck_slides` / `presentation_events` — **decided: scoped through their parent**, matching the
      RLS `EXISTS` policies, enforced app-side by a parent-in-team-cache check in the write queue.
- [x] `languages` stays global.

### 5. RLS policies (defense-in-depth under Option A)
- [ ] Helper: `auth.uid()` → team via `team_members`.
- [ ] Per team-scoped table: SELECT/INSERT/UPDATE/DELETE policies for `authenticated` where
      `team_id` matches the caller's team.
- [ ] `languages`: read-only to `authenticated`. `templates`: team's own **or** global.
- [ ] Leave `session` alone (direct pg, not PostgREST).
- [ ] **Verify the policies actually work** — connect with an anon-key client as a real user and
      confirm you see only your team. Do NOT verify with service_role; it bypasses RLS and every
      test will pass regardless of whether the policy is correct.

### 6. Admin UI for members
- [ ] `/admin/users` gains a role column + change-role control; creating a user also inserts a
      `team_members` row (an account with no membership can't log in — step 2).
- [ ] Guard: cannot remove/demote the last admin of a team.

### 7. Verify (the whole point) — automated as `builder/scripts/verify-team-isolation.js`
Run the server on a spare port, then
`APP_URL=http://localhost:3010 node builder/scripts/verify-team-isolation.js`.
It creates two throwaway users in two teams, drives real HTTP logins, and cleans up after itself
(including a **fresh random team id each run** — a fixed one would be served the previous run's
rows out of the server's per-team cache and fail for the wrong reason).

- [x] Second team + second login. **They see different data** — A: 2 decks / 26 slides / 6
      presentations; B: 0 / 0 / 0. **29/29 checks.**
- [x] B can't reach A's rows by guessing an id (404), and can't switch onto A's deck (404).
- [x] B's writes land in B, stamped with B's team, and A's counts don't move.
- [x] Presentations show the real creator, not NULL.
- [x] Active deck is per-user — A and B sit on different decks with no interference.
- [x] Logged-out callers get 401 from `/api/settings` and `/api/decks`.
- [x] Existing single-team data untouched and still loads (`verify-rls.js` still 21/21).
- [ ] Rep cannot edit master deck / slide library — **still open**, see "Still open after step 4".
- [ ] Public `/public/:id/` logged-out — unchanged by this phase (plain static files, no DB read),
      not re-verified.

---

## Sequencing vs. the deploy gate — decide first

Prod still runs the **old JSON code** with its own data; the standing gate says no `/release`
until prod data is imported into Supabase (see [[project_data_vs_code_sync]] and the migration
task). Phase 5 changes the schema, so the order matters:

- **Import prod data first, then Phase 5** ← recommended. The import script already works against
  today's schema; Phase 5's backfill then handles every row uniformly in one pass.
- Phase 5 first, then import = the import script must be rewritten for the new schema before it
  has ever been run for real. More moving parts, less proven.

Either way: **merging Phase 5 ≠ deploying it.** The gate stands.

## Gotchas
- **Never verify RLS with the service_role key.** It bypasses RLS; every test passes and proves
  nothing. Use an anon-key client with a real user JWT (`verify-rls.js`) — and separately verify the
  *app* over HTTP (`verify-team-isolation.js`), because a correct policy proves nothing about a
  server that was bypassing it.
- **`ctx.teamId()` throwing is the guard rail, not a bug.** If a code path hits it, that path runs
  outside a request and needs a context — do NOT "fix" it by adding a default team.
- **Reads and writes are deliberately asymmetric**: reads go through the user's JWT (RLS enforces),
  writes go through service_role stamped from `ctx` at enqueue time (the queue enforces). Don't
  "tidy" one to match the other without reading why in the store.js header.
- **Don't reuse a team id across test runs** against a live server — the per-team cache is keyed by
  team id and lives for the process, so run two would be served run one's rows.
- The sync cache is load-bearing for `renderCartridge()`. Making a hot reader async ripples through
  the whole render tree — the reason store.js exists at all. AsyncLocalStorage is what let step 4
  team-scope those readers without touching a single call site.
- `store.js` header still says "Phase 5 adds domain read/write helpers" — that numbering refers to
  the *data-migration* phases, not these product phases. Two different "Phase 5"s. Don't conflate.
- Cache is single-instance (its own `// MULTI-INSTANCE:` note). Multi-team makes a stale cross-team
  cache worse, not better — revisit LISTEN/NOTIFY before scaling out.
- A user with no `team_members` row must be **refused**, never defaulted into a team.

## References
- [Feature-H-2026-07-25 Phase 3 auth (PR #1 merged 2026-08-16)](Feature-H-2026-07-25-infrastructure-auth-replace-env-login-with-supabase-auth-multi-user.md) — accounts, ADMIN_EMAILS/ALLOWED_EMAILS, the social-login-is-signup trap.
- [Feature-H-2026-07-06 data migration (DONE)](done/Feature-H-2026-07-06-infrastructure-database-migrate-to-supabase-postgres-multi-user-foundation.md) — team_id/created_by/sentinel foundation.
- [Idea-L-2026-05-17 postgres plan](Idea-L-2026-05-17-infrastructure-database-plan-postgres-for-app.md) — "Phase 5 — Teams & Roles" + the file-based sustainability issues this fixes (#6 `activeDeckId` singleton is exactly step 4).
- [PLAN.md](../PLAN.md) — "Teams & Permissions".
