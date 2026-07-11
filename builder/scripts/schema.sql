-- ============================================================================
-- App Presentation Builder — Supabase schema (Phase 2: multi-user foundation)
-- ============================================================================
-- Run this in the Supabase SQL editor (dev project: presentation-builder-dev).
-- Safe to re-run: every CREATE uses IF NOT EXISTS and the seed uses ON CONFLICT.
--
-- Design rules (see the plan / task for the why):
--   * team_id on every business table NOW (nullable/seeded) so multi-user + RLS
--     later needs no re-migration.
--   * Keep existing STRING ids as primary keys (deck-…, lib-…, "00000004").
--     Only teams/users get UUIDs.
--   * JSONB only for genuinely dynamic blobs (colors, edits, logos). Real columns
--     for anything we filter / sort / join on.
--   * Tables are created in FK-dependency order.
-- ============================================================================

-- ── 0. Teams (the tenant boundary) ──────────────────────────────────────────
create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Single default team for all current (single-user) data. Fixed UUID so the
-- import script and app can reference it deterministically.
insert into teams (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default team')
on conflict (id) do nothing;

-- ── 1. Languages (static reference lookup, ~106 rows, no team scope) ─────────
create table if not exists languages (
  code  text primary key,          -- ISO code, e.g. 'en', 'es', 'fr'
  name  text not null              -- English display name
);

-- ── 2. Templates (slide template catalog; shared across teams for now) ───────
create table if not exists templates (
  id             text primary key,               -- e.g. 'template01-cover'
  team_id        uuid references teams(id),      -- nullable: shared today
  name           text not null,
  category       text,
  slide_mode     text,
  file           text not null,                  -- HTML path, e.g. 'features/slides/slide-01-cover.html'
  components     jsonb not null default '[]',
  tags           jsonb not null default '[]',
  default_edits  jsonb not null default '{}',
  created_at     timestamptz
);

-- ── 3. Settings (one row per team; replaces the old singleton file) ──────────
create table if not exists settings (
  team_id               uuid primary key references teams(id),
  umami_website_id      text,
  homepage_url          text,
  homepage_label        text,
  logos                 jsonb not null default '[]',   -- array of {src, alt}
  logos_on_all_slides   boolean not null default true,
  hero_bg               text,
  hero_bg_focal         text,
  hero_bg_focal_grid    int,
  default_primary_color text,
  default_deck_theme    text,
  updated_at            timestamptz not null default now()
);

-- ── 4. Decks (brand + scalar fields as columns; colors dynamic → JSONB) ──────
create table if not exists decks (
  id                 text primary key,            -- keep existing "deck-…" ids
  team_id            uuid not null references teams(id),
  name               text not null,
  theme              text,
  title              text,                        -- from per-deck deck.json {title}
  logo               text,
  hero_bg            text,
  hero_bg_focal      text,
  hero_bg_focal_grid int,
  hero_bg_fit        text,
  hero_bg_opacity    int,
  hero_bg_type       text,
  hero_bg_color      text,
  style_ref          text,
  style_css          text,                        -- large CSS blob is fine as text
  brand_credit       text,
  website_url        text,
  checkerboard       boolean,
  colors             jsonb not null default '{}', -- {primary, …} dynamic key set
  created_at         timestamptz,
  updated_at         timestamptz not null default now()
);

-- ── 5. Per-user active deck (replaces the GLOBAL activeDeckId singleton) ──────
-- Today: one row keyed by a sentinel single-user uuid until Supabase Auth lands.
create table if not exists user_active_deck (
  team_id     uuid not null references teams(id),
  user_id     uuid not null,
  deck_id     text references decks(id),
  updated_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- ── 6. Slide library (shared library; deckEdits removed → now stays small) ───
create table if not exists slide_library (
  id              text primary key,               -- keep existing "lib-…" ids
  team_id         uuid not null references teams(id),
  name            text not null,
  template_id     text references templates(id),
  edits           jsonb not null default '{}',    -- global default edits
  gallery_enabled boolean not null default false,
  theme_override  text,
  created_at      timestamptz,
  updated_at      timestamptz not null default now()
);

-- ── 7. Deck × slide edits (THE deckEdits split — fixes sustainability issue #1)
-- One row per (deck, library slide). Library no longer grows per deck edit.
create table if not exists deck_slide_edits (
  deck_id          text not null references decks(id) on delete cascade,
  library_slide_id text not null references slide_library(id) on delete cascade,
  team_id          uuid not null references teams(id),
  edits            jsonb not null default '{}',
  updated_at       timestamptz not null default now(),
  primary key (deck_id, library_slide_id)
);

-- ── 8. Deck slides (ordering + visibility, from per-deck deck.json slides[]) ──
create table if not exists deck_slides (
  deck_id          text not null references decks(id) on delete cascade,
  library_slide_id text not null references slide_library(id) on delete cascade,
  slide_ref_id     text not null,                 -- the composite "id" in deck.json
  position         int  not null,
  visible          boolean not null default true,
  primary key (deck_id, slide_ref_id)
);

-- ── 9. Deck translation meta (language set + default, per deck) ──────────────
create table if not exists deck_translation_meta (
  deck_id          text primary key references decks(id) on delete cascade,
  team_id          uuid not null references teams(id),
  languages        jsonb not null default '["en"]',
  default_language text not null default 'en',
  favorites        jsonb not null default '[]'   -- favorited language codes (Translation Center UI)
);

-- ── 10. Deck translations (normalized — drops the `previous` bloat, issue #3) ─
-- 'en' rows are the source; non-en rows hold the current translated value.
-- `dirty` flags a translation that needs re-review after its English changed.
create table if not exists deck_translations (
  deck_id          text not null references decks(id) on delete cascade,
  library_slide_id text not null,
  field_key        text not null,
  lang             text not null,
  value            text,
  dirty            boolean not null default false,
  team_id          uuid not null references teams(id),
  primary key (deck_id, library_slide_id, field_key, lang)
);

-- ── 11. Presentations (frozen snapshots; slides kept as JSONB on purpose) ─────
create table if not exists presentations (
  id                text primary key,             -- keep existing "00000004" style
  team_id           uuid not null references teams(id),
  created_by        uuid,                         -- future rep user; nullable now
  deck_id           text,                         -- NO FK: a frozen presentation must survive its deck being deleted
  presentation_name text,
  customer_name     text,
  customer_url      text,
  contact_name      text,
  contact_title     text,
  customer_logo_src text,
  show_cover_logo   boolean,
  slide_count       int,
  slides            jsonb not null default '[]',  -- FROZEN snapshot (intentional)
  default_language  text,
  languages         jsonb not null default '[]',
  created_at        date,
  published_at      timestamptz,
  replaced_at       timestamptz,
  archived_at       timestamptz
);

-- ── 12. Presentation events (audit trail split out; grows unbounded) ─────────
create table if not exists presentation_events (
  id              bigserial primary key,
  presentation_id text not null references presentations(id) on delete cascade,
  type            text not null,                  -- 'created' | 'published' | 'republished' | …
  at              timestamptz not null,
  deck_id         text,
  deck_name       text
);

-- ── Helpful indexes for the lookups the app does most ────────────────────────
create index if not exists idx_decks_team              on decks(team_id);
create index if not exists idx_slide_library_team      on slide_library(team_id);
create index if not exists idx_deck_slides_deck        on deck_slides(deck_id);
create index if not exists idx_deck_slide_edits_deck   on deck_slide_edits(deck_id);
create index if not exists idx_deck_translations_deck  on deck_translations(deck_id);
create index if not exists idx_presentations_team      on presentations(team_id);
create index if not exists idx_presentations_deck      on presentations(deck_id);
create index if not exists idx_pres_events_pres        on presentation_events(presentation_id);

-- ── Idempotent migrations (bring an already-created DB up to date) ───────────
-- Safe on a fresh DB too (the CREATEs above already include these).
alter table presentations         drop constraint if exists presentations_deck_id_fkey;   -- frozen snapshots outlive decks
alter table presentations         add  column      if not exists archived_at timestamptz;
alter table deck_translation_meta add  column      if not exists favorites   jsonb not null default '[]';

-- ── Grants: let the server's service_role key use these tables ───────────────
-- At project setup we chose "don't auto-expose new tables" (secure default), so
-- the Data API roles get NO access until we grant it. Grant full access to
-- service_role ONLY — the trusted server key (it already bypasses RLS). The
-- public 'anon' / 'authenticated' roles stay locked out until real RLS policies
-- land in Phase 5. `alter default privileges` covers any tables we add later.
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- ============================================================================
-- End of schema. Next: run builder/scripts/import-to-supabase.js to load data.
-- ============================================================================
