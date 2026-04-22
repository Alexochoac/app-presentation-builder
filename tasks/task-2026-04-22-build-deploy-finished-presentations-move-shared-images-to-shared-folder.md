---
title: Build & Deploy — Finished Presentations — Move shared images to shared folder
priority: high
status: pending
area: build-deploy
---

When presentations are published to GitHub Pages, some images are missing. All images used across presentations (slide assets, component images, etc.) should be copied into `finished-presentations/shared/` during the build step. Each individual presentation folder should only contain that presentation's unique assets — currently just the logo uploaded when creating the presentation. Update the build/publish script to enforce this separation so shared images are never missing on GitHub Pages.
