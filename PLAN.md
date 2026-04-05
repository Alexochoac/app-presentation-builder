# Presentation Builder — Product Plan

> This plan is a living document. Phases and features can be moved earlier or later
> based on complexity, priority, or new insights. Last updated: 2026-03-28.

---

## Vision

A web application that lets sales teams build customizable HTML presentations
for their customers — with a master company presentation, per-customer customization,
and a shareable password-protected link that publishes to GitHub Pages.

Designed to start as a local single-user tool and grow into a full multi-user SaaS platform.

---

## Phase 1 — Local App / Single User (Current)

> Goal: A fully working local tool with a user portal, slide builder, and customer delivery.

### Auth & Portal
- [ ] Login page (username + password)
- [ ] GitHub OAuth login option
- [ ] Session management (stay logged in)
- [ ] Single user, single company

### Company Setup
- [ ] Company name, logo upload
- [ ] Brand colors / theme selection
- [ ] Product info (used across slides)

### Dashboard & Deck Manager
- [x] `deck.json` — deck config file (source of truth for slide order/visibility)
- [x] `slide-library.json` — catalog of available slide templates
- [x] `GET /api/deck` and `PUT /api/deck` endpoints
- [x] `GET /api/slide-library` endpoint
- [ ] Dashboard page (`/dashboard`) — two-panel layout
- [ ] Deck panel — ordered list with visibility toggle, remove, drag-to-reorder
- [ ] Library panel — grid of available templates with "Add" button
- [ ] "Open Builder" button — links to preview.html
- [ ] Company settings section on dashboard (logo, brand colors, product info)
- [ ] preview.html reads deck from API (not hardcoded)

### Master Presentation
- [x] Slide builder UI (preview.html)
- [x] Inline editing (`data-edit` attributes, auto-save)
- [x] Image upload per slide
- [x] Slide carousel with thumbnail strip
- [ ] Slide visibility toggle (include/exclude from deck)
- [ ] Drag-to-reorder slides
- [ ] Add / remove slides from library
- [ ] Slide library (fixed layout templates)

### Slides Built
- [x] slide-01 — Cover
- [x] slide-02 — Company
- [ ] slide-03 — (next)
- [ ] slide-04 — Scanner image carousel (in progress)
- [ ] slides 05–14 — remaining content slides

### Customer Presentations
- [ ] Create a new customer presentation from master
- [ ] Set customer name + logo
- [ ] Auto-extract color palette from customer logo
- [ ] Choose which slides are in the main deck
- [ ] Choose which slides appear in the "extras menu" (last slide)
- [ ] Cover slide and CTA slide always required
- [ ] Per-slide text overrides
- [ ] Save customer config to `customers/[name]/config.json`

### Build & Publish
- [x] server.js with save/upload APIs
- [ ] `scripts/build.js` — assemble final HTML output
- [ ] Strip `data-builder-only` elements from output
- [ ] Inject customer logo, colors, overrides into output
- [ ] Publish to GitHub Pages (`docs/[customer]/index.html`)
- [x] Password-protected customer presentation link

### Infrastructure
- [x] Express server (builder/server.js)
- [x] Slide validator (scripts/validate.js)
- [ ] `.env` file for secrets (passwords, GitHub token)
- [ ] `scripts/deploy.js` — push to GitHub Pages

---

## Phase 2 — Web App / Multi-User

> Goal: Deploy to the web. Multiple users, multiple companies, teams with permissions.

### Infrastructure — Start Here
- [ ] `docker-compose.yml` with Postgres — first thing to set up in Phase 2
- [ ] All user/customer/session data moves from JSON files → Postgres
- [ ] DB migration system (e.g. node-postgres + plain SQL migrations)

### Auth & Accounts
- [ ] User registration + email verification
- [ ] Username/password + GitHub OAuth
- [ ] Password reset flow
- [ ] User profile page

### Teams & Permissions
- [ ] Company admin role — manages master presentation, can do everything
- [ ] Sales rep role — can create/edit customer presentations, cannot edit master
- [ ] Invite team members by email
- [ ] Team member management (add, remove, change role)

### Company Setup (cloud)
- [ ] All Phase 1 company features, stored in database
- [ ] Multiple team members share same company presentation

### Customer Presentations (cloud)
- [ ] All Phase 1 customer features, stored in cloud
- [ ] Sales rep creates presentation for their customer
- [ ] Admin can review/approve before publishing

### Infrastructure
- [ ] Choose hosting (Vercel, Railway, or VPS)
- [ ] Database (PostgreSQL recommended)
- [ ] File storage for images/uploads (S3 or similar)
- [ ] Deploy pipeline (GitHub Actions)

---

## Phase 3 — Interactive Slides & Scale

> Goal: Presentations become two-way. Grow the template library. Support multiple companies per user.

### Interactive Features
- [ ] Live polls inside slides (audience votes in real time)
- [ ] Q&A panel — viewer can submit questions from the presentation
- [ ] Presenter dashboard — see live responses
- [ ] Real-time connection (WebSockets or similar)

### Multiple Companies per User
- [ ] One user account can manage multiple company brands
- [ ] Switch between companies in the portal
- [ ] Separate team per company

### Slide Template Library
- [ ] Grow fixed layout options (title, feature, comparison, pricing, team, etc.)
- [ ] Fixed components: tabs, accordion/collapsible, carousels, image buttons, CTA blocks
- [ ] Component picker in builder UI
- [ ] Template preview gallery

### Analytics
- [ ] Track which slides were viewed and for how long
- [ ] Per-customer presentation analytics dashboard
- [ ] Export report

---

## Phase 4 — TBD / Advanced

> Ideas for later phases — not yet planned in detail.

- White-label the platform (other companies resell it under their brand)
- Custom domain per customer presentation
- AI-assisted slide content generation
- PDF / PowerPoint export
- Presentation scoring / engagement metrics
- API for integrations (CRM, Salesforce, HubSpot)

---

## UI Improvements & Polish

> Collect styling/UX notes here as we build. Do one polish pass per phase.

### Auth / Login
- [ ] Restyle login page to match the hubspot-sequences password page style

### Builder UI
_(add as we go)_

### Customer Presentations
_(add as we go)_

---

## Folder Structure (Target)

```
App-presentation-builder/
├── PLAN.md                  ← this file
├── CLAUDE.md                ← project instructions for Claude
├── .gitignore
├── .env.example
│
├── builder/                 ← Local Express app
│   ├── server.js
│   ├── package.json
│   ├── public/
│   │   └── preview.html
│   └── slides/              ← Working slide files (served live)
│       ├── style.css
│       ├── slide-NN-*.html
│       └── uploads/         (gitignored)
│
├── slides/                  ← Master slide library (source of truth)
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
├── customers/               ← Per-customer config & assets
│   └── [customer-name]/
│       ├── config.json
│       ├── logo.png
│       └── uploads/
│
├── scripts/                 ← Automation
│   ├── build.js
│   ├── validate.js
│   └── deploy.js
│
├── docs/                    ← GitHub Pages output (gitignored except index)
│   └── [customer]/
│       └── index.html
│
└── slide-library/           ← Raw reference images
    └── linescanner/
```

---

## Key Conventions

- Each slide is a self-contained HTML fragment (`<div class="slide ...">`)
- Slide prefix: `ls[NN]-` — never reuse a prefix
- `data-edit="key"` = editable in builder, saved to disk
- `data-builder-only=""` = stripped in final customer output
- Slides registered in `builder/public/preview.html` → `const SLIDES = [...]`
