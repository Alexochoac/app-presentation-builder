---
description: Full release — build Docker image, push to ghcr.io, deploy standalone compose, update CHANGELOG, create GitHub Release.
---

# Release — App Presentation Builder

## Paths

- **App source:** `C:/Users/Alex/Alex-Projects/active/App-presentation-builder/builder`
- **Image registry:** `ghcr.io/alexochoac/app-presentation-builder`
- **Prod compose root:** `C:/Users/Alex/put-a-presentation/` ← each version lives in its own subfolder here
- **Project root:** `C:/Users/Alex/Alex-Projects/active/App-presentation-builder`

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
└── v1.1.0/
    ├── docker-compose.yml   ← copied from project root
    └── .env.prod            ← copied from builder/.env.prod
```

Each compose stack contains **3 services**:
- `builder` — the App Presentation Builder (port 3000)
- `umami` — Umami analytics (port 3003)
- `umami-db` — PostgreSQL for Umami

This means each version has its own isolated analytics data, its own volumes, and can run alongside other versions without conflict.

---

## Analytics Tracking — Local vs Public

The Umami tracking script injected into published presentations uses `UMAMI_BASE_URL` from `.env`.
In local dev this is `http://localhost:3003` — only accessible from your machine.
Presentations shared via GitHub Pages will have `localhost:3003` baked in and **external viewers will not be tracked**.

Before sharing presentations with real customers:
1. Deploy the Umami Docker container to a public VPS
2. Update `UMAMI_BASE_URL` in `.env.prod` to the public URL (e.g. `https://umami.yourdomain.com`)
3. Rebuild and release a new version so the published HTML gets the public script URL injected

---

## Step 1 — Version number

If the user passed a version (e.g. `/release v1.2.0`), use it.
If not, ask: **What version number? (e.g. `v1.1.0`)**
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

Create the version folder and copy in the compose files:

```bash
mkdir -p "C:/Users/Alex/put-a-presentation/{version}"
cp "C:/Users/Alex/Alex-Projects/active/App-presentation-builder/docker-compose.yml" \
   "C:/Users/Alex/put-a-presentation/{version}/docker-compose.yml"
cp "C:/Users/Alex/Alex-Projects/active/App-presentation-builder/builder/.env.prod" \
   "C:/Users/Alex/put-a-presentation/{version}/.env"
```

Then start the stack:

```bash
cd "C:/Users/Alex/put-a-presentation/{version}"
docker compose -p put-a-presentation-{version} up -d
```

The `-p` flag names the compose project so it doesn't collide with other versions.

---

## Step 6 — Update CHANGELOG.md

If not already done, add a new entry at the top of the release history:

```markdown
## [{version}] — {today's date}

### Added / Changed / Fixed
- {bullets from release notes}
```

---

## Step 7 — Update VERSIONS.md

Add a new row to the release history table (create the file if it doesn't exist):

```markdown
| {version} | {today's date} | {one-line summary} |
```

---

## Step 8 — Commit, tag, push

```bash
cd "C:/Users/Alex/Alex-Projects/active/App-presentation-builder"
git add CHANGELOG.md VERSIONS.md
git commit -m "chore: release {version}"
git tag {version}
git push origin master
git push origin {version}
```

---

## Step 9 — GitHub Release

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

## Step 10 — Confirm

Report:
- Image: `ghcr.io/alexochoac/app-presentation-builder:{version}` ✅
- Compose stack running at `C:/Users/Alex/put-a-presentation/{version}/` ✅
- GitHub Release link ✅
- CHANGELOG.md updated ✅
