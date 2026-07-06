---
description: Full release — build Docker image, push to ghcr.io, deploy to the VPS (aoc-server), update CHANGELOG, create GitHub Release.
---

# Release — App Presentation Builder

## Paths

- **App source:** `C:/Users/Alex/Alex-Projects/active/App-presentation-builder/builder`
- **Image registry:** `ghcr.io/alexochoac/app-presentation-builder`
- **Production:** Hetzner VPS `aoc-server` (157.90.29.119) — app at `/home/alex/app-stack/`, connect with `ssh aoc-server`
- **Public URL:** `https://put-a-presentation.wbtm.io` (Cloudflare Tunnel `aoc-server` → `builder:3000`)
- **Project root:** `C:/Users/Alex/Alex-Projects/active/App-presentation-builder`
- **Prod data:** lives ON the VPS under `app-stack/{data,uploads,finished-presentations}` + volume `umami-db-data` — persists across releases, never copied

---

## Backwards Compatibility — CRITICAL RULE

**Every new version must be fully backwards compatible with existing data.**

This means:
- Existing decks must open and work exactly as before
- Existing presentations must render correctly without any manual fixes
- Existing slide content, translations, and settings must be preserved
- JSON data files must not have breaking schema changes — add new fields only, never remove or rename existing ones
- If a breaking change is truly unavoidable (MAJOR version bump), write a migration script that runs automatically on first start

Before releasing, ask: *"If someone opens this new version with their old data, will everything still work?"*

---

## Versioning — SemVer

Versions follow **Semantic Versioning**: `vMAJOR.MINOR.PATCH`

| Number | When to bump | Example |
|--------|-------------|---------|
| MAJOR | Breaking change — old data or workflows may stop working | v2.0.0 |
| MINOR | New features added, nothing broken | v1.1.0 |
| PATCH | Bug fixes only | v1.1.1 |

Examples: `v1.1.0`, `v1.2.0`, `v2.0.0`

---

## Deployment Model — VPS (single app-stack)

Production runs on the **Hetzner VPS `aoc-server`** (157.90.29.119) as one Docker
Compose project named `put-a-presentation`, in `/home/alex/app-stack/`. Connect with
`ssh aoc-server`.

Three services (do NOT recreate umami on an app release):
- `builder` — the app (container `app-{version}`), image pulled from ghcr.io, pinned to the version tag
- `umami` — analytics (pinned by image digest — see project memory `project_vps_server.md`)
- `umami-db` — PostgreSQL for umami

**Data lives ON the VPS and persists across releases** — bind mounts under
`app-stack/` (`data/`, `uploads/`, `finished-presentations/`) + named volume
`umami-db-data`. A release NEVER copies or touches data.

**Public access:** cloudflared (in `/home/alex/personal-stack/`, on the `edge`
Docker network) routes `put-a-presentation.wbtm.io → builder:3000` and
`put-a-presentation-umami.wbtm.io → umami:3000`. **Tunnel routes do NOT change on a release.**

So shipping a new version = build + push the image, then bump the `builder` image
tag on the VPS and recreate only that container.

> **RETIRED (2026-06-29):** the old mini-PC flow — version folders under
> `C:/Users/Alex/put-a-presentation/`, per-version ports, `host.docker.internal`,
> copying data forward, the `n8n-mini-pc` tunnel — is no longer used. Production is the VPS.

---

## Quick redeploy (TL;DR)

After build + push, ship to the VPS — swaps the `builder` image tag and recreates
only that container (umami/umami-db untouched, data untouched):

```bash
ssh aoc-server
cd app-stack
sed -i 's#app-presentation-builder:v[0-9.]*#app-presentation-builder:{version}#' docker-compose.yml
sed -i 's/container_name: app-v[0-9.]*/container_name: app-{version}/' docker-compose.yml
docker compose pull builder
docker compose up -d builder
```

Full procedure with prep + verify is the numbered steps below.

> **⚠️ Run VPS/SSH commands through PowerShell, not the Bash (git bash) tool.**
> The `aoc-server` alias, its `HostName`/`User`, and the `hetzner_personal`
> IdentityFile live in the **Windows OpenSSH** config (`C:/Users/Alex/.ssh/config`).
> Git bash's `ssh` doesn't read that config and fails with
> `Permission denied (publickey)`. Use the **PowerShell tool** for every `ssh aoc-server ...`.
>
> Also: pass the remote command as a **single line** (`;`-separated), not with
> `\`-newline continuations — line-continuations get mangled in transit and
> break remote `sed` (`unterminated 's' command`). Example:
> `ssh aoc-server "cd app-stack; sed -i '...' docker-compose.yml; docker compose pull builder; docker compose up -d builder"`

---

## Required env vars (lives in `/home/alex/app-stack/.env` on the VPS)

| Var | Example | Purpose |
|-----|---------|---------|
| `BUILDER_USER` | `alexochoac` | Login username |
| `BUILDER_PASS` | `...` | Login password |
| `SESSION_SECRET` | random string | Session signing |
| `PUBLIC_BASE_URL` | `https://put-a-presentation.wbtm.io` | Public URL injected into presentation links |
| `UMAMI_BASE_URL` | `https://put-a-presentation-umami.wbtm.io` | Public URL for umami tracking script |
| `UMAMI_API_URL` | `http://umami:3000` | Internal Docker URL for server-side API calls |
| `UMAMI_USERNAME` | `admin` | Umami admin login |
| `UMAMI_PASSWORD` | `...` | Umami admin password (must match the umami admin account) |
| `UMAMI_WEBSITE_ID` | `69508062-...` | Umami website ID (overrides settings.json — this value wins) |
| `UMAMI_DB_URL` | `postgresql://umami:umami@umami-db:5432/umami` | Direct Postgres connection for analytics queries |
| `GITHUB_TOKEN` | `ghp_...` | Token for git push to publish presentations |

> `UMAMI_API_URL` / `UMAMI_DB_URL` use the Docker service names `umami` / `umami-db` (same compose network).
> `PUBLIC_BASE_URL` must be set — without it the server defaults to `http://localhost:3000` and public links break.
> `UMAMI_WEBSITE_ID` takes precedence over `settings.json`'s `umamiWebsiteId` everywhere in code (`UMAMI_WEBSITE_ID || settings.umamiWebsiteId`).
> `/api/settings` is intentionally public (no auth) so the login page can read `publicBaseUrl` before login.
> If new env vars are added in a release, update the VPS `.env` before `docker compose up -d`.

---

## Step 1 — Version number

If the user passed a version (e.g. `/release v1.2.0`), use it.
If not, ask: **What version number? (e.g. `v1.2.0`)**
Must start with `v` and follow semver (vMAJOR.MINOR.PATCH).

---

## Step 2 — Release notes

If CHANGELOG.md already has an entry for this version, use those notes.
If not, ask: **What changed in this version?**
Keep it as bullet points — used in CHANGELOG.md and GitHub Release.

---

## Step 3 — Pre-build prep (BEFORE building — both get baked into the image)

### 3a — Update sidebar version label

Update the `v{old}` string to `v{version}` in the `.sidebar-version` div across all 5 sidebar files:

- `builder/features/builder-ui/index.html`
- `builder/features/dashboard/index.html`
- `builder/features/layouts/index.html`
- `builder/features/settings/index.html`
- `builder/features/slides/index.html`

Each file has this pattern just below the Log out link:

```html
<div class="sidebar-version">v{version}</div>
```

> **⚠️ Must be done BEFORE the build** — the version label is baked into the image. Updating after means a full rebuild.
>
> **⚠️ Encoding — do NOT corrupt these files (this bit us in v1.4.0).**
> These HTML files are **UTF-8 without a BOM** and contain special characters (em-dashes `—`, box-drawing `──`, middots `·`, the `↻` glyph, emoji). Editing them with **PowerShell `Set-Content` / `Out-File` adds a UTF-8 BOM and re-encodes those characters into mojibake** (`—`→`â€"`, `──`→`â”€â”€`, `·`→`Â·`), which breaks fonts/characters in the UI.
>
> Rules:
> - Change **only** the version line — use a precise in-place edit, never a full rewrite of the file.
> - If you must use PowerShell, use `Set-Content -Encoding utf8NoBOM` (PowerShell 7); plain `Set-Content`/`Out-File` default to BOM/UTF-16. Prefer the agent's Edit tool or `sed`, which preserve encoding.
> - **Verify after editing** — no BOM and no mojibake:
>   ```bash
>   grep -rl $'\xef\xbb\xbf' builder/features/*/index.html   # BOM check — must print nothing
>   grep -rl 'â€\|â”€\|Â·' builder/features/*/index.html       # mojibake check — must print nothing
>   ```

### 3b — Scrub localhost URLs from data files

Image URLs saved during local dev may be absolute `http://localhost:3000/...` instead of relative `/slides/uploads/...`. These break in production (mixed-content over HTTPS).

```bash
grep -rl "http://localhost:3000" builder/data/
```

If any files are found, strip the host prefix, e.g.:

```bash
sed -i 's|http://localhost:3000/slides/uploads/|/slides/uploads/|g' builder/data/decks/default/translations.json builder/data/slide-library.json
# add any other files grep found
```

Verify zero matches remain, then commit the cleaned files before building:

```bash
grep -r "http://localhost:3000" builder/data/
```

---

## Step 4 — Build image

```bash
docker build \
  -t ghcr.io/alexochoac/app-presentation-builder:{version} \
  -t ghcr.io/alexochoac/app-presentation-builder:latest \
  "C:/Users/Alex/Alex-Projects/active/App-presentation-builder/builder"
```

Stop if it fails.

---

## Step 5 — Push to ghcr.io

```bash
docker push ghcr.io/alexochoac/app-presentation-builder:{version}
docker push ghcr.io/alexochoac/app-presentation-builder:latest
```

Stop if it fails. (The VPS pulls from ghcr.io — it's already authenticated with a `read:packages` token.)

---

## Step 6 — Deploy to the VPS

Swap the `builder` image tag and recreate only that container. **No data copy, no tunnel change.**

```bash
ssh aoc-server
cd app-stack

# bump the builder image tag + container name to the new version:
sed -i 's#app-presentation-builder:v[0-9.]*#app-presentation-builder:{version}#' docker-compose.yml
sed -i 's/container_name: app-v[0-9.]*/container_name: app-{version}/' docker-compose.yml

# if new env vars were added this release, edit ./.env first, then:
docker compose pull builder
docker compose up -d builder    # recreates ONLY builder; umami + umami-db keep running
```

---

## Step 7 — Verify

```bash
# on the VPS:
docker compose ps
docker exec app-{version} wget -qO- http://localhost:3000/api/settings | head -c 200
# expect success:true with publicBaseUrl https://put-a-presentation.wbtm.io
```

From anywhere, load `https://put-a-presentation.wbtm.io` and confirm the new version (sidebar shows `v{version}`).

**Roll back** if needed: set the image tag back to the previous version and `docker compose up -d builder`.

---

## Step 8 — Update CHANGELOG.md

Add a new entry at the top of the release history:

```markdown
## [{version}] — {today's date}

### Added / Changed / Fixed
- {bullets from release notes}
```

---

## Step 9 — Commit, tag, push

```bash
cd "C:/Users/Alex/Alex-Projects/active/App-presentation-builder"
git add CHANGELOG.md .claude/commands/release.md builder/features/*/index.html builder/data/
git commit -m "chore: release {version}"
git tag {version}
git push origin master
git push origin {version}
```

---

## Step 10 — GitHub Release

```bash
gh release create {version} \
  --title "{version} — {short title}" \
  --notes "{release notes + docker pull line}"
```

Always append to the notes:
```
## Docker image
docker pull ghcr.io/alexochoac/app-presentation-builder:{version}
```

---

## Step 11 — Confirm

Report:
- Image: `ghcr.io/alexochoac/app-presentation-builder:{version}` pushed to ghcr.io ✅
- VPS `app-stack` updated — `builder` recreated as `app-{version}` ✅
- Live at `https://put-a-presentation.wbtm.io` — new version verified (sidebar `v{version}`) ✅
- Data + analytics intact (persisted on the VPS, never touched) ✅
- GitHub Release link ✅
- CHANGELOG.md updated ✅

---

## Analytics tracking note

The umami tracking script injected into published presentations uses `UMAMI_BASE_URL`
(`https://put-a-presentation-umami.wbtm.io`) + `UMAMI_WEBSITE_ID` (`69508062-...`).
These are stable on the VPS — published presentations keep tracking across releases.
Only change them if the umami host or website changes (then re-publish affected presentations).