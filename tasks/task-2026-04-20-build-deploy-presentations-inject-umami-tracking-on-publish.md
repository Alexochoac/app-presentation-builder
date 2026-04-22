---
title: Build/Deploy — Presentations — Umami — Inject tracking script and events on publish
priority: normal
status: pending
area: build-deploy
---

When a finished presentation is built/published, automatically inject the correct Umami analytics configuration into the output HTML. This means: (1) add the Umami script tag with the correct website_id (one per customer presentation), and (2) ensure each interactive slide component fires umami.track() calls using the naming convention: event name = slide identifier (e.g. 'slide-overview'), with properties: component (tab/carousel/image/etc), label (visible element name), and optional action (open/close/next/prev). See umami-guidelines.md in presentation-builder-softsolution/docs for the full tracking structure and naming conventions.

Tracking code from Umami:
<script defer src="https://umami.wbtm.io/script.js" data-website-id="306f3c58-2e8f-487c-b68f-e53f3b2a0b5d"></script>
Domain: softsolution-presentations.pages.dev
