# app-presentation-builder

A local web app for building customized HTML sales presentations. Sales reps log in, manage their slide deck, customize slides (text, logos, images) in a live builder UI, and publish to GitHub Pages.

## Live

Not yet deployed

## Structure

```
builder/          ← Express app (run this locally)
slides/           ← Master slide library (source of truth)
themes/           ← CSS per product/brand
customers/        ← Per-customer config & assets
scripts/          ← Build, validate, deploy automation
docs/             ← GitHub Pages output
```

## Stack

- Node.js + Express
- HTML / CSS / Vanilla JavaScript
- File-based storage (JSON configs, HTML files)

## Status

Active development — Phase 1 (local single-user tool)

## Setup

```bash
cd builder
npm install
cp .env.example .env   # fill in your values
node server.js
```

Then open: `http://localhost:3000`

---

*© 2026 Alex Ochoa. All rights reserved.*
