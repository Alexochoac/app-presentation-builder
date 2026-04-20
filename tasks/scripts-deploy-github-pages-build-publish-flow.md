---
title: Scripts — Deploy — GitHub Pages — Build publish flow
priority: normal
status: pending
area: build-deploy
---

Push a finished presentation to a GitHub repository owned by the admin user. Each admin has one repo. The first publish creates it and sets up the folder structure:

```
presentations/
  [customer-name]/       ← unique assets (logo, uploads)
  shared/                ← assets shared across all presentations
```

The HTML output is unique per presentation (goes in the customer folder). Shared assets (slide images, icons) go in `shared/`. On subsequent publishes only changed files are pushed. The Publish button on the Dashboard triggers this flow.
