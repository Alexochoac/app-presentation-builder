---
title: Idea — Viewer — Auth — Gate access to static presentations on GitHub Pages
priority: normal
status: pending
area: viewer
---

Three viable options for adding email-based login to static presentations hosted on GitHub Pages:

**Option 1 — Third-party auth (Clerk, Magic.link):** Embed JS snippet, they handle email/OTP. Fastest, free tiers, but third-party dependency.

**Option 2 — n8n as backend:** Two webhooks — one sends OTP, one validates and returns a short-lived token. Full ownership, fits existing stack. Requires n8n always-on with a public URL.

**Option 3 — Cloudflare Pages:** Move hosting to Cloudflare, use their email access lists at the CDN level. Zero code, but less UX control.

**Recommendation:** Option 1 if speed matters. Option 2 if full control is priority and n8n is already running publicly.
