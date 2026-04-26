---
title: Deploy — Dockerize Builder — Cloudflare Tunnel — Live internet publish for personal use + live test workflow
type: Feature
priority: H
status: pending
area: build-deploy
---

Dockerize the Node.js Express builder app and connect it to the existing Cloudflare Tunnel Docker setup so it can be accessed over the internet for personal use. This also becomes the live testing workflow: after building features locally, deploy to the Dockerized builder to test live before any final release.

## Goals

1. **Dockerize the builder** — write a `Dockerfile` for `builder/server.js`
2. **Add to existing docker-compose** — new service alongside existing apps
3. **Cloudflare Tunnel route** — point a subdomain (e.g. `decks.yourdomain.com`) to the builder service
4. **Persist data** — volume mount for `builder/data/` (JSON configs) and `builder/slides/uploads/` (images)
5. **Document the process** — write a step-by-step doc so it can become a reusable skill

## Live Test Workflow (intended use)

```
develop locally → push changes → rebuild Docker image → test at live URL
```

This replaces "deploy to GitHub Pages" as the way to verify features in a real browser/network environment.

## Documentation requirement

The Dockerize + tunnel process must be documented clearly enough to become a Claude Code skill (`dockerize-builder`) that can be re-run whenever the server changes significantly (new env vars, new ports, new volume needs, etc.).

## Notes

- App currently writes files to disk — volume mounts are required for persistence
- Cloudflare Tunnel handles ingress — no router ports need to be opened
- Cloudflare Access can be added later for auth (personal use only for now)
- Check `.env.example` and ensure all secrets are passed via environment variables, not hardcoded
