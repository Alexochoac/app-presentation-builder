---
title: Settings — Split into Global app settings and per-deck settings
type: Feature
priority: H
status: done
area: settings
order: 4
depends-on: Feature-H-2026-05-10-nav-merge-builder-decks-restructure-sections.md
---

## Goal

Settings currently mixes global app config (theme, presentation name) with what should be per-deck config (logo, hero background, colors). Split them cleanly.

## What Belongs Where

### Global Settings (stays in `/settings`)
- App display language / locale
- Auth / account info (placeholder today)
- Default theme preference for new decks
- Default color palette for new decks
- App-level defaults (Coming Soon placeholders are fine here)

### Per-Deck Settings (moves OUT of `/settings`)
- Logo — the brand logo shown in this deck's presentations
- Hero background image + focal point
- Theme (dark / light) for this deck
- Color palette / primary color for this deck
- Deck name (already editable in deck list)

## Changes to `/settings` page

### Remove from settings page
- Logo upload section → moved to per-deck settings
- Hero background image + focal point picker → moved to per-deck settings
- Presentation name input → this is actually the deck title, move to Builder (deck list rename)
- Theme toggle → becomes a default preference only (global default for new decks)

### Add / keep in settings page
- "App Language" section (already exists as a global concept)
- "New Deck Defaults" section: default theme, default primary color
- "Account" section: user info, password (Coming Soon placeholders)
- "Integrations" section (Coming Soon placeholder — unchanged)

## Per-Deck Settings Panel

Accessible from:
1. Builder section — gear icon on the active deck (or a "Deck Settings" button in deck list sidebar)
2. Decks section (within Builder) — three-dot menu on each deck card → "Settings"

Implemented as a **slide-in drawer** or **modal** (not a full page):

### Per-Deck Settings Drawer Content
- **Deck Name** — editable text input
- **Theme** — Dark / Light toggle
- **Primary Color** — color picker (currently `colors.primary` in decks.json)
- **Logo** — upload, preview, remove (moves from global settings exactly as-is)
- **Hero Background** — upload, preview, focal point picker (moves from global settings exactly as-is)
- Auto-saves to `PUT /api/decks/:id` on change

## Data / API

Per-deck settings already stored in `decks.json` via existing `PUT /api/decks/:id` endpoint.

The logo and hero bg upload endpoints already exist:
- `POST /api/decks/:id/upload-logo`
- Hero bg upload — check if separate endpoint exists or add it

New: `POST /api/decks/:id/upload-hero-bg` if not already present.

## Migration Note

The current `/settings` logo and hero bg are global — they apply to the "default" deck in practice. When splitting:
- The current logo/hero bg values in `settings.json` map to the "default" deck's branding in `decks.json`
- Run a one-time migration on load: if `decks.json` `default.logo` is null but `settings.json` has a logo, copy it over
- No data is lost

## Acceptance Criteria
- [ ] `/settings` page shows only global settings (language, defaults, account, integrations)
- [ ] Per-deck settings drawer opens from Builder sidebar gear icon
- [ ] Per-deck settings drawer has: name, theme, primary color, logo, hero bg + focal point
- [ ] Changes in per-deck drawer auto-save to `PUT /api/decks/:id`
- [ ] Logo upload in per-deck drawer works (reuses existing upload endpoint)
- [ ] Hero bg + focal point picker works in per-deck drawer
- [ ] Removing logo/hero from settings page does not break existing data
