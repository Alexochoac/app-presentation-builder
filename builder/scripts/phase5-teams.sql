-- ============================================================================
-- App Presentation Builder — Phase 5 step 1: team membership & roles
-- ============================================================================
-- Companion to schema.sql (which stays the Phase-2 foundation). Run this after
-- it. Safe to re-run: every statement is IF NOT EXISTS / ON CONFLICT / guarded
-- by a WHERE, so replaying on prod is a no-op once it has been applied.
--
-- What this does:
--   1. Adds `team_members` — the missing piece that makes "teams" real.
--   2. Backfills every existing auth user into the default team as `admin`.
--   3. Stamps `presentations.created_by` (all NULL today — attribution was
--      never written) with the account that actually made them.
--   4. Retires the SENTINEL_USER row in `user_active_deck` in favour of real
--      per-user rows.
--
-- What this does NOT do: RLS policies, or any GRANT to anon/authenticated.
-- Those roles stay locked out on two independent counts (no grants AND RLS-on-
-- with-no-policies) until the isolation model is settled. See the task file's
-- "Big Decision" — policies are inert while the server uses service_role.
-- ============================================================================

-- ── 1. Team membership + roles ──────────────────────────────────────────────
-- The tenant boundary is `teams`; this is who belongs to one and as what.
--   admin — manages the master deck + slide library, manages members
--   rep   — creates/edits customer presentations only
-- ON DELETE CASCADE: deleting the auth user removes the membership, so a
-- deleted account can never leave a dangling row that still grants access.
create table if not exists team_members (
  team_id     uuid not null references teams(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'rep')),
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- Look up a user's team/role in one hop from the session.
create index if not exists team_members_user_idx on team_members (user_id);

-- ── 2. Backfill: existing accounts → default team, as admin ─────────────────
-- Every account that exists today is Alex's, so admin is correct. A real `rep`
-- gets created through the admin UI, not here. Selected FROM auth.users rather
-- than hardcoded so this replays correctly against any environment.
insert into team_members (team_id, user_id, role)
select '00000000-0000-0000-0000-000000000001', u.id, 'admin'
from auth.users u
on conflict (team_id, user_id) do nothing;

-- ── 3. Backfill: presentation attribution ───────────────────────────────────
-- created_by is NULL on every existing row — the column shipped in Phase 2 but
-- nothing ever wrote to it. Assign the historical rows to the account that
-- actually created them. Guarded by IS NULL so a re-run never reassigns a
-- presentation that has since been created by a real (possibly different) user.
update presentations
set    created_by = (select id from auth.users where email = 'alex@wbtm.io')
where  created_by is null
  and  exists (select 1 from auth.users where email = 'alex@wbtm.io');

-- ── 4. Retire the sentinel active-deck row ──────────────────────────────────
-- `user_active_deck` was already per-user shaped, but held one row keyed by the
-- SENTINEL_USER stand-in. Hand that active deck to every real member of the
-- team (so whichever account Alex signs in with lands on the same deck), then
-- drop the sentinel.
insert into user_active_deck (team_id, user_id, deck_id, updated_at)
select s.team_id, m.user_id, s.deck_id, now()
from   user_active_deck s
join   team_members m on m.team_id = s.team_id
where  s.user_id = '11111111-1111-1111-1111-111111111111'
on conflict (team_id, user_id) do nothing;

delete from user_active_deck
where user_id = '11111111-1111-1111-1111-111111111111';

-- ── 5. Grants ───────────────────────────────────────────────────────────────
-- schema.sql's `alter default privileges` already covers tables created later,
-- but state it explicitly so this file stands alone if replayed out of order.
grant all privileges on table team_members to service_role;

-- ── 6. Lock the new table down like every other one ─────────────────────────
-- RLS on with no policies = deny-all to anon/authenticated, matching the rest
-- of the schema. service_role (the server) bypasses it.
alter table team_members enable row level security;

-- ============================================================================
-- End of Phase 5 step 1. Next: session carries team_id + role (both login
-- paths), then RBAC replaces the ADMIN_EMAILS gate.
-- ============================================================================
