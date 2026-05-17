---
title: App — Branding — Replace "P" placeholder with logo and icon
type: Feature
priority: M
status: done
area: other
---

Replaced the orange "P" gradient placeholder with the real brand assets from `builder/shared/brand/` (icon.svg + logo.svg) on the login screen and all sidebar pages (dashboard, builder-ui, slides, settings, layouts).

Login screen: icon and logo displayed side by side, centered, with the logo inverted for the dark background. Sidebar: logo rendered at 64px height (2× the original). Fixed an auth bug where brand images failed to load on the login page because `/shared` static files were served behind `requireAuth` — resolved by registering `/shared/brand` as a public route before the auth middleware in server.js.
