---
title: Frontend — App Appearance theme (light/dark) not applied consistently across pages
type: Bug
priority: M
status: pending
area: frontend
---

## Symptom
Setting **Settings → App Appearance → Light** makes the Settings page light, but other
pages of the builder still render **dark** after navigating or restarting. Looks like the
toggle "does nothing," which is confusing.

Surfaced while verifying the Supabase migration (Phase 5 Slice 1). **Not a migration bug** —
the App Appearance theme is 100% client-side and was never part of settings.json / Postgres.

## Root cause
`setAppTheme(t)` in [builder/features/settings/index.html:160](../builder/features/settings/index.html#L160)
stores the choice in the **browser** only:
```js
document.documentElement.setAttribute('data-theme', t);  // paints THIS page
localStorage.setItem('pb-theme', t);                     // remembers in localStorage
```
Every page hardcodes `<html data-theme="dark">` and must re-apply the saved value on load with a
small inline bootstrap:
```js
(function () { var s = localStorage.getItem('pb-theme'); if (s) document.documentElement.setAttribute('data-theme', s); })();
```
That bootstrap is present on some pages but **missing on others**, so those stay dark.

| Page | Has `pb-theme` bootstrap? |
|---|---|
| features/settings/index.html | ✅ (line 156) |
| features/slides/index.html | ✅ (line 2648) |
| features/dashboard/index.html | ✅ (line 886) |
| features/layouts/index.html | ✅ (line 817) |
| features/builder-ui/index.html | ❌ missing → stays dark |
| features/builder-ui/preview.html | ❌ missing → stays dark |
| features/presentation-view/index.html | ❌ missing → stays dark |

## Fix (proposed)
Add the same `pb-theme` bootstrap `<script>` to the `<head>` of the three pages missing it
(builder-ui/index.html, builder-ui/preview.html, presentation-view/index.html) so every page
paints the saved theme on load. Put it as early as possible (before first paint) to avoid a
dark→light flash.

Better long-term: factor the bootstrap into one shared `<script src="/shared/app-theme.js">`
(or into `app-style.css`'s host page) included by every builder page, so a new page can't forget it.

## Notes / scope
- App Appearance is per-browser (localStorage), so it won't follow the user across devices. That's
  acceptable for now (single-user Phase 1). If it should become a per-user account preference later,
  that's a separate, larger change tied to auth (Phase 3) — do NOT fold it in here.
- `presentation-view` is the customer-facing published deck view — confirm whether the app-chrome
  theme should even apply there before changing it (published decks have their own deck theme).
