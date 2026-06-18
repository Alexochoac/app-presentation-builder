---
description: Full release — build Docker image, push to ghcr.io, deploy standalone compose, update CHANGELOG, create GitHub Release.
---

# Release — App Presentation Builder

## Paths

- **App source:** `C:/Users/Alex/Alex-Projects/active/App-presentation-builder/builder`
- **Image registry:** `ghcr.io/alexochoac/app-presentation-builder`
- **Prod compose root:** `C:/Users/Alex/put-a-presentation/` ← each version lives in its own subfolder here
- **Project root:** `C:/Users/Alex/Alex-Projects/active/App-presentation-builder`
- **Prod data (previous version):** `C:/Users/Alex/put-a-presentation/{previous-version}/`

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

## Deployment Model — Standalone Compose Per Version

Each version of Put.A.Presentation runs as its **own standalone Docker Compose project**, separate from n8n and from other versions.

**Folder structure on the host machine:**
```
C:/Users/Alex/put-a-presentation/
├── v1.1.0/
│   ├── docker-compose.yml
│   ├── .env
│   ├── data/
│   ├── uploads/
│   └── finished-presentations/
└── v1.2.0/          ← next release goes here
    └── ...
```

Each compose stack contains **3 services**:
- `builder` — the App Presentation Builder
- `umami` — Umami analytics
- `umami-db` — PostgreSQL for Umami

Each version has its own isolated data, analytics, and volumes.

### Port Assignment

Each version needs unique host ports — check what's already in use before assigning:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

For v1.1.0 the ports used were:
- Builder: **3005**
- Umami: **3004**
- Umami DB: **5434**

Assign the next free ports for each new version. Update `docker-compose.yml` in the version folder before starting the stack.

The compose project name must use hyphens only (no dots):
```bash
docker compose -p put-a-presentation-v1-1-0 up -d
```

---

## Patch Release — Update Builder Only (Same Stack)

Use this when you bump only the **PATCH** number and want to update the running builder container without touching umami, umami-db, or creating a new compose folder.

**Step 1 — Build and push:**
```bash
docker build \
  -t ghcr.io/alexochoac/app-presentation-builder:{version} \
  -t ghcr.io/alexochoac/app-presentation-builder:latest \
  "C:/Users/Alex/Alex-Projects/active/App-presentation-builder/builder"

docker push ghcr.io/alexochoac/app-presentation-builder:{version}
docker push ghcr.io/alexochoac/app-presentation-builder:latest
```

**Step 2 — Update the image tag in the compose file:**
```
C:/Users/Alex/put-a-presentation/{current-version}/docker-compose.yml
```
Change `image: ghcr.io/alexochoac/app-presentation-builder:{old}` → `:{new}`

**Step 3 — Update `.env` if new env vars were added:**
```
C:/Users/Alex/put-a-presentation/{current-version}/.env
```
Compare with `builder/.env.prod` — add any missing vars.

**Step 4 — Recreate only the builder container (stay on same network):**
```bash
cd "C:/Users/Alex/put-a-presentation/{current-version}"
docker compose -p put-a-presentation-{version-with-hyphens} up -d --no-deps --pull always builder
```

> **Critical:** always pass `-p put-a-presentation-{version-with-hyphens}` so the new builder joins the **existing** network where umami and umami-db already live. Without it, Docker creates a new network and `umami:3000` / `umami-db:5432` become unreachable.

**Step 5 — Verify:**
```bash
docker exec {builder-container} wget -qO- http://localhost:3000/api/settings
# Should return success:true with correct publicBaseUrl and umamiBaseUrl
```

---

## Required env vars (builder/.env.prod and prod .env)

| Var | Example | Purpose |
|-----|---------|---------|
| `BUILDER_USER` | `alexochoac` | Login username |
| `BUILDER_PASS` | `...` | Login password |
| `SESSION_SECRET` | random string | Session signing |
| `PUBLIC_BASE_URL` | `https://put-a-presentation.wbtm.io` | Public URL injected into presentation links |
| `UMAMI_BASE_URL` | `https://put-a-presentation-umami.wbtm.io` | Public URL for umami tracking script |
| `UMAMI_API_URL` | `http://umami:3000` | Internal Docker URL for server-side API calls |
| `UMAMI_USERNAME` | `admin` | Umami admin login |
| `UMAMI_PASSWORD` | `...` | Umami admin password |
| `UMAMI_WEBSITE_ID` | `69508062-...` | Umami website ID for this environment (overrides settings.json) |
| `UMAMI_DB_URL` | `postgresql://umami:umami@umami-db:5432/umami` | Direct Postgres connection for analytics queries |
| `GITHUB_TOKEN` | `ghp_...` | Token for git push to publish presentations |
| `REPO_ROOT` | `/repo` | Path to the repo root inside the container |

> `UMAMI_API_URL` should be `http://umami:3000` (Docker service name) inside containers.
> `UMAMI_DB_URL` should use `umami-db:5432` inside Docker, `localhost:5434` for local dev.
> `PUBLIC_BASE_URL` must be set — without it the server defaults to `http://localhost:3000` and public links break.
> `/api/settings` is intentionally public (no auth) so the login page and UI can read `publicBaseUrl` before the user logs in.

---

## Analytics Tracking — Local vs Public

The Umami tracking script injected into published presentations uses `UMAMI_BASE_URL` from `.env`.
In local dev this is `http://localhost:3003` — only accessible from your machine.
Presentations shared externally will have `localhost` baked in and **external viewers will not be tracked**.

Before sharing presentations with real customers:
1. Update `UMAMI_BASE_URL` in `.env.prod` to the public Umami URL (e.g. `https://umami.wbtm.io`)
2. Rebuild and release a new version so the published HTML gets the public script URL injected

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

## Step 3 — Build image

```bash
docker build \
  -t ghcr.io/alexochoac/app-presentation-builder:{version} \
  -t ghcr.io/alexochoac/app-presentation-builder:latest \
  "C:/Users/Alex/Alex-Projects/active/App-presentation-builder/builder"
```

Stop if it fails.

---

## Step 4 — Push to ghcr.io

```bash
docker push ghcr.io/alexochoac/app-presentation-builder:{version}
docker push ghcr.io/alexochoac/app-presentation-builder:latest
```

Stop if it fails.

---

## Step 5 — Deploy standalone compose

**5a — Check free ports:**
```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```
Pick 3 free ports for builder, umami, and umami-db.

**5b — Create version folder and copy config:**
```bash
mkdir -p "C:/Users/Alex/put-a-presentation/{version}"
cp "C:/Users/Alex/Alex-Projects/active/App-presentation-builder/docker-compose.yml" \
   "C:/Users/Alex/put-a-presentation/{version}/docker-compose.yml"
cp "C:/Users/Alex/Alex-Projects/active/App-presentation-builder/builder/.env.prod" \
   "C:/Users/Alex/put-a-presentation/{version}/.env"
```

**5c — Update ports in the copied docker-compose.yml** to the free ports identified in 5a.
Also change the `builder` service from `build: ./builder` to:
```yaml
image: ghcr.io/alexochoac/app-presentation-builder:{version}
```
And update volume paths to be relative (no hardcoded source paths).

**5d — Start the stack:**
```bash
cd "C:/Users/Alex/put-a-presentation/{version}"
docker compose -p put-a-presentation-{version-with-hyphens} up -d
```

---

## Step 6 — Copy prod data

Copy the previous version's data into the new version so it starts with all existing decks, slides, and presentations — not empty.

```bash
# Stop builder first
docker stop {new-builder-container-name}

# Clear any placeholder data
rm -rf "C:/Users/Alex/put-a-presentation/{version}/data"
rm -rf "C:/Users/Alex/put-a-presentation/{version}/uploads"
rm -rf "C:/Users/Alex/put-a-presentation/{version}/finished-presentations"

# Fresh copy from previous prod version
cp -r "C:/Users/Alex/put-a-presentation/{previous-version}/data" \
      "C:/Users/Alex/put-a-presentation/{version}/data"
cp -r "C:/Users/Alex/put-a-presentation/{previous-version}/uploads" \
      "C:/Users/Alex/put-a-presentation/{version}/uploads"
cp -r "C:/Users/Alex/put-a-presentation/{previous-version}/finished-presentations" \
      "C:/Users/Alex/put-a-presentation/{version}/finished-presentations"

# Restart builder
docker start {new-builder-container-name}
```

---

## Step 7 — Update Cloudflare tunnel route

The tunnel is named **n8n-mini-pc** in Cloudflare Zero Trust.

1. Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Networks → Tunnels**
2. Click **n8n-mini-pc** → **Published application routes**
3. Edit the `put-a-presentation.wbtm.io` row
4. Change the service to: `http://host.docker.internal:{new-builder-port}`
5. Save — goes live in ~30 seconds

Note: use `host.docker.internal` (not a container name) because the new stack is on a different Docker network than the tunnel.

---

## Step 7b — Scrub localhost URLs from data files

Image URLs saved during local development may have been stored as absolute `http://localhost:3000/...` paths instead of relative `/slides/uploads/...` paths. These break in production (mixed content errors over HTTPS).

Run this before building the image:

```bash
grep -rl "http://localhost:3000" builder/data/
```

If any files are found, strip the host prefix:

```bash
sed -i 's|http://localhost:3000/slides/uploads/|/slides/uploads/|g' builder/data/decks/default/translations.json builder/data/slide-library.json
# add any other files grep found
```

Verify zero matches remain:

```bash
grep -r "http://localhost:3000" builder/data/
```

Commit the cleaned files before building.

---

## Step 8 — Update CHANGELOG.md

If not already done, add a new entry at the top of the release history:

```markdown
## [{version}] — {today's date}

### Added / Changed / Fixed
- {bullets from release notes}
```

---

## Step 8b — Update sidebar version label

Update the `v{old}` string to `v{version}` in the `.sidebar-version` div across all 5 sidebar files:

- `builder/features/builder-ui/index.html`
- `builder/features/dashboard/index.html`
- `builder/features/layouts/index.html`
- `builder/features/settings/index.html`
- `builder/features/slides/index.html`

Each file has this pattern just below the Log out link — update the version number in all of them:

```html
<div class="sidebar-version">v{version}</div>
```

> **⚠️ Encoding — do NOT corrupt these files (this bit us in v1.4.0).**
> These HTML files are **UTF-8 without a BOM** and contain special characters (em-dashes `—`, box-drawing `──`, middots `·`, the `↻` glyph, emoji). Editing them with **PowerShell `Set-Content` / `Out-File` adds a UTF-8 BOM and re-encodes those characters into mojibake** (`—`→`â€"`, `──`→`â”€â”€`, `·`→`Â·`), which breaks fonts/characters in the UI. v1.4.0 shipped this corruption and v1.4.1 had to fix it.
>
> Rules:
> - Change **only** the version line — use a precise in-place edit, never a full rewrite of the file.
> - If you must use PowerShell, use `Set-Content -Encoding utf8NoBOM` (PowerShell 7); plain `Set-Content`/`Out-File` default to BOM/UTF-16. Prefer editing via the agent's Edit tool or `sed`, which preserve encoding.
> - **Verify after editing** — no BOM and no mojibake:
>   ```bash
>   # BOM check — must print nothing:
>   grep -rl $'\xef\xbb\xbf' builder/features/*/index.html
>   # mojibake check — must print nothing:
>   grep -rl 'â€\|â”€\|Â·' builder/features/*/index.html
>   ```

---

## Step 9 — Commit, tag, push

```bash
cd "C:/Users/Alex/Alex-Projects/active/App-presentation-builder"
git add CHANGELOG.md .claude/commands/release.md
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
- Image: `ghcr.io/alexochoac/app-presentation-builder:{version}` ✅
- Compose stack running at `C:/Users/Alex/put-a-presentation/{version}/` ✅
- Cloudflare route updated → `https://put-a-presentation.wbtm.io` ✅
- Prod data copied — decks, slides, presentations intact ✅
- GitHub Release link ✅
- CHANGELOG.md updated ✅
