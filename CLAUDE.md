# CLAUDE.md — App Presentation Builder

## What This Project Does
A web application that lets sales teams build customizable HTML presentations
for their customers — starting as a local single-user tool and growing into
a full multi-user SaaS platform.

Current focus: **Phase 1** — local app, single user, single company, with login portal.

For the full product roadmap see [PLAN.md](PLAN.md).

## Phase Overview
- **Phase 1** (current) — Local app, single user/company, user portal, build & publish to GitHub Pages
- **Phase 2** — Web SaaS, multi-user, teams + permissions
- **Phase 3** — Interactive slides (polls, Q&A), multiple companies per user
- **Phase 4** — Advanced (white-label, AI, CRM integrations)

## Tech Stack (Phase 1)
- Node.js + Express (builder server)
- HTML / CSS / JavaScript (slides — no framework, self-contained fragments)
- Auth: username/password + GitHub OAuth (planned)
- No database yet — file-based (JSON configs, HTML files)

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
