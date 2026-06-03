---
title: Idea — Viewer — Auth — Email-based access gate for presentations (Phase 2)
priority: normal
status: pending
area: viewer
phase: 2
---

## Status (2026-05-30 update)
Basic password protection for finished presentations is already shipped (single shared password per presentation, baked into the frozen output). This idea is specifically about **email-based, per-viewer access control** — knowing who accessed the presentation, not just that someone had the password.

This is a Phase 2 feature. Requires a backend to issue and validate tokens.

## Options

**Option 1 — Third-party auth (Clerk, Magic.link):** Embed JS snippet, they handle email/OTP. Fastest, free tiers, but third-party dependency.

**Option 2 — n8n as backend:** Two webhooks — one sends OTP, one validates and returns a short-lived token. Full ownership, fits existing stack. Requires n8n always-on with a public URL.

**Option 3 — Cloudflare Pages:** Move hosting from GitHub Pages to Cloudflare Pages, use their email access lists at the CDN level. Zero code, but less UX control and requires migration.

**Recommendation:** Option 2 (n8n) if n8n is already running publicly, since it integrates with the "Track shares / Shared To" feature and gives full control over who can access.
