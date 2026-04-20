---
title: Build/Deploy — Presentations — Snapshot — Generate isolated output file per presentation
priority: high
status: pending
area: build-deploy
---

Each time a presentation is published/built, it must produce a completely independent, frozen output file — with its own logo, slide sequence, content, tab defaults, and edition settings — stored separately per presentation (e.g. docs/[presentation-id]/index.html). Once generated, that file must not be modified by future builder changes; editing the builder should only affect new builds, never previously published presentations.
