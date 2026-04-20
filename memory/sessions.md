# Sessions

## 2026-04-20 — Dashboard list/grid view toggle + customer logo on cards

### Accomplished
- Added list/grid view toggle to Finished Presentations panel header (☰ / ▪▪ icons, accent highlight on active)
- View preference persisted in `localStorage` (`pb-pres-view`)
- Grid cards show customer logo image (or initials fallback); logo fills card edge-to-edge (`object-fit:cover`)
- `customerLogoSrc` now captured and stored in the presentation record at save time (`server.js`)
- Fixed `slideCount` to only count visible slides (was counting all 14 including hidden ones)
- Slide count badge removed from card thumb — shown only in text metadata below

### Pending
- GitHub Pages publish button (`POST /api/presentations/:id/publish`)
- Design system refactor (CSS conflict, carried)
- Delete old `dashboard.css`
- `scripts/deploy.js`

---

## 2026-04-20 — Frozen presentation build system

### Accomplished
- `buildFrozenPresentation()` added to `server.js` — auto-runs on every `POST /api/presentations`
- Renders all visible slides using current library data, strips `data-builder-only` + `contenteditable`
- Output: `finished-presentations/[presId]/index.html` — fully self-contained (CSS + JS inlined)
- Shared asset pool: all images copied to `finished-presentations/shared/` — no duplication across presentations
- DELETE endpoint now also removes the frozen folder via `fs.rmSync`
- `/finished/` static route added; `/view/:id` redirects to frozen file if it exists
- `scripts/build.js` CLI — rebuild any/all presentations without the server running
- Stale frozen folders cleaned up (presentations deleted before fix was in place)

### Pending
- GitHub Pages publish button (`POST /api/presentations/:id/publish`)
- Design system refactor (CSS conflict, carried)
- Delete old `dashboard.css`
- `scripts/deploy.js`

---

## 2026-04-20 — Asset cleanup: slide-library consolidated into uploads

### Accomplished
- Audited `slide-library/` vs `builder/features/slides/uploads/` and `builder/shared/assets/`
- Confirmed all slide-referenced images were already present in `uploads/` and `shared/assets/`
- Copied 166 new images from `Slide Images/` and `General Slide Images/` into `uploads/`
- Deleted entire `slide-library/` folder (archive-only, not referenced by any app code)

### Pending
- GitHub Pages publish button (`POST /api/presentations/:id/publish`)
- Design system refactor (CSS conflict, carried)
- Delete old `dashboard.css`
- `scripts/build.js` / `scripts/deploy.js`

---
