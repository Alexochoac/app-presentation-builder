---
title: Build & Deploy — Per-User GitHub Repo — Publish flow with user-owned repository
priority: normal
status: pending
area: build-deploy
---

Each user should publish their presentations to their own GitHub repository, not the shared builder repo. The Publish button on the Dashboard triggers a build + push to that user's personal GitHub Pages repo.

Requires: connecting the user's GitHub account (OAuth or personal access token), storing the token securely per user, creating the repo on first publish if it doesn't exist, and pushing only changed files on subsequent publishes. The published URL would be `https://[github-username].github.io/[repo-name]/finished-presentations/[presentation-id]/`. Related to the existing publish flow task in `scripts-deploy-github-pages-build-publish-flow.md` which covers the folder structure and build logic.
