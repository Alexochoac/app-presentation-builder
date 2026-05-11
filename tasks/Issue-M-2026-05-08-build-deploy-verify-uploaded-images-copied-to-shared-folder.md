---
title: Build/Deploy — Finished Presentation — Verify all uploaded images are copied to shared folder
type: Issue
priority: M
status: pending
area: build-deploy
---

User reported some images missing from newly created finished presentations. Current check on presentation 00000001 shows 0 missing images, but earlier broken builds (before language-baking fixes) may have left gaps.

Verify and harden the image copy logic in buildFrozenPresentation:
1. Confirm that images embedded inside carousel, tabs, and gallery edit HTML blobs (stored as raw HTML in libSlide.edits) are all resolved and copied by rewriteImagePaths
2. Check for images referenced via data-src (lazy loading) which rewriteImagePaths currently skips — extend to handle data-src if any templates use it
3. Check images inside the non-default language spans baked from translations.json — these may contain http://localhost:3000/... absolute URLs with encoded spaces that need to resolve correctly
4. After any fix, re-publish all presentations and verify shared folder completeness
