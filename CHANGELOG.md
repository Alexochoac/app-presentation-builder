# Changelog

All notable changes to this project will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v1.1.0] — 2026-05-25

### Added
- **Analytics — Umami** — Dedicated Umami + PostgreSQL instance bundled in docker-compose (localhost:3003); builder injects tracking script dynamically via `UMAMI_BASE_URL`
- **Dashboard — Engagement Activity** — New standalone chart card with date filters (24h / 7d / 30d / Custom), per-presentation dropdown, and live-only filter
- **Dashboard — Events Chart** — Slide popularity and time-series views with drill-down per slide and sub-event breakdown
- **Builder — Presentation Style** — Style picker in Deck Settings with 35 style references, live iframe preview, and CSS injection chain
- **Builder — Theme System** — 24-variable CSS theme system; all slide templates updated to use `var(--name, fallback)` with bridge variables for backward compatibility
- **Builder — New Deck Modal** — Company image upload field; saved as `deck.logo`
- **Builder — Save Modal** — Card Logo auto-defaults from cover slide hero image; field is required if no cover slide exists
- **Builder — Deck Sidebar** — Smart collapse: expands on hover, auto-collapses 3s after mouse leaves
- **Brand — PUT.A. Identity** — SVG icon and wordmark replace all placeholder assets across login and sidebar

### Fixed
- Cover slide logo not persisting on reload (`data-edit-type="image"` containers were being skipped)
- Deck logo not injected as default when no saved logo exists
- Cross-deck edit contamination — non-default decks no longer inherit from the default deck
- Cover slide logo change now syncs to presentation card on dashboard
- Integrations slide — logo upload broken (wrong URL, wrong format), delete button missing, card count floor locked
- Timezone offset — presentations and analytics were showing one day early; fixed across storage, chart buckets, and Umami SQL
- Slide 4 capability matrix — column hide/show state not persisting on reload
- Deck preview vs Open Builder rendering inconsistency — theme CSS now injected in both paths
- Translation AI — silent failures now surface error counts and partial failure notifications
- Translation — removed 193 stale global field translations

### Removed
- Zone-based slide builder (1,878 lines removed)

---

## [v1.0] — 2026-05-16

### Added
- Slide library — create and manage reusable slides
- Deck builder — assemble slides into customer presentations
- Template system — canvas-based and HTML slide templates
- Translation system — multi-language support per deck
- Finished presentations — build and publish self-contained HTML presentations
- Image uploads — per-slide and per-deck logo/image management
- Settings — company branding, accent colors
- Auth — username/password login with session management
- Docker support — Dockerfile, docker-compose, published to GitHub Container Registry
