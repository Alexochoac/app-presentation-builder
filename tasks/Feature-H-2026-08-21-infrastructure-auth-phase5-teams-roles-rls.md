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

### 4. Team-scoped data layer — the real work
- [ ] Re-key `cache.*` Maps by `team_id` (today `cache.settings` is keyed by team_id already;
      `decks`, `slide_library`, `presentations` are not).
- [ ] Hot readers take `teamId`: `readSettings(teamId)`, `readDeckById(teamId, id)`,
      `getActiveDeckId(teamId, userId)`, `resolveSlideEdits(teamId, …)`. **Keep them synchronous.**
- [ ] Replace all ~10 `store.TEAM` sites and 2 `SENTINEL_USER` sites with session values.
- [ ] Stamp `created_by = req.session.user.id` on presentation create.
- [ ] `templates.team_id IS NULL` = global — every template read is `team_id = $1 OR team_id IS NULL`.
- [ ] `deck_slides` / `presentation_events` have no `team_id` — scope them through their parent,
      or add the column. **Decide explicitly**; an unscoped child table is a leak path.
- [ ] `languages` stays global — do not team-scope it.

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

### 7. Verify (the whole point)
- [ ] Create a second team + a `rep` user. Log in as each. **Confirm they see different data.**
      This is the acceptance test for the entire phase.
- [ ] Rep cannot edit master deck / slide library — via the API directly, not just a hidden button.
- [ ] Presentations show the real creator, not NULL.
- [ ] Active deck is per-user: two users, two different active decks, no interference.
- [ ] Public `/public/:id/` presentations still work logged-out (they must stay unauthenticated).
- [ ] Existing single-team data is untouched and still loads.

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
- **RLS is already ON with no policies** — the app survives purely on service_role. Adding a
  policy does nothing until something stops using service_role. Don't mistake "policy exists" for
  "isolation works."
- **Never verify RLS with the service_role key.** It bypasses RLS; every test passes and proves
  nothing. Use an anon-key client with a real user JWT.
- The sync cache is load-bearing for `renderCartridge()`. Making a hot reader async ripples through
  the whole render tree — the reason store.js exists at all.
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
