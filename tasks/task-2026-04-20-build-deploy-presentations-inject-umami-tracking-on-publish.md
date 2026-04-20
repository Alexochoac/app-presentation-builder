---
title: Build/Deploy — Presentations — Umami — Inject tracking script and events on publish
priority: normal
status: pending
area: build-deploy
---

When a finished presentation is built/published, automatically inject the correct Umami analytics configuration into the output HTML. This means: (1) add the Umami script tag with the correct website_id (one per customer presentation), and (2) ensure each interactive slide component fires umami.track() calls using the naming convention: event name = slide identifier (e.g. 'slide-overview'), with properties: component (tab/carousel/image/etc), label (visible element name), and optional action (open/close/next/prev). See umami-guidelines.md in presentation-builder-softsolution/docs for the full tracking structure and naming conventions.
