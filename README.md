# App Presentation Builder

A web application for building customizable HTML presentations for customers.
Build slides, assemble decks, and publish finished presentations — all from a local web UI.

## Stack

- Node.js + Express
- HTML / CSS / Vanilla JavaScript
- File-based storage (JSON configs, HTML files)

## Status

Active development — Phase 1 (local single-user tool)

---

## Run with Docker (recommended)

### Option A — Pre-built image (no code needed)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. Create a `.env` file:

```env
BUILDER_USER=admin
BUILDER_PASS=your-password
SESSION_SECRET=a-long-random-string
OPENROUTER_API_KEY=your-key
```

3. Run:

```bash
docker run -p 3000:3000 --env-file .env ghcr.io/alexochoac/app-presentation-builder:latest
```

4. Open `http://localhost:3000`

---

### Option B — From source

1. Clone the repo:

```bash
git clone https://github.com/Alexochoac/app-presentation-builder.git
cd app-presentation-builder
```

2. Copy and fill in credentials:

```bash
cp builder/.env.example builder/.env
```

3. Start:

```bash
docker compose up --build
```

4. Open `http://localhost:3000`

---

## Run without Docker (development)

```bash
cd builder
npm install
cp .env.example .env
node server.js
```

Open `http://localhost:3000`

---

## Available versions

See [VERSIONS.md](VERSIONS.md) for all published images and how to run a specific version.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

---

*© 2026 Alex Ochoa. All rights reserved.*
