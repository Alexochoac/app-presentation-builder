---
title: Infrastructure — Deploy Docker App to a VPS
type: Feature
priority: H
status: done
completed_at: 2026-06-29 14:59
area: other
---

**Progress (2026-06-29): ALL PHASES DONE — ready to close.** App `v1.4.7` is live
on the Hetzner VPS (`aoc-server`, 157.90.29.119) at its real domain
`https://put-a-presentation.wbtm.io` (cutover complete) behind a Cloudflare Tunnel.
Real prod data + umami analytics (2770 events) migrated. `/release` rewritten for
the VPS. Remaining follow-ups are SEPARATE tasks: personal-stack migration
(Feature-H-2026-06-29-...), decommission mini-PC, enable Hetzner 2FA.
Full details in project memory `project_vps_server.md`.

Move the app from running locally to running on a VPS (a rented server on the
internet), so it has a real public URL. Uses the existing Docker container — no
code changes required to ship this.

**This task is independent of the Supabase migration** and can be done first.
It pairs with the multi-user migration task:
[Idea-L-2026-05-17-infrastructure-database-plan-postgres-for-app.md](Idea-L-2026-05-17-infrastructure-database-plan-postgres-for-app.md).

**Decision: VPS instead of Railway/Render**
We chose a self-managed VPS over a platform-as-a-service (Railway/Render). More
control and predictable cost; in exchange we manage the server ourselves.

**✅ Phase 1 — Provision the server** (DONE)
- Provider: **Hetzner** (chosen over DigitalOcean for value; ~€9.93/mo, 2 vCPU / 8 GB / 80 GB)
- Ubuntu 26.04 LTS server `aoc-server`, backups on
- Key-only SSH, non-root sudo user `alex`, root login + password auth disabled
- Firewall (ufw): only port 22 open (80/443 stay closed — Cloudflare Tunnel makes them unnecessary)

**✅ Phase 2 — Install runtime** (DONE)
- Docker 29.6.1 + Compose v5.2.0 from Docker's official repo
- `alex` in `docker` group → runs docker without sudo; daemon enabled on boot

**✅ Phase 3 — Get the app running** (DONE)
- Pulled image `ghcr.io/alexochoac/app-presentation-builder:v1.4.7` (private; server authed via narrow `read:packages` PAT)
- Production `.env` + real data (data/uploads/finished-presentations) copied from mini-PC `put-a-presentation/v1.1.0/`
- `/home/alex/app-stack/docker-compose.yml` (project `put-a-presentation`, 3 services, containers `app-v1.4.7` / `umami-v1.4.7` / `umami-db-v1.4.7`); `docker compose up -d`; verified `/api/settings` 200

**✅ Phase 4 — Domain + HTTPS** (DONE — Cloudflare Tunnel, not a reverse proxy)
- New Cloudflare Tunnel `aoc-server` (cloudflared in `personal-stack/`), shared `edge` Docker network → routes to `builder:3000`
- Public hostname `put-a-presentation-app.wbtm.io` (interim test URL) → verified HTTP 200 + valid auto-HTTPS, ports stay closed, IP hidden
- Decision: **Cloudflare Tunnel instead of Caddy/nginx** — free HTTPS, no open ports, hides server IP
- Real cutover of `put-a-presentation.wbtm.io` (move route off the mini-PC `n8n-mini-pc` tunnel) deferred until validated

**✅ Phase 5 — Deploy workflow** (DONE — 2026-06-29)
- `/release` command rewritten for the VPS: build + push image, then `ssh aoc-server` → bump `builder` image tag in `app-stack/docker-compose.yml` → `docker compose pull builder && docker compose up -d builder`. No data copy, no tunnel change.
- Step order fixed: sidebar version update + localhost scrub now happen BEFORE the build (baked into image). Old mini-PC flow marked RETIRED in `.claude/commands/release.md`.

**Notes**
- The same VPS later runs the multi-user version — only the env vars and image change
- Supabase is cloud-hosted and shared across local + VPS; the VPS just needs the
  Supabase URL/keys in its production `.env`
- Need a domain name before Phase 4

---

## Implementation Summary

Moved the app from the home mini-PC to a dedicated Hetzner VPS with a real public
URL, then migrated analytics and rewrote the release flow — all without disrupting
the live customer site (parallel deploy, then a reversible cutover).

**Server (Phase 1–2):** Provisioned Hetzner CX (8 GB RAM, Ubuntu 26.04) as
`aoc-server` (157.90.29.119). Hardened: ed25519 key-only SSH, non-root sudo user
`alex`, root login + password auth disabled (`/etc/ssh/sshd_config.d/99-hardening.conf`),
`ufw` allowing only port 22. Installed Docker 29.6.1 + Compose v5.2.0 from Docker's
official repo; `alex` in the `docker` group. Two-folder layout: `app-stack/` +
`personal-stack/`.

**App deploy (Phase 3):** Authenticated the server to ghcr.io with a narrow
`read:packages` PAT, pulled `app-presentation-builder:v1.4.7`. Copied the live prod
`.env` + data (`data/`, 168 MB `uploads/`, 84 MB `finished-presentations/`) from the
mini-PC's `put-a-presentation/v1.1.0/` via scp. Wrote a clean production
`app-stack/docker-compose.yml` (project `put-a-presentation`; containers
`app-v1.4.7` / `umami-v1.4.7` / `umami-db-v1.4.7`; bind-mount volumes; no `/repo`
mount). Verified via an SSH tunnel.

**Domain + HTTPS (Phase 4):** Created Cloudflare Tunnel `aoc-server` (cloudflared in
`personal-stack/`, on a shared external `edge` Docker network) → routes to
`builder:3000`. Tested on `put-a-presentation-app.wbtm.io`, then cut over the real
`put-a-presentation.wbtm.io` from the mini-PC `n8n-mini-pc` tunnel to the VPS.
`PUBLIC_BASE_URL` kept as the real domain so existing `/public/<id>/` share links
resolve on the VPS. **Gotchas found:** editing a tunnel hostname's subdomain does NOT
create the DNS record (must delete + add fresh); Windows `ipconfig /flushdns` doesn't
clear an upstream NXDOMAIN negative cache (verify via `Resolve-DnsName -Server 1.1.1.1`
/ `curl --resolve`).

**Analytics migration:** `pg_dump`/restore of the umami DB (2,770 events, website
`69508062` "Put.A.Presentation") mini-PC → VPS; repointed
`put-a-presentation-umami.wbtm.io` → `umami:3000`. **Gotcha:** the VPS had pulled a
newer umami whose `20_add_heatmap` migration failed on the restored data (Prisma
P3009) — fixed by pinning the VPS umami image to the mini-PC's exact digest
(`sha256:e3f80c06…`), `DROP SCHEMA public CASCADE`, re-restore. Reconciled the
website ID: code uses `UMAMI_WEBSITE_ID` (.env=`69508062`) over a stale
`settings.json` value (`48fb959a`); aligned settings.json.

**Release workflow (Phase 5):** Rewrote `.claude/commands/release.md` for the VPS —
build + push, then `ssh aoc-server` → bump `builder` image tag → `docker compose pull
builder && docker compose up -d builder`. No data copy, no tunnel change. Fixed step
order so the sidebar-version bump + localhost scrub run before the build; marked the
old mini-PC flow RETIRED.

**Files/artifacts:** server `/home/alex/{app-stack,personal-stack}/`; laptop SSH
shortcut `~/.ssh/config` (`ssh aoc-server`) + `C:/Users/Alex/Server Hetzner/README.md`
cheat-sheet; updated `.claude/commands/release.md`; project memory
`project_vps_server.md`. **Follow-ups (separate tasks):** personal-stack migration
(`Feature-H-2026-06-29-…`), decommission the mini-PC app stack, enable 2FA on the
Hetzner account.
