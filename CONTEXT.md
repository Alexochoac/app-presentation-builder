# Presentation Builder — Project Context

## What This Is
A local Express app for building and publishing customizable HTML slide presentations.
Sales teams use it to build customer-specific decks, then publish to GitHub Pages.

## Current Phase
**Phase 1** — Local app, single user, single company. Login portal + builder UI + publish to GitHub Pages.

## Architecture
- `builder/server.js` — Express server, save/upload/clone APIs
- `builder/features/builder-ui/preview.html` — Builder UI (slide editor)
- `builder/features/dashboard/index.html` — Dashboard (post-login home)
- `builder/features/dashboard/dashboard.js` — Deck manager, slide library, preview, clone
- `builder/shared/app-style.css` — Shared app stylesheet (dark/light theme, Apple Keynote style)
- `builder/features/slides/slide-NN-*.html` — Self-contained slide fragments
- `builder/features/slides/style.css` — Shared CSS for all slides (separate from app style)
- `builder/features/slides/components/` — Reusable JS components:
  - `carousel.js` — `.ls-carousel` declarative image carousel (add/delete/reorder/zoom/compare/autoplay)
  - `lightbox.js` — zoom/gallery lightbox, `data-zoom` + `data-zoom-group`, `+ Add Image` button
  - `tabs.js` — `.ls-tabs` declarative tab switcher (add/delete/rename tabs)
  - `list.js` — `ul[data-ls-list]` editable list (add/hide/delete/reorder/edit)
  - `table.js` — `table[data-ls-table]` capability matrix (rows + columns fully editable)
  - `tracker.js` — Umami analytics
- `.claude/settings.json` — Agent permission allow-list (Edit, Write, Bash)

## Standard Slide Anatomy (introduced 2026-04-07)
All content slides now use this structure:
```html
<div class="slide content lsX">
  <div class="slide-logo-row">...</div>
  <div class="slide-layout">
    <header class="slide-head">
      <div class="section-label">...</div>
      <h1 class="slide-title">...</h1>
      <p class="slide-subtitle">...</p>  <!-- optional -->
    </header>
    <div class="slide-body">
      <!-- tabs, carousel, grid, table, etc. -->
    </div>
  </div>
</div>
```

## Style System
- **App style**: `builder/shared/app-style.css` — Apple Keynote aesthetic, dark/light via `data-theme` on `<html>`, persisted in `localStorage` as `pb-theme`
- **Slide style**: `builder/features/slides/style.css` — Softsolution brand, separate from app style
- **Known issue**: 3-layer CSS conflict (style.css vs per-slide `<style>` blocks vs inline styles) — design system refactor planned for next session

## Component Conventions
- Any `[data-zoom]` image → lightbox on click
- `data-counter` on `.ls-carousel` → shows "1 / N" counter
- `data-no-caption` on `.ls-carousel` → suppresses auto-caption overlay
- `data-builder-only` → element stripped in final customer output
- `data-edit="key"` → editable in builder, auto-saved to disk
- `data-ls-list` on `<ul>` → list.js takes over
- `data-ls-table` on `<table>` → table.js takes over

## Completed This Project
- [x] Builder foundation: Express server, preview.html, save/upload API
- [x] Slides 01–15 created with `data-edit` + `contenteditable` on all text
- [x] All components: carousel.js, lightbox.js, tabs.js, list.js, table.js
- [x] Dashboard: deck manager + slide library + customer settings placeholder
- [x] `deck.json` + `slide-library.json` as source of truth; deck API endpoints
- [x] Full mobile responsiveness pass — all slides
- [x] Full editability pass — all visible text across all slides
- [x] Dashboard slide library redesign: hides in-deck slides, clone flow
- [x] Two-way slide preview with scaled iframe thumbnail + lightbox zoom
- [x] `POST /api/clone-slide` endpoint
- [x] `builder/shared/app-style.css` — shared app style with dark/light theme
- [x] GitHub repo created: `Alexochoac/app-presentation-builder`
- [x] Server-side slide preview shell (`GET /slides/preview/:id`)
- [x] Save handler bug fixed — filename derived from `SLIDES[current].file`
- [x] Mobile-first CSS conversion — all files converted to `min-width` breakpoints
- [x] `table.js` fully wired in slide-04 — restore chips, resizable column, correct classes
- [x] Settings page (`/settings`) — Theme toggle + Coming Soon sections
- [x] Customer Settings on dashboard with customer-specific fields
- [x] Standard slide anatomy (`slide-layout`/`slide-head`/`slide-body`) added to all 14 content slides
- [x] `/idea` skill created for mid-session idea capture
- [x] `IDEAS.md` created with 2 logged ideas
- [x] Template→Library→Deck render chain: server-side render functions for all 14 slides
- [x] `table.js` saveTable fixed — saves parent `.ls-tabs` container (fixes column-hide persistence)
- [x] `tabs.js` fixed — calls `LSTable.init` on tab switch (fixes table buttons on non-active tabs)
- [x] Slide 04 mobile: carousel above table via `order:-1`
- [x] `builder/data/renderers/` — individual render function files for slides 06–14
- [x] Mobile carousel fix — all slides (6–12, 14, 2, 4, 5): `min-height` pattern, `slide-body width:100%`, `overflow:hidden` removed from slide-14
- [x] Slide 8 desktop fix — two-column flex layout with carousel filling right column
- [x] Slide 12 — badges moved inside first carousel slide; `.ls12-diagram-wrap` made flex column
- [x] Slide 4 mobile — vertical column headers, proc-grid single column, scrollable
- [x] Root cause documented: `server.js` is the only source of truth for rendered slides

## Next Steps
- [x] Presentation view — `/view/:id` read-only slideshow viewer (session 5)
- [x] `PB_READONLY` mode — all 4 components skip edit controls (session 5)
- [x] Add Slide modal — replaced stub with real template picker (2026-04-20)
- [x] Builder preview nav bar — proper header with counter, badge, history.back (2026-04-20)
- [x] Slide-06 defect gallery — fixed JS selector, gallery button, add/delete, clipping (2026-04-20)
- [x] Cover slide gallery — fixed overlay, prefix normalization, delete/move buttons (2026-04-20)
- [x] Edit presentation metadata — inline edit Name/Contact/Position via PUT API (2026-04-20)
- [x] Delete presentation — confirmation + DELETE API, removes entry + deck file (2026-04-20)
- [x] Viewer cover slide gallery button — exposed in readonly mode (2026-04-20)
- [x] Viewer carousel autoplay — fixed timing bug in iframe readonly context (2026-04-20)
- [x] **Asset cleanup** — moved all slide-library images to uploads/, deleted slide-library/ folder (2026-04-20)
- [x] `scripts/build.js` — assemble final customer HTML, strip `data-builder-only` (2026-04-20)
- [x] `buildFrozenPresentation()` in server.js — auto-runs on every `POST /api/presentations` (2026-04-20)
- [x] `finished-presentations/[presId]/index.html` — self-contained frozen output per presentation (2026-04-20)
- [x] Shared asset pool — `finished-presentations/shared/` deduplicated across all presentations (2026-04-20)
- [x] Delete frozen folder on dashboard delete — `fs.rmSync` in DELETE endpoint (2026-04-20)
- [x] `/finished/:presId/` static route — serves frozen file; `/view/:id` redirects to it (2026-04-20)
- [x] **Dashboard list/grid view toggle** — ☰/▪▪ toggle in panel header, localStorage persistence (2026-04-20)
- [x] **Grid cards with customer logo** — logo fills card; initials fallback; `customerLogoSrc` stored at save time (2026-04-20)
- [x] **slideCount fix** — only counts visible slides (2026-04-20)
- [x] **Duplicate presentation** — clone with reconfigured customer settings (2026-04-21)
- [x] **Hidden slides visual + output behavior** — hidden slides excluded from counts and frozen output (2026-04-21)
- [x] **Duplicate published link** — fixed `umamiId` scope bug (ReferenceError in `.catch`) + added published link to duplicate card immediately on success (2026-04-22)
- [x] **Dashboard filter bar** — real-time search + date range (Flatpickr) + custom sort dropdown; `allItems` array + `applyFilters()` pattern (2026-04-22)
- [x] **Auto-scan components folder** — `buildFrozenPresentation()` uses `fs.readdirSync` instead of hardcoded array (2026-04-22)
- [x] **button.js + tags.js** — shared components auto-attach `Track.click()` to `.slide-btn` / `.slide-tag` on load (2026-04-22)
- [x] **slide-library.json path fix** — `../shared/CostOfQualityDefects.png` → `/slides/uploads/CostOfQualityDefects.png` (2026-04-22)
- [x] **JS crash fix** — `carousel-file` and `logo-file` listeners guarded with `if (!window.PB_READONLY)` so finished presentations don't crash on load (2026-04-24)
- [x] **Benteler presentation** — new `benteler-00000001` deck created with customer logo and slides (2026-04-24)
- [x] **Cover slide + carousel updates** — slide-01-cover.html and carousel.js improved (2026-04-24)
- [x] **Dashboard — Views Overview** — bar chart (Chart.js 4) with date filter dropdown, presentations multi-select dropdown with search, Overview tab, logo-click-to-filter; "Coming Soon" badge; mock data only (2026-04-25)
- [x] **GitHub Pages publish** — `POST /api/presentations/:id/publish` + `scripts/deploy.js` + Publish button on Dashboard card `⋯` menu (2026-04-26)
- [x] **Dashboard card actions menu** — replaced View/Edit/Duplicate/Delete buttons with `⋯` icon dropdown; View becomes double-click on company name (2026-04-26)
- [x] **Presentation ID format** — changed from `slug-00000001` to `00000001` (number only) in `makePresId()` (2026-04-26)
- [x] **Published presentation state + archive flow** — `publishedAt`/`archivedAt` fields, Published badge, Archive replaces Delete after publish, hard-delete modal warning (2026-04-26)
- [x] **Builder — Save as finished: Replace existing** — two-option modal (New / Replace), replaceId on server, replacedAt timestamp, published warning, read-only identity fields (2026-04-30)
- [x] **Builder — Create Presentation button moved to end of flow** — removed from Slide Preview, added to preview.html header + slides ⋯ menu; dashboard entry point removed (2026-04-30)
- [x] **Translation feature (Phase 1)** — `languages.json`, `translations.json`, `translator.js` (OpenRouter API), 5 backend endpoints, dirty-flag hook on save, Translate toolbar button + badge, per-field translation popover, Translation Settings modal (add/remove languages), builder preview language switcher (EN/ES/IT/PT/FR) with read-only mode (2026-04-30)
- [x] **Translation — Finished presentation** — bake `[data-lang]` spans + inject `language-switcher.js` into output HTML at Create time (2026-05-16)
- [x] **Translation — Badge overcount fix** — skip non-text (image) fields from badge count (2026-05-16)
- [x] **Translation — Dirty flag for library slides** — `markSlideTranslationsDirty()` wired into deck slide save (2026-05-16)
- [ ] **Translation — Preview navigate fix** — replace fragile `setTimeout(50)` with reliable slide-ready signal
- [ ] **Design system refactor** (carried) — eliminate 3-layer CSS conflict; one source of truth in style.css
- [ ] Delete old `dashboard.css`
- [x] **Dashboard — Finished Presentations panel restored** — search, date filter, sort, paginated list, View / Re-publish / Delete per row (2026-05-10)
- [x] **Dashboard — FP grid/list toggle** — icon buttons in panel header, CSS grid mode, localStorage persistence (2026-05-11)
- [x] **Dashboard — Publication Activity collapsible** — moved below FP, starts collapsed, chevron toggle, localStorage; date dropdown click doesn't trigger collapse (2026-05-11)
- [x] **Dashboard — Recent Activity as collapsible subsection** — moved inside Publication Activity panel, starts open, independent collapse toggle (2026-05-11)
- [x] **Dashboard — Umami analytics proxy** — server-side JWT auth (`getUmamiToken`), 15-min cache (`umamiGet`), 3 endpoints: `/api/analytics/batch`, `/api/analytics/presentation/:id`, `/api/analytics/pageviews`; credentials in `.env` (`UMAMI_USERNAME`, `UMAMI_PASSWORD`) (2026-05-11)
- [x] **Dashboard — Per-card Umami metrics** — visitors / views / bounce rate / avg duration strip injected into each FP card after batch fetch (2026-05-11)
- [x] **Dashboard — Engagement chart** — Chart.js line chart (pageviews + visitors) inside Publication Activity, lazy-loads on panel open (2026-05-11)
- [x] **Slides — My Library card actions** — replaced Edit/Duplicate/Delete bar with gear ⚙ + 3-dots (⋮) dropdown; double-click thumbnail opens Builder; list-row double-click also wired (2026-05-14)
- [x] **builder-ui — Finished Presentations redesign** — gear dropdown (Duplicate, Publish, Edit, History, Archive), filtered by active deck, search input, deckId persisted on save/duplicate, upward-opening dropdown (2026-05-14)
- [x] **Dashboard — Finished Presentations full redesign** — grid/list toggle (⊞/☰); two-row horizontal layout (name+badge / customer·date·#ID link); status filter (Active/Archived/All); Live/Draft/Archived badges; gear ⚙ upward dropdown; click #ID = copy public URL, dblclick = open; logo dblclick filters Publication Activity chart; 38px list / 56px grid logos with hover tooltip; opaque modals (#1c1c1e dark / #fff light) (2026-05-14)
- [x] **Presentation lifecycle** — `makePresId()` uses max(existing)+1 (no repeated IDs after delete); archive-only from active list (no accidental hard delete); permanent delete from Archived view requires typing DELETE; public GitHub Pages URL used for published links (2026-05-14)
- [x] **Slides — Templates tab standardization** — gear+3-dots card action pattern applied (2026-05-14)
- [ ] **builder-ui — fpDelete improve** — replace native confirm() with proper modal matching dashboard archive flow
- [x] **Zone Builder — Layout Library data model** — `layout-skeletons.json` (10 skeletons), `GET /api/layout-skeletons` endpoint (2026-05-14)
- [x] **Zone Builder — 3-panel builder shell** — layout picker screen + 3-panel builder (palette / canvas / properties) at `/zone-builder` (2026-05-14)
- [x] **Zone Builder — Canvas renderer** — header zone (section label + headline), component palette drop system, slot picking (2026-05-14)
- [x] **Zone Builder — Properties panel text styles** — font size, weight, style, align, color controls per selected component (2026-05-14)
- [x] **Zone Builder — HTML assembler + save** — `assembleHtml()` produces anatomy-compliant HTML, `POST /api/slide-builder/save` endpoint (2026-05-14)
- [x] **Zone Builder — Carousel image upload** — file picker to upload API, add/remove slides, placeholder stripping at assembly (2026-05-14)
- [x] **Zone Builder — Save to Templates catalog** — saves to `templates.json` (not library); category selector; ZB badge on template cards; "Zone Builder" edit button for ZB templates (2026-05-14)
- [x] **Slides — New Slide modal redesign** — full-screen takeover to 860px centered popup; New Template + Import + Cancel footer (2026-05-14)
- [x] **Slides — Templates tab New Template button** — navigates to `/zone-builder` (2026-05-14)
- [x] **Docker + Cloudflare Tunnel** — Dockerfile, .dockerignore, docker-compose; added to n8n main stack; prod data separated into `prod/`; image published to `ghcr.io/alexochoac/app-presentation-builder:v1.0`; GitHub Release v1.0 created; README, CHANGELOG, VERSIONS.md added (2026-05-16)
- [x] **Translation system — Per-deck isolation** — translations.json moved from global `builder/data/` to per-deck `builder/data/decks/[deckId]/`; all server endpoints read/write active deck's file (2026-05-16)
- [x] **Translation system — bakeLanguageSpans per-deck** — `buildFrozenPresentation()` reads translations from `presentation.deckId` (2026-05-16)
- [x] **Translation system — AI translator error handling** — 30s timeout on OpenRouter fetch; failure tracking per chunk; `{ translated, failed, errors }` returned from both translate endpoints; inline red error shown in Translation Settings; batch failure count shown in TC progress bar (2026-05-16)
- [x] **Translation system — Remove dead global fields section** — `translationsData.fields` references removed from server.js and preview.html; global `builder/data/translations.json` deleted; `TRANSLATIONS_PATH` constant removed (2026-05-16)
- [x] **Translation Settings UX** — removed redundant Translate button; "Open Translation Center" now auto-saves language selection before opening TC (2026-05-16)
- [x] **Builder preview — per-slide translation isolation** — `applyPreviewLang()` scoped per slide element; `enSnapshot` keyed by `idx/fieldKey` to prevent cross-slide field bleeding (2026-05-16)
- [x] **Translation Center** — HTML stripped for display; no-change detection on blur prevents overwriting HTML-formatted translations (2026-05-16)
- [x] **Umami dedicated local analytics instance** — self-hosted Umami running locally; server uses username/password auth + direct Postgres queries for filtered analytics (2026-05-17)
- [x] **Cover slide logo fixes** — customer logo persists on reload; deck logo injected as default when none set; key names unified across save/load; logo synced to presentation card on change (2026-05-23)
- [x] **Slide edits contamination fix** — default deck edits no longer bleed into other decks (2026-05-23)
- [x] **Timezone date offset fix** — presentations and analytics no longer show one day early (2026-05-24)
- [x] **Zone Builder removed** — zone-builder feature and all related tasks removed; slide creation is now template-based only via the Slides section (2026-05-24)
- [x] **Deck style picker** — "Presentation Style" section in Deck Settings drawer, 35 style-reference picker modal, CSS extraction pipeline (`buildThemeOverride`/`extractStyleCss`), `styleCss` stored in `decks.json` (2026-05-23, superseded by per-slide theme system)
- [x] **24-variable CSS theme system** — 35 `.css` theme files in `builder/themes/`, auto-generated by `generate-themes.js`; `style.css` bridge variables; Template Detail View theme picker; per-slide `styleCss` stored at create time; priority: slide theme > deck CSS (2026-05-24)
- [x] **gallery.js** — new shared image gallery component (2026-05-24)
- [x] **architecture/template-lifecycle.md** — plain-language lifecycle doc for Template → Library Slide → Deck Slide → Frozen Presentation stages (2026-05-24)
- [x] **Dashboard Engagement Analytics panel** — pageviews + events chart modes, drill-down (per-slide per-presentation), deck/presentation filter hierarchy with `getActivePresIds()`, direct Postgres queries via `pg.Pool` + `dbPresTimeSeriesWithBreakdown()`, sticky Y-axis max (2026-05-24)
- [ ] **Translation — Preview navigate fix** — replace fragile `setTimeout(50)` with reliable slide-ready signal
- [ ] **Design system refactor** (carried) — eliminate 3-layer CSS conflict; one source of truth in style.css
- [ ] **builder-ui — fpDelete improve** — replace native confirm() with proper modal matching dashboard archive flow
- [ ] **Dashboard — Engagement chart filter** — live-only filter, multi-select checkbox dropdown, card image click shortcut (Feature-M-2026-05-22)
- [ ] **Dashboard — Events chart** — slide popularity + time-series + drill-down per-slide sub-events (Feature-M-2026-05-22)
- [ ] **Hero bg color fix** — opacity/color not updating in canvas (Issue-H-2026-05-17)
- [x] **Tabs language switch fix** — `applyPreviewLang` now resets `_lsTabsInit` + re-inits tabs after every language change; `tabs.js` removes duplicate `+ Tab` buttons on re-init; deployed as v1.1.2 (2026-05-27)
- [x] **Slide System Rulebook** — `architecture/slide-system-rulebook.md` is the single source of truth for anatomy, IDs, tracking, deck model, and template guardrails; slide gate validator added as pre-commit hook (2026-06-06)
- [x] **Standardization milestone** — two-block theming, slide rebuilds, gallery/Details/hero patterns brought to rulebook compliance (2026-06-06)
- [x] **Translation system architecture doc** — `architecture/translation-system.md` documents the full multi-language / Translation Center system (2026-06-06)
- [x] **Upload improvements** — content-dedup (identical images stored once), overwrite-by-name, all upload paths (logo, hero, defect icons) share one unified `dedupUpload` pipeline; overwrite warning added (2026-06-06)
- [x] **Slide 06 Surface — per-card defect icons** — each defect card has an uploadable icon; legacy canvas renderer removed; dynamic add/delete cards preserved (2026-06-06)
- [x] **tracker.js guardrails** — `Track.slideId()` guarded in cover/company cartridges; `tracker.js` loaded in preview routes before slide scripts run; `Track` defined in `<head>` of published output (2026-06-06)
- [x] **Publish fixes** — `finished-presentations/` removed from `.gitignore`; language-switcher script moved after `<body>` open to fix script load order (2026-06-06)
- [x] **v1.2.0 released** — Docker image pushed to ghcr.io, in-place deploy on production stack, GitHub Release created (2026-06-06)
- [x] **v1.2.1 hotfix** — `/slides/uploads` and `/slides/shared` moved before `requireAuth` so shared/readonly presentations can load images without a session cookie; localhost URLs scrubbed from data files (2026-06-06)
- [x] **Sidebar version label** — `v{version}` shown below Log out in all 5 sidebar pages; `.sidebar-version` CSS class in `app-style.css`; release checklist updated (2026-06-06)
- [x] **Single render path** — `renderCartridge()` is the sole render function; Why Us rebuilt as slide #3 (2026-06-08)
- [x] **pb-responsive model** — shared responsive model propagated to Cover, Company, CTA, Why Us (2026-06-09)
- [x] **Translation Center per-line list editing** — individual list item editing in TC panel (2026-06-10)
- [x] **Slide rebuilds #4–15** — Products (#4), Technology (#5–7), Surface (#8), Dimensions (#9), Screen Printing (#10), Logo Check (#11), Traceability (#12), Sensitivity (#13), Installation (#14), Integrations (#15) — all on named template cartridges (2026-06-06 to 2026-06-12)
- [x] **Big-screen sizing standardization** — shared CSS vars + desktop fill model across all slides (2026-06-11)
- [x] **Surface Defect Gallery** — template06 Defect Gallery slide added to deck (2026-06-10)
- [x] **Step H cleanup** — Tier 1: orphan legacy templates + cartridges removed; Tier 2: default deck + legacy canvas render path removed; finished-presentations de-git'd (2026-06-12)
- [x] **Publish system refactor** — dropped GitHub-push; presentations freeze & serve at `/public/:id/` directly from the builder (2026-06-12)
- [x] **"Why Switch from PowerPoint" demo deck** — dogfood presentation built (2026-06-13)
- [x] **Various fixes** — drag handle reliability + products-table row-control self-heal; list hide-chip/restore labels via `itemLabel()`; surface defect-button config persistence; gallery overlay dedup; Company tab content restore (2026-06-12)
- [x] **v1.3.0 released** — Docker image pushed, standalone compose updated, GitHub Release created (2026-06-14)
- [x] **Favicon** — `icon.svg` served at `/favicon.ico` (public, no auth); published presentations include `<link rel="icon">` (2026-06-15)
- [x] **Cloudflare Access bypass** — `/public/*` exempt from Zero Trust auth so presentations load without login (2026-06-15)
- [x] **v1.3.1 released** — favicon patch, Docker image updated in-place on production stack (2026-06-15)

## Phase Roadmap
- **Phase 1** (current) — Local app, single user, build + publish
- **Phase 2** — SaaS, multi-user, teams + permissions
- **Phase 3** — Interactive slides (polls, Q&A), multiple companies per user
- **Phase 4** — Advanced (white-label, AI, CRM integrations)

Last updated: 2026-06-15 (session 22)
