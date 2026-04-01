# Sessions

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

---

## 2026-04-01 (session 2) — Image management + compare mode + slide-06 migration

### Accomplished
- Fixed slide-04 proc table "Add row" button (wrong `data-table="proc"` attr → `data-ls-add-row`)
- Fixed lightbox zoom freeze: MutationObserver caused infinite loop on `classList.remove` — replaced with direct removal in `close()`
- Fixed `data-zoom-init` persisting to saved HTML blocking re-wiring on reload — switched to JS property `el._lsZoomInit`
- Fixed slide-04 capability carousel missing `data-edit` (saves were silently failing)
- Fixed duplicate `.ls-carousel-counter` divs accumulating on every save — `saveCarousel` now strips them before saving
- Added `data-zoom` attribute to newly uploaded carousel images so they appear in lightbox gallery
- Added `+ Add Image` button inside lightbox (shown when carousel triggered the open)
- Added carousel image reorder: ◀▶ buttons on hover per slide, saves to disk
- Added autoplay toggle button per carousel: cycles Off → 3s → 5s → 10s → 15s
- Added `ensureMoveButtons` with per-slide mouseenter show/hide for move buttons
- Added full compare mode to carousel: Split (50/50 static) and Reveal (draggable handle) — `⇔ Compare` button on any single slide, per-side replace, editable labels, exit compare
- Added `data-no-caption` attribute to suppress auto-caption overlay on carousels with external labels (slide-05 vc-cards)
- Moved carousel counter to bottom-right corner
- Created `.claude/settings.json` with allow list for Edit, Write, Read, Bash(node/npm/mkdir/cat/ls/tail) so background agents don't need per-tool approval
- Migrated slide-06 from custom JS DEFECTS array + custom stage/viewport/arrows to 11 standard `ls-carousel` divs (one per defect category), compare slides use `ls-compare`, selector buttons show/hide the right carousel — removed ~200 lines custom JS/CSS

### Pending
- Audit slides 07–14 for standalone `<img>` tags that need converting to `ls-carousel`
- Test slide-06 compare slides (Split/Reveal) in browser
- Test all slides end-to-end
- Image alt text editable in builder (rename file for Umami tracking)
- `scripts/build.js` — assemble customer HTML, strip `data-builder-only`
- `scripts/deploy.js` — push to GitHub Pages
