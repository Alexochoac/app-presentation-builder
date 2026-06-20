# Changelog

All notable changes to this project will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v1.4.3] — 2026-06-20

### Fixed
- **Tabs under checkerboard** — tab component (tabs.js) hardcoded orange/white colors that ignored the slide theme, making the active tab and add-button low-contrast/unreadable on light (flipped) slides. Now uses `var(--accent)` / `var(--text-muted)` / `var(--border)` so tabs flip correctly under any theme. Affected the technology slides (5/6/7) most, since they're built around tabs. Bonus: tabs now respect each deck's custom primary color.

---

## [v1.4.2] — 2026-06-20

### Added
- **Themes** — Light/dark + checkerboard theme control on the slide `f` button

### Fixed
- List & table drag-reorder now works via pointer events

---

## [v1.4.1] — 2026-06-17

### Fixed
- Encoding corruption introduced during v1.4.0 release (PowerShell BOM added to HTML files, breaking special characters and fonts)

---

## [v1.4.0] — 2026-06-17

### Added
- **Presentations** — Edit + Republish flow; builder Publish flow
- **Presentations** — Image flow + single-bar public view
- **Dashboard** — Image-forward finished cards + republished badge + history
- **Themes** — Finish blocks for all 34 themes (§5 complete)
- **Themes** — Adaptive brand-logo contrast via `--logo-filter`
- **Chrome** — 2× brand logo on large screens
- **Cover** — Customer-logo fill/fit + size controls + text guardrail

### Fixed
- Single-language non-English presentations now render in the correct language when published
- `websiteUrl` persists in decks; company-webpage back link fixed
- Brand logo stays pinned — `.slide-logo-row` guarded as chrome
- Finish lift rule no longer displaces slide chrome

### Removed
- Retired `wbtm/whatbitcointaughtme` theme references and Finish files
- Orphaned `cluely` duplicate and dead `.slide-logo-row` rules

---

## [v1.3.1] — 2026-06-15

### Fixed
- Favicon 404 — `icon.svg` now served at `/favicon.ico` (public, no auth required)
- Published presentations include `<link rel="icon">` pointing to the brand icon

---

## [v1.3.0] — 2026-06-14

### Added
- **Slides** — rebuilt #9 Dimensions, #10 Screen Printing, #11 Logo Check, #12 Traceability, #13 Sensitivity, #14 Installation, #15 Integrations
- **Responsive model** — `pb-responsive` shared model propagated to Cover, Company, CTA, Why Us slides
- **Big-screen sizing** — shared CSS vars + desktop fill model standardized across all slides
- **Publish system** — replaced GitHub-push with local freeze & serve `/public/` model; presentations served from the builder itself
- **Translation Center** — per-line list editing in the translation panel
- **Demo deck** — "Why Switch from PowerPoint" dogfood presentation
- **Surface** — Defect Gallery slide (template06) added to deck

### Fixed
- Products table drag handle reliability + row-control self-heal on missing markup
- List slide hide-chip/restore labels cleaned up via `itemLabel()` helper
- Products Overview overlap, Company IQC uploadable logos, CTA content + contact UX
- Surface defect-button config now persists via `slide-carousel-save`
- Gallery overlays now unique per slide; duplicate stored gallery slides deduplicated
- Company Tab 1/2 content restored in deck-rebuild; Technology label fixed; empty tab dropped
- Cover: transform trap on `pb-chrome` released so gallery button is no longer clipped
- Company image carousel height constrained under `pb-responsive`
- LineScanner "How It Works" tab content restored after save-bug data loss

### Removed
- Legacy canvas render path + default deck (Step H Tier 2)
- Orphan legacy templates and cartridges (Step H Tier 1)
- Abandoned legacy published presentations

---

## [v1.2.0] — 2026-06-06

### Added
- **Surface slide** — per-card uploadable defect icons; legacy canvas renderer removed
- **Uploads** — content-dedup: identical images stored once, regardless of filename
- **Uploads** — overwrite-by-name: re-uploading the same filename replaces it in-place
- **Uploads** — all upload paths (logo, hero, defect icons) share one unified dedup pipeline

### Fixed
- `Track.slideId()` guard in cover and company cartridges — no longer throws when tracker is loaded late
- `tracker.js` now loaded in preview routes so `Track` is defined before slide scripts run
- Publish: `Track` defined in `<head>`; language-switcher moved after `<body>` open to fix script order
- Publish: `finished-presentations/` was accidentally git-ignored — presentations no longer disappear after push

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
