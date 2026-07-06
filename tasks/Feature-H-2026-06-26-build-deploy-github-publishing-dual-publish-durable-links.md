---
title: Build & Deploy — GitHub Publishing — Dual-publish for durable links + analytics failover
type: Feature
priority: H
status: pending
area: build-deploy
---

Make published presentation links survive the builder app being unplugged, **without** changing the customer's link. Customers always receive **our app link** (branded, tracked, editable). At publish time the app *also* silently commits a frozen copy to GitHub Pages as a cold standby. The day we retire/unplug the app, one Cloudflare rule flips every `/public/*` link to its GitHub copy — the link the customer holds never changes.

This is the design decision record from the 2026-06-26 discussion. It supersedes nothing already shipped; the current `/public/` freeze-and-serve model stays as the live/primary path.

---

## The core principle
A redirect must be **served by something**. If the app is off, the app can't redirect itself. So the always-on "front door" has to live *in front of* the app and outlive it — that is **Cloudflare** (already in the chain: `customer → Cloudflare → tunnel → Docker app`). The app can die; Cloudflare stays up and does the failover.

```
Normal day:   customer link → Cloudflare → our app    (tracked, editable, branded)
Unplug day:   customer link → Cloudflare → GitHub copy (static, durable)
                              └ one rule change; the customer link never changes
```

---

## The model — hybrid (app link primary + GitHub cold standby)

1. **Customers always get the app link** (e.g. `put-a-presentation.wbtm.io/public/<id>`) — keeps branding, analytics, edit & republish.
2. **At publish time, the app also commits a frozen copy to GitHub** ("dual-publish"). Invisible to the customer; a standby that *must already exist before* the plug is pulled.
3. **On unplug**, flip one Cloudflare rule: `/public/*` → matching GitHub Pages URL. Links survive as long as the domain + GitHub repo stay alive ("for a while" = however long we keep them).

The optional **download** feature (zip of the same 3-part folder) stays a *bonus* for portability/offline — not the safety net (the failover is).

---

## Repository structure (per GitHub repo)
```
repo/
├── .nojekyll            ← serve files raw; Jekyll never touches them
├── shared/              ← common images, uploaded ONCE, reused by every presentation
│   ├── put-a-logo.png
│   └── slide-icons…
├── acme-corp/
│   ├── index.html       ← references ../shared/logo.png + assets/hero.jpg
│   └── assets/          ← Acme-only images
└── globex/
    ├── index.html
    └── assets/
```

### Image dedup mapping (falls out of the existing path split)
| Current app path | Meaning | Goes to | Notes |
|---|---|---|---|
| `/slides/assets/…` | shared library/brand images | **`shared/`** | uploaded once, topped-up only with new files |
| `/slides/uploads/…` | customer-specific uploads | per-presentation **`assets/`** | already content-deduplicated by the app |

### Path strategy — RELATIVE (decided)
Use **document-relative** paths (`assets/…`, `../shared/…`), never root-absolute (`/shared/…`).
- GitHub Pages is a plain static server + the browser resolves relative paths against the page URL — relative works by design on Pages, locally, and on custom domains.
- Root-absolute breaks on project pages (jumps past the `/repo-name/` segment) and on custom domains.
- **Invariant that keeps relative safe:** every presentation must sit **exactly one folder deep** (`<slug>/index.html`). Never nest deeper, or the `../shared` hop count changes.

---

## Dual-publish flow (Phase 1, single token)
At publish/republish:
1. Freeze the presentation as today (live `/public/<id>` copy stays primary).
2. Gather the images the frozen HTML references; split into shared vs customer-specific per the table above.
3. Copy customer images into `<slug>/assets/`; top up `shared/` with any image not already there.
4. Rewrite image paths in `index.html` to relative (`assets/…`, `../shared/…`).
5. Swap the tracking script for the **public-Umami** one (see below).
6. Commit the 3 things (`index.html`, `assets/`, shared top-up) to GitHub using the single `.env` `GITHUB_TOKEN`, to one repo we own.
7. Record the mapping `presentation-id → GitHub Pages URL` in a small **manifest** so the Cloudflare failover (and any future redirect) knows where each link goes.

---

## Analytics on the GitHub copies (decided)
The static GitHub copies bake in a **public Umami** script so tracking survives independently of the app:

```html
<script defer src="https://umami.wbtm.io/script.js"
        data-website-id="2056a7e6-dbd6-4246-a205-4f89ffe8a37f"></script>
```
- Domain: `alexochoac.github.io` · website-id `2056a7e6-dbd6-4246-a205-4f89ffe8a37f`.
- The `Track` helper events (`slide-<id>` + label) flow to whatever script+id is loaded, so per-slide / per-presentation breakdowns keep working on the GitHub copies.
- **Separate website-id = separate "website" in Umami** → GitHub-copy traffic is cleanly split from live-app traffic (intentional, arguably desirable).

| Copy | Tracking points to |
|---|---|
| App-served link (live) | internal/app Umami (as today) |
| GitHub-published copy | `umami.wbtm.io` + id `2056a7e6-…` |

---

## ⚠️ Must verify before relying on this
- **Is `umami.wbtm.io` hosted independently of the builder?** Today Umami runs as `umami` + `umami-db` services *inside the same docker-compose as the builder*. If "unplug the app" powers down that box, Umami dies with it and the GitHub copies point at a dead tracker. For durable analytics, `umami.wbtm.io` must live on a host that outlives the builder (separate host or Umami Cloud).

---

## Phase split
**Phase 1 (this task — foundation):**
- Dual-publish engine (gather → split → rewrite-relative → commit 3 things), single `.env` `GITHUB_TOKEN`, one repo we own.
- `.nojekyll`, `shared/`+`assets/` structure, relative paths, id→URL manifest.
- Public-Umami script on GitHub copies.
- Document the Cloudflare failover switch as the "unplug" procedure.
- (Optional) download = zip of the same folder.

**Phase 2 (see [[idea-2026-04-22-build-deploy-per-user-github-repo-publish-flow]]):**
- Swap the single token for **per-user GitHub OAuth**; each user publishes to *their own* `theiruser.github.io` repo. The publishing engine above doesn't change — only *whose* token signs the commit.
- Per-user analytics: a single hard-coded website-id is tied to `alexochoac.github.io`; per-user domains need per-user Umami websites (or multi-domain). Roadmap note.

---

## Decisions locked (2026-06-26)
1. **Hybrid model** — app link primary, GitHub copy as cold standby. Not pure-GitHub (would lose branding/analytics control), not download-only (puts burden on customer).
2. **Failover via Cloudflare**, the always-on front door — not an app-served redirect.
3. **Relative paths**, presentations exactly one folder deep.
4. **`shared/` dedup** mapped to `/slides/assets/`; `assets/` to `/slides/uploads/`.
5. **Public Umami** (`umami.wbtm.io`, id `2056a7e6-…`) on GitHub copies.
6. **Phase 1 = single token / our repo; Phase 2 = per-user OAuth.**

## Open questions
- Confirm `umami.wbtm.io` runs independently of the builder (the only thing that can quietly break the analytics-survival plan).
- Repo naming/layout for our single Phase-1 repo (one repo, presentations as `<slug>/` subfolders).
- Slug source for `<slug>/` (company name → kebab-case? collision handling?).
- Cloudflare mechanism for the flip: Bulk Redirect / Rules / Worker — and how it reads the id→URL manifest.

## Related
- [[idea-2026-04-22-build-deploy-per-user-github-repo-publish-flow]] — the Phase 2 per-user slice.
- [[idea-2026-04-14-viewer-auth-gate-static-presentations-github-pages]] — auth gating for static/GitHub-hosted copies (Phase 2).
- Freeze/publish pipeline notes in memory: [[project_html_template_rendering]], [[project_presentation_management]].
