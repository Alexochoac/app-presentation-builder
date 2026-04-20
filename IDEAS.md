# Ideas

## Auth / Login for Static HTML Presentations (GitHub Pages)
**Date:** 2026-04-14
**Context:** Exploring how to gate access to presentations hosted on GitHub Pages — static files with no backend.
**Idea:** Three viable options for adding email-based login (magic link / OTP) to static presentations:

**Option 1 — Third-party auth service (e.g. Clerk, Auth0, Magic.link)**
Embed their JS snippet in each presentation HTML. They handle email sending, code generation, and verification. You just check "is this user logged in?" before showing slides. Free tiers available. Fastest to implement. Dependency on a third party.

**Option 2 — n8n as the backend**
Build two webhooks in n8n: one receives email → validates domain → sends code; another receives code → returns a short-lived token. The HTML page calls these webhooks. Full ownership, fits existing stack. Requires n8n to be always-on with a public URL.

**Option 3 — Cloudflare Pages (hosting-layer protection)**
Move from GitHub Pages to Cloudflare Pages (free). Add email-based access lists at the CDN level — no code changes. Zero code, fast to set up. Less control over UX.

**Recommendation:** Option 1 (Magic.link or Clerk) if speed matters. Option 2 (n8n) if full control is the priority and n8n is already running with a public URL.
**Risks / Dependencies:** GitHub Pages has no native auth support — all options require either a third-party service, a live n8n instance, or a hosting change. Decision point: third-party convenience vs. full ownership via n8n.

---
