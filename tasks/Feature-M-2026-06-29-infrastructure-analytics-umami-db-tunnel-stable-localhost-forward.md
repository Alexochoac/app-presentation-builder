---
title: Infrastructure — Analytics — Umami DB Tunnel — Stable localhost target via host port + SSH LocalForward
type: Feature
priority: M
status: pending
area: other
---

Make the local dashboard read the VPS umami Postgres DB over a stable, non-fragile SSH tunnel.

**Problem**
Local testing currently needs a manual tunnel from Windows PowerShell:
`ssh -L 5434:<umami-db-container-IP>:5432 aoc-server`. The umami-db container IP
(e.g. `172.18.0.2`) is not stable — it changes whenever the container is recreated
on a `/release`, so the command breaks and the IP has to be re-discovered each time.

**Fix**
1. On the VPS, publish the umami-db container on the host loopback at a fixed port —
   `127.0.0.1:5432:5432` (in the umami compose `ports:`). This gives the tunnel a stable
   `localhost` target that never changes when the container is recreated.
2. In Windows `~/.ssh/config`, add a permanent `LocalForward` for the `aoc-server` host
   (e.g. `LocalForward 5434 127.0.0.1:5432`) so the tunnel comes up automatically with
   a normal `ssh aoc-server` — no IP to look up, no `-L` flag to type.

**Security constraint**
Keep the DB bound to localhost only — bind to `127.0.0.1` on the host, never `0.0.0.0`,
so it is never exposed publicly. The VPS firewall allows only port 22, so DB access stays
inside the SSH tunnel. VPS access + layout details live in project memory `project_vps_server.md`.
