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

---

## 2026-04-01 — list.js + table.js + full tab/list migration

### Accomplished
- Created `list.js` component (`ul[data-ls-list]`): add item, hide item (restorable via chip), delete (shift+click), drag reorder, dblclick-edit, auto-save on every change
- Created `table.js` component (`table[data-ls-table]`): row add/hide/delete/reorder/dblclick-edit, column hide/restore, dot cell cycling (filled→outline→empty), auto-save
- Migrated slide-03 (why) lists to `list.js` — removed ~130 lines of duplicate JS/CSS
- Migrated slide-05 (technology) lists to `list.js` — removed ~80 lines of duplicate CSS + disabled old `t5VcInitList`
- Migrated slide-05 custom `.t5-tabs` to `ls-tabs` (column-reverse so bar stays at bottom) — removed `t5Tab()` JS
- Migrated slide-02 custom `.ls2-tabs` to `ls-tabs` with carousel as default panel 0 (no active tab) + toggle-to-carousel click behaviour — removed `ls2Tab()` JS, removed ~40 lines CSS
- Added `data-zoom` to slide-02 world map image
- Migrated slide-04 tables to `table.js` — added `data-ls-table`, `data-ls-col-restore`, `data-ls-row-restore`, `data-ls-add-row` attrs; stripped 27 baked-in `ls4-row-hide-btn` + drag handles + 8 col-toggle buttons from HTML; disabled `ls4InitTable()`
- Registered `list.js` and `table.js` in `preview.html` (script tags + `List.init` / `LSTable.init` in `injectSlide`)
- Fixed content hidden behind nav bar: `.slide.content { padding-bottom: 70px !important }` in style.css
- Fixed dark-mode scrollbars in style.css

### Pending
- Test all slides in browser end-to-end
- Image alt text editable in builder (rename file for Umami tracking)
- `scripts/build.js` — assemble customer HTML, strip `data-builder-only`
- `scripts/deploy.js` — push to GitHub Pages
