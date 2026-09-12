# Presentation Builder — Product Plan & Status

> **Read this first in a new session.** It answers three questions: what's done,
> what's next, what's pending. Detail lives in `tasks/` — this file points at it,
> it doesn't duplicate it.
>
> **Last updated: 2026-09-12** (after migration-Phase 5 step 4 — app-side team isolation).
> Keep the date honest. A plan nobody trusts is worse than no plan: this file sat
> six months stale and claimed shipped Phase 1 work was still unbuilt.

---

## ⚠️ Status at a glance

| | |
|---|---|
| **Live in prod** | **v1.4.8** (tagged 2026-07-06) — the last release. |
| **On `master`, unreleased** | The entire Supabase migration, Supabase Auth, and teams/roles/RLS. **Two months of work prod has never seen.** |
| **Blocked by** | **The prod-data-import gate** (below). Nothing ships until it clears. |
| **Verified green** | `verify-rls.js` 21/21 · `verify-team-isolation.js` 29/29 |

### 🚧 The gate — read before any `/release`

Prod still runs **v1.4.8: the old JSON-file code, with its own JSON data** — and
**prod is the source of truth for content** (slides are authored in the live app;
a release ships code, never data, because data is volume-mounted outside the
image). `master` runs on Supabase Postgres. Releasing code without first
importing prod's data would point the new code at a database that doesn't have
prod's presentations in it.

So: **import prod data → then release.** The standing rule is *no `/release`
until prod data is in Supabase*.

**This got harder, and it's worth knowing why.** The migration task recommended
*import first, then teams* — because `builder/scripts/import-to-supabase.js`
already worked against the old schema. We did the opposite. The script is still
pre-teams (hardcoded `TEAM`/`SENTINEL_USER`, `created_by: null`, and it writes
the sentinel `user_active_deck` row that the teams migration replaced with real
per-user rows). It must now be **updated for the new schema before it has ever
been run for real** — the "more moving parts, less proven" path. Not a crisis,
but a cost we chose.

---

## ⚠️ Two different "Phase" numberings — don't conflate them

This has bitten us repeatedly. There are two independent sequences:

- **Product phases** (this file): 1 local tool → 2 web/multi-user → 3 interactive → 4 advanced.
- **Infrastructure phases** ([`tasks/Idea-L-2026-05-17-…plan-postgres-for-app.md`](tasks/Idea-L-2026-05-17-infrastructure-database-plan-postgres-for-app.md)):
  the Postgres migration's own 1–6, where its "Phase 5" = Teams & Roles and "Phase 6" = File Storage.

**"Phase 5" almost always means the infrastructure one.** `store.js`'s header uses
the numbering in a third way again (per-slice data cutover). Below, infrastructure
work is called by **name**, not number. Do the same in new docs.

---

## ✅ Done

### Infrastructure — the last two months (all unreleased)
- **Supabase Postgres migration** — all data out of JSON files into Postgres, cut
  over slice by slice (settings → templates/languages → decks/translations →
  slide library → presentations). Write-through cache in `builder/lib/store.js`.
  [`tasks/done/Feature-H-2026-07-06-…migrate-to-supabase-postgres…`](tasks/done/Feature-H-2026-07-06-infrastructure-database-migrate-to-supabase-postgres-multi-user-foundation.md)
- **Supabase Auth** — real per-user accounts, email+password, Google + LinkedIn
  social login, Postgres-backed sessions, admin-gated account creation at
  `/admin/users`. No open signup, by design. (PR #1, merged 2026-08-16.)
  [`tasks/Feature-H-2026-07-25-…supabase-auth…`](tasks/Feature-H-2026-07-25-infrastructure-auth-replace-env-login-with-supabase-auth-multi-user.md)
- **Teams, roles & real data isolation** — `team_members` + `admin`/`rep` roles,
  RBAC replacing the `ADMIN_EMAILS` gate, 17 RLS policies, and the app half:
  per-team caches filled through the **user's own JWT** so the database decides
  what the app can see. Real `created_by` attribution, per-user active deck.
  **"Different users see different things" is finally true.**
  [`tasks/Feature-H-2026-08-21-…phase5-teams-roles-rls.md`](tasks/Feature-H-2026-08-21-infrastructure-auth-phase5-teams-roles-rls.md)

### Product — shipped and live (v1.4.8 and earlier)
Builder UI with inline `data-edit` editing and auto-save · slide library +
templates + a template creator · per-deck branding, themes and a 24-variable CSS
theme system · multi-deck support · translation system with per-deck files and a
Translation Center · presentation lifecycle (create, duplicate, archive, safe
delete) · frozen per-presentation publish to app-served `/public/:id/` · Umami
analytics with a drill-down dashboard · Docker deploy to the Hetzner VPS.

The full record is [`CHANGELOG.md`](CHANGELOG.md) (accurate, through v1.4.8) and
~140 completed task files in [`tasks/done/`](tasks/done/).

---

## ▶️ Next — in order

1. **Update `import-to-supabase.js` for the teams schema.** Stamp a real
   `created_by`, write per-user `user_active_deck` rows, create the
   `team_members` row. **No task file exists for this yet — write one first.**
2. **Back up prod** `data/` + `uploads/` to a timestamped folder.
3. **Dry-run the import** into a throwaway team; verify row counts against prod's
   JSON. *(Never verify with service_role alone — see the gotchas in the teams task.)*
4. **Import prod data for real.**
5. **`/release`** — the gate lifts. Expect this to be a big release: two months of
   unshipped infrastructure at once.
6. **File Storage** (infrastructure) — `uploads/` → Supabase Storage, per-team
   quotas, image compression. Uploads are the **last thing that isn't
   team-isolated**: `/slides/uploads` is served flat and unauthenticated.

---

## 📋 Pending

### Carried over from the teams work
- [ ] **Rep restrictions aren't enforced.** A `rep` can still edit the master deck
      and slide library via the API. Roles exist and gate `/api/users`, but the
      actual restriction was never wired. Small and self-contained.
- [ ] **Templates are global on purpose** — their HTML lives at a non-team-scoped
      filesystem path, so team-stamping the row alone would be isolation theatre.
      Fix templates + files together, with File Storage.
- [ ] **Cache is single-instance.** Per-team caches make a stale cross-team read
      *worse*, not better. LISTEN/NOTIFY before running two containers.

### Open task files — the real backlog
`tasks/` holds the live queue (`status:` in each file's frontmatter). High
priority right now:

| Task | What |
|---|---|
| [Dual-publish for durable links](tasks/Feature-H-2026-06-26-build-deploy-github-publishing-dual-publish-durable-links.md) | Publish a GitHub Pages cold standby so customer links survive the app being unplugged |
| [Always-English tracking labels](tasks/Feature-H-2026-07-06-analytics-always-english-tracking-labels.md) | Analytics labels shouldn't change with the viewer's language |
| [Slide editor save reliability](tasks/Issue-H-2026-06-12-builder-slide-editor-save-reliability-inconsistent.md) | Inconsistent saves in the editor |
| [TC non-list fields lose HTML formatting](tasks/Issue-H-2026-06-12-builder-translation-center-non-list-fields-lose-html-formatting.md) | Part 2 of the Translation Center styling fix (Part 1 shipped in v1.4.5) |

Plus ~18 M/L-priority features, issues and ideas in the same folder.

---

## 🗺️ Product roadmap — what's still ahead

### Phase 2 — Web / Multi-user *(mostly done; this is where we are)*
Auth, teams, roles and isolation are **done**. Still open:
- [ ] Email verification + password reset — needs custom SMTP *(deferred)*
- [ ] Invite team members by email — *same SMTP blocker; admin creates accounts until then*
- [ ] User profile page
- [ ] Admin review/approve a rep's presentation before publishing
- [ ] Public landing page (marketing site, pricing tiers)

### Phase 3 — Interactive slides & scale
- [ ] Live polls in slides; Q&A panel; presenter dashboard (needs WebSockets)
- [ ] Multiple companies per user, switchable, separate team per company
- [ ] Dual-preview (desktop + mobile side by side) in the builder
- [ ] Grow the template library; component picker; template preview gallery

### Phase 4 — Advanced *(not planned in detail)*
White-label · custom domain per presentation · AI-assisted slide content ·
PDF/PowerPoint export · CRM integrations (Salesforce, HubSpot).

---

## Where things actually live

```
App-presentation-builder/
├── PLAN.md            ← this file: status, what's next, what's pending
├── CLAUDE.md          ← project instructions loaded into every session
├── CHANGELOG.md       ← shipped releases (accurate through v1.4.8)
├── VERSIONS.md        ← Docker image tags + deploy commands
├── CONTEXT.md         ← architecture notes (⚠️ header is stale — says "Phase 1")
├── architecture/      ← slide-system-rulebook.md is THE source of truth for slides
├── tasks/             ← the live backlog (status: in frontmatter) + done/
├── builder/
│   ├── server.js              ← the Express app (~6.2k lines)
│   ├── lib/store.js           ← per-team write-through Supabase cache
│   ├── lib/ctx.js             ← per-request { teamId, userId } via AsyncLocalStorage
│   ├── features/auth/         ← auth.js, tokens.js, team-context.js
│   ├── features/slides/       ← slide-NN-*.html + components/
│   ├── features/builder-ui/   ← the builder
│   ├── features/dashboard/    ← analytics + finished presentations
│   └── scripts/               ← import-to-supabase.js, verify-rls.js, verify-team-isolation.js
├── finished-presentations/    ← frozen published output, served at /public/:id/
└── prod/                      ← prod data snapshots (data/, uploads/, finished-presentations/)
```

> The old "target folder structure" block that used to live here described
> `builder/public/preview.html` and `builder/slides/` — neither has existed for
> months. The tree above is the real one.

---

## Key conventions

See [`CLAUDE.md`](CLAUDE.md) for the full list and
[`architecture/slide-system-rulebook.md`](architecture/slide-system-rulebook.md)
for anything touching slides, templates or themes — the rulebook wins on conflict.

- Each slide is a self-contained HTML cartridge (`<div class="slide …">`), one file per slide
- `data-edit="key"` = editable in the builder, saved to the database
- `data-builder-only=""` = stripped from published output
- Every interactive element is tracked via the `Track` helper — never `umami.track()` directly
- Team-scoped data is read through `ctx.teamId()`, which **throws** outside a request.
  If you hit that throw, establish a context — **never add a default team**.
