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
│   └── ls[NN]-[name]/
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
| [`architecture/template-anatomy.md`](architecture/template-anatomy.md) | **The template spec** — 5-layer anatomy every slide template must follow (style, translations, tracking, slide mode, data feed). Read this before creating or modifying any slide template. |
| [`architecture/claude-skill-template-creator.md`](architecture/claude-skill-template-creator.md) | **Claude Desktop skill** — paste into a Claude Desktop Project to get a template generator that always follows the anatomy spec. |

## Key Conventions
- Each slide is a self-contained HTML fragment (`<div class="slide ...">`)
- Slide prefix: `ls[NN]-` (ls01-, ls02-, …) — never reuse a prefix
- `data-edit="key"` on any element = editable in builder, saved to disk
- `data-builder-only=""` on any element = stripped in final customer output
- Slides are registered in `builder/public/preview.html` → `const SLIDES = [...]`
- All slide images served via `/slides/assets/` (from slide-library)
- Uploaded images served via `/slides/uploads/` (builder local only)
- Customer configs live in `customers/[name]/config.json`
- Secrets (passwords, GitHub token) go in `.env` — never hardcoded

## Analytics Conventions
- **Every new component must include umami.track() calls** for all user interactions (clicks, opens, navigations, etc.)
- Tracking calls live inside the component JS file (tabs.js, carousel.js, etc.) — written once, fires in every presentation that uses that component
- Read the slide identifier at runtime: `el.closest('[data-slide]')?.dataset.slide`
- Follow the naming convention in the softsolution project's `docs/umami-guidelines.md`: event name = slide id, properties = component + label + action
- Example: `umami.track(slideId, { component: 'carousel', label: itemTitle, action: 'next' })`
