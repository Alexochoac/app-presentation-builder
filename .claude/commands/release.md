---
description: Full release — build Docker image, push to ghcr.io, restart prod, update CHANGELOG, create GitHub Release.
---

# Release — App Presentation Builder

## Paths

- **App source:** `C:/Users/Alex/Alex-Projects/active/App-presentation-builder/builder`
- **Image registry:** `ghcr.io/alexochoac/app-presentation-builder`
- **Prod compose:** `C:/Users/Alex/n8n-projects/`
- **Project root:** `C:/Users/Alex/Alex-Projects/active/App-presentation-builder`

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

If the user passed a version (e.g. `/release v1.2`), use it.
If not, ask: **What version number? (e.g. `v1.2`)**
Must start with `v` and follow semver.

---

## Step 2 — Release notes

Ask: **What changed in this version?**
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

## Step 5 — Restart prod

```bash
cd C:/Users/Alex/n8n-projects
docker compose pull presentation-builder
docker compose up -d presentation-builder
```

---

## Step 6 — Update CHANGELOG.md

Add a new entry at the top of the release history table:

```markdown
## [{version}] — {today's date}

### Added / Changed / Fixed
- {bullets from release notes}
```

---

## Step 7 — Update VERSIONS.md

Add a new row to the release history table:

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
- Prod restarted at `https://put-a-presentation.wbtm.io` ✅
- GitHub Release link ✅
- CHANGELOG.md updated ✅
