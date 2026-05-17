# Versions

All images are published to GitHub Container Registry:
`ghcr.io/alexochoac/app-presentation-builder`

## How to run a specific version

```bash
docker pull ghcr.io/alexochoac/app-presentation-builder:v1.0
docker run -p 3000:3000 ghcr.io/alexochoac/app-presentation-builder:v1.0
```

## How to deploy a new version

```bash
# 1. Build and tag
docker build -t ghcr.io/alexochoac/app-presentation-builder:vX.X -t ghcr.io/alexochoac/app-presentation-builder:latest ./builder

# 2. Push to GitHub
docker push ghcr.io/alexochoac/app-presentation-builder:vX.X
docker push ghcr.io/alexochoac/app-presentation-builder:latest

# 3. Restart prod
cd C:/Users/Alex/n8n-projects
docker compose pull presentation-builder
docker compose up -d presentation-builder
```

---

## Release history

| Version | Date | Notes |
|---------|------|-------|
| v1.0 | 2026-05-16 | Initial release — translation system, slide library, deck builder, finished presentations |
