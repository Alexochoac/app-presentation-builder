# Sessions

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

## 2026-04-20 — Builder polish: Add Slide modal, cover gallery, viewer fixes, dashboard actions

### Accomplished
- **Add Slide modal** — replaced stub with real template picker (slide library browser)
- **Builder preview nav bar** — replaced floating back link with proper header bar (title, badge, counter, history.back)
- **Builder slide preview default** — cover slide shown automatically on load instead of empty state
- **Customer Settings wired up** — fields now drive deck personalization (name, title, contact)
- **Edit panel text truncation** — fixed text fields showing only half the content
- **Slide-06 defect gallery** — fixed JS selector bugs, gallery button click, add/delete image, visibility clipping
- **Cover slide gallery** — fixed overlay clipping, old prefix normalization, delete + move buttons
- **Edit presentation metadata** — inline edit for Name, Contact name, Position; `PUT /api/presentations/:id`
- **Delete presentation** — confirmation prompt + `DELETE /api/presentations/:id`
- **Viewer — cover slide gallery button** — removed `data-builder-only` from trigger + overlay
- **Viewer — carousel autoplay fix** — fixed timing bug in readonly iframe context

### Pending
- GitHub Pages publish button
- Design system refactor
- `scripts/build.js` / `scripts/deploy.js`
