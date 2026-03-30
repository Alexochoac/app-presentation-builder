# Sessions

## 2026-03-30 — Component standardization + new components

### Accomplished
- Migrated slides 07, 08, 09, 10, 11, 12 from custom per-slide carousel/lightbox (~200–300 lines each) to shared `.ls-carousel` + `data-zoom` components
- Migrated slide-04 scanner carousel from `ls4CarGo` custom dot-nav to `.ls-carousel`
- Fixed carousel save bug: `saveCarousel()` was saving `innerHTML` (missing track wrapper) — now saves `outerHTML` and strips runtime-injected captions
- Added lightbox → carousel zoom-sync: navigating in lightbox then closing jumps the carousel to match
- Created `tabs.js` component: declarative `.ls-tabs` with add/delete/rename tabs, each panel holds any content including `.ls-carousel`. Builder-only controls stripped in final output
- Registered `tabs.js` in `preview.html`
- Created `CONTEXT.md` and `TODO.md` for project

### Pending
- Test all migrated slides in browser (carousels, zoom, save/reload, zoom-sync on close)
- Migrate slide-10 `ls10-tabs` → `ls-tabs` component
- Migrate slides 02 and 04 tab systems → `ls-tabs` component
- IMAGES: every single image → `.ls-carousel`
- TABLES: reorderable, editable, add/delete, responsive
- LISTS: reorderable, editable, add/delete, responsive
- Image alt text editable → renames file for Umami tracking
- `scripts/build.js` and `scripts/deploy.js`
