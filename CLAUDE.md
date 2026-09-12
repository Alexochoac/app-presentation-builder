# CLAUDE.md — App Presentation Builder

## What This Project Does
A web application that lets sales teams build customizable HTML presentations
for their customers — starting as a local single-user tool and growing into
a full multi-user SaaS platform.

**👉 Read [PLAN.md](PLAN.md) first — it holds current status, what's next, and what's pending.**

Current focus: **Phase 2** — multi-user web app. Auth, teams, roles and real data
isolation are done and on `master`; the blocker is the **prod-data-import gate**
(no `/release` until prod's JSON data is imported into Supabase). See PLAN.md.

## Phase Overview
- **Phase 1** — Local app, single user/company ✅ done
- **Phase 2** (current) — Web SaaS, multi-user, teams + permissions — auth/teams/isolation ✅, SMTP-dependent bits deferred
- **Phase 3** — Interactive slides (polls, Q&A), multiple companies per user
- **Phase 4** — Advanced (white-label, AI, CRM integrations)

⚠️ **Two "Phase" numberings exist.** The product phases above, and the Postgres
migration's own 1–6 (where *its* "Phase 5" = Teams & Roles). "Phase 5" nearly
always means the infrastructure one. Prefer names over numbers in new docs.

## Tech Stack
- Node.js + Express (builder server)
- HTML / CSS / JavaScript (slides — no framework, self-contained fragments)
- **Supabase Postgres** — all app data; RLS enforces team isolation
- **Supabase Auth** — email+password and Google/LinkedIn social login; Postgres-backed sessions
- Per-team write-through cache (`builder/lib/store.js`) filled with the user's own JWT
- Publishing: frozen HTML per presentation, app-served at `/public/:id/`

## Project Structure
```
App-presentation-builder/
├── PLAN.md                  ← full roadmap + TODO list
├── CLAUDE.md                ← this file
├── .gitignore
├── .env.example
│
├── builder/                 ← Local Express app (run this to develop)
│   ├── server.js            ← serves slides, save/upload APIs
│   ├── package.json
│   ├── public/
│   │   └── preview.html     ← builder UI
│   └── slides/              ← working slide files (served live)
│       ├── style.css
│       ├── slide-NN-*.html
│       └── uploads/         (gitignored — customer images)
│
├── slides/                  ← master slide library (source of truth)
│   ├── shared/
│   │   ├── style.css
│   │   └── assets/          ← logos, shared images
│   └── template[NN]-[name]/
│       └── slide.html
│
├── themes/                  ← CSS per product/brand
│   ├── base.css
│   ├── softsolution.css
│   └── litesentry.css
│
├── customers/               ← per-customer config & assets
│   └── [customer-name]/
│       ├── config.json
│       ├── logo.png
│       └── uploads/
│
├── scripts/                 ← automation
│   ├── build.js             ← assemble final HTML per customer
│   ├── validate.js          ← check slide structure
│   └── deploy.js            ← push to GitHub Pages
│
├── docs/                    ← GitHub Pages output
│   └── [customer]/
│       └── index.html
│
└── slide-library/           ← raw reference images (source material)
    └── linescanner/
```

## Running the Builder
Run these two commands in PowerShell (Windows):
```powershell
cd C:\Users\Alex\Alex-Projects\active\App-presentation-builder\builder
node server.js
```
Then open: http://localhost:3000/preview.html

## Architecture & Design Docs
All specs and architectural decisions live in [`architecture/`](architecture/).

| Document | Purpose |
|---|---|
| [`architecture/slide-system-rulebook.md`](architecture/slide-system-rulebook.md) | **THE single source of truth** — anatomy (5 layers), lifecycle, IDs, styling, tracking, deck model, template guardrails. Read this before creating or modifying any slide, template, or theme. If anything disagrees with it, it wins. |
| [`architecture/standardization-plan.md`](architecture/standardization-plan.md) | The *why* behind each rule + migration status (the decisions record). |
| [`architecture/skill-package/`](architecture/skill-package/) | **Claude Desktop skill** — upload bundle (SKILL.md + ANATOMY.md + app-base.css) that generates rulebook-compliant template cartridges. |

## Key Conventions
- Each slide is a self-contained HTML "cartridge" (`<div class="slide ...">`) — one `.html` file per slide is the source of truth (no JS string-builder renderers)
- IDs: template `template[NN]-[name]` (unique NN, never reused) · library slide `slide-[name]` · deck slide `deck-[name]` — see the rulebook §4
- `data-edit="key"` on any element = editable in builder, saved to disk
- `data-builder-only=""` on any element = stripped in final customer output
- Slides are registered in `builder/public/preview.html` → `const SLIDES = [...]`
- All slide images served via `/slides/assets/` (from slide-library)
- Uploaded images served via `/slides/uploads/` (builder local only)
- Customer configs live in `customers/[name]/config.json`
- Secrets (passwords, GitHub token) go in `.env` — never hardcoded

## Analytics Conventions
- **Every interactive element must be tracked via the `Track` helper** (`builder/features/slides/components/tracker.js`). **Never call `umami.track()` directly.**
- Tracking calls live inside the component/slide JS (tabs.js, carousel.js, the slide's scoped `<script>`) — written once, fires in every presentation that uses it
- Resolve the slide id: `var slideId = Track.slideId(el);`
- Event shape (defined by tracker.js): event name = `slide-<id>`, properties = `{ label: '<component>-<label>-<action>' }` (one joined string)
- Example: `Track.carousel(slideId, 'next', itemTitle)` → `slide-<id>`, `{ label: 'carousel-<itemTitle>-next' }`
- Full details: rulebook §3 (Tracking-Ready)
