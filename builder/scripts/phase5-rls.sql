-- ============================================================================
-- App Presentation Builder — Phase 5 step 5: RLS policies (DB-enforced isolation)
-- ============================================================================
-- Run AFTER phase5-teams.sql. Safe to re-run: policies are dropped and recreated.
--
-- WHAT THIS CHANGES
--   Until now `anon` and `authenticated` were locked out twice over: no GRANTs
--   at all, AND row-level security enabled with zero policies. The app worked
--   only because the server connects with the service_role key, which bypasses
--   RLS entirely — meaning the database trusted the application completely.
--
--   This file makes the DATABASE the thing that enforces team isolation:
--     * GRANTs table access to `authenticated` (previously none), and
--     * adds policies so a logged-in user can only ever touch rows belonging to
--       a team they are a member of.
--
--   After this, a query that forgets its team filter returns NOTHING rather
--   than another team's data. That is the whole point — it fails safe.
--
-- IMPORTANT: service_role still bypasses all of this. These policies only bite
-- for connections made with a USER's token. Verifying with the service_role key
-- will pass no matter how wrong a policy is — always verify with a real user JWT.
-- ============================================================================

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the lookup itself isn't subject to RLS — without this,
-- a policy on team_members that queries team_members recurses infinitely.
-- `set search_path` pins resolution so the function can't be hijacked by a
-- caller-supplied search_path.

create or replace function public.is_team_member(check_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members
    where team_id = check_team and user_id = auth.uid()
  );
$$;

create or replace function public.has_team_role(check_team uuid, want text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members
    where team_id = check_team and user_id = auth.uid() and role = want
  );
$$;

revoke all on function public.is_team_member(uuid) from public;
revoke all on function public.has_team_role(uuid, text) from public;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.has_team_role(uuid, text) to authenticated;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Policies are meaningless without a grant: no grant = no access regardless of
-- policy. Grant broadly here and let the POLICIES do the narrowing — that keeps
-- the access rules in one place instead of split across two mechanisms.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- The express-session table is reached over a direct pg connection as the
-- `postgres` role, never through PostgREST. `authenticated` has no business
-- reading other people's session rows.
revoke all on table public.session from authenticated;

-- ── Policy helper macro-by-hand ─────────────────────────────────────────────
-- Postgres has no "create policy if not exists", so drop-then-create keeps this
-- file re-runnable.

-- 1. teams — you can see a team you belong to.
drop policy if exists teams_member_read on teams;
create policy teams_member_read on teams
  for select to authenticated
  using (public.is_team_member(id));

-- 2. team_members — you can see your team's roster. Only admins may change it.
drop policy if exists team_members_read on team_members;
create policy team_members_read on team_members
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists team_members_admin_write on team_members;
create policy team_members_admin_write on team_members
  for all to authenticated
  using (public.has_team_role(team_id, 'admin'))
  with check (public.has_team_role(team_id, 'admin'));

-- 3. Straightforward team-scoped tables: full access within your own team.
--    `using` governs which rows you can see/modify; `with check` stops you
--    writing a row stamped with someone else's team_id.
do $$
declare t text;
begin
  foreach t in array array[
    'settings', 'decks', 'slide_library', 'presentations',
    'deck_translations', 'deck_slide_edits', 'deck_translation_meta'
  ]
  loop
    execute format('drop policy if exists %I on %I', t || '_team_all', t);
    execute format($f$
      create policy %I on %I
        for all to authenticated
        using (public.is_team_member(team_id))
        with check (public.is_team_member(team_id))
    $f$, t || '_team_all', t);
  end loop;
end $$;

-- 4. user_active_deck — team-scoped AND personal. Reading a teammate's active
--    deck is harmless; writing one is not, so writes are restricted to yourself.
drop policy if exists user_active_deck_read on user_active_deck;
create policy user_active_deck_read on user_active_deck
  for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists user_active_deck_own_write on user_active_deck;
create policy user_active_deck_own_write on user_active_deck
  for all to authenticated
  using (public.is_team_member(team_id) and user_id = auth.uid())
  with check (public.is_team_member(team_id) and user_id = auth.uid());

-- 5. templates — team_id NULL means a shared/global template every team can
--    read. Only a team's own templates are writable, and a global one can never
--    be created or edited from the app (that stays a service_role job).
drop policy if exists templates_read on templates;
create policy templates_read on templates
  for select to authenticated
  using (team_id is null or public.is_team_member(team_id));

drop policy if exists templates_own_write on templates;
create policy templates_own_write on templates
  for all to authenticated
  using (team_id is not null and public.is_team_member(team_id))
  with check (team_id is not null and public.is_team_member(team_id));

-- 6. deck_slides — no team_id of its own; inherits from its deck. The EXISTS
--    subquery is itself RLS-filtered, so an unreachable deck yields no rows.
drop policy if exists deck_slides_via_deck on deck_slides;
create policy deck_slides_via_deck on deck_slides
  for all to authenticated
  using (exists (select 1 from decks d where d.id = deck_slides.deck_id and public.is_team_member(d.team_id)))
  with check (exists (select 1 from decks d where d.id = deck_slides.deck_id and public.is_team_member(d.team_id)));

-- 7. presentation_events — same pattern, via its presentation.
drop policy if exists presentation_events_via_presentation on presentation_events;
create policy presentation_events_via_presentation on presentation_events
  for all to authenticated
  using (exists (select 1 from presentations p where p.id = presentation_events.presentation_id and public.is_team_member(p.team_id)))
  with check (exists (select 1 from presentations p where p.id = presentation_events.presentation_id and public.is_team_member(p.team_id)));

-- 8. languages — static reference data (ISO codes). Readable by anyone signed
--    in; nobody edits it from the app.
drop policy if exists languages_read on languages;
create policy languages_read on languages
  for select to authenticated
  using (true);

-- ============================================================================
-- Verify with builder/scripts/verify-rls.js — it signs in as a real user and
-- checks what that token can actually reach. Do NOT verify with service_role.
-- ============================================================================
