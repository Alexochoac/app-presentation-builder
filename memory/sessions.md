# Sessions

## 2026-04-12 (session 2) — Preview fixes, Create Presentation flow, scrollbar

### Accomplished
- **Slide Preview fixed**: added all component JS (`carousel.js`, `tabs.js`, `lightbox.js`, `list.js`, `table.js`) + `DOMContentLoaded` init to `/slides/deck-preview/:id` shell — slides now render correctly with tabs, carousels, and styles
- **Preview arrows**: prev/next buttons in Slide Preview panel header; shows `← N / 14 →` counter; subtitle updates to slide name on selection
- **Themed scrollbar**: `.deck-list-scroll` uses `--border-hov` / `--muted` CSS vars — adapts to dark and light mode automatically
- **Customer Settings removed from Builder**: no longer a static section in My Deck tab
- **Create Presentation flow**:
  - "Create Presentation" button in Slide Preview panel header
  - Modal with Customer Company (required), Contact Person, Contact Title
  - `POST /api/presentations` saves snapshot of current deck + customer info to `presentations.json`
  - Toast confirmation on success
- **`presentations.json`** created as new data store (`builder/data/presentations.json`)
- **Dashboard wired**: Finished Presentations list loads from `GET /api/presentations`; shows customer name, contact, slide count, date
- **First real presentation saved**: SoftSolution / General / Sales — 14 slides

### Pending
- **Presentation viewer**: click a finished presentation → read-only full-screen slideshow (`/view/:id`)
- **GitHub publish**: "Publish to GitHub Pages" button on finished presentation
- Add Slide modal (stub only)
- Slide-06 defect gallery JS verify
- Design system refactor (carried)
- `scripts/build.js` / `scripts/deploy.js`

---

## 2026-04-12 — UI Refactor: Dashboard / Builder / Slides separation

### Accomplished
- Dashboard cleaned to overview only + Finished Presentations skeleton
- Builder page (`/slides`): My Deck tab (2-col deck+preview) + Slide Manager tab
- Deck list: row style with drag-and-drop, eye toggle, remove button
- `GET /slides/deck-preview/:id` route: full HTML shell with style.css + component JS
- Nav synced across all pages: Dashboard | Builder | Settings
- `renderDeckList()` called on init so deck loads immediately

### Pending
- Finished Presentations: wire up real data + link to read-only preview
- Add Slide modal, Customer Settings wiring
- Slide-06 defect gallery JS
- Design system refactor, build/deploy scripts

---

## 2026-04-11 — Mobile carousel fixes across all slides

### Accomplished
- Root cause: `.slide-body` is `height:auto` on mobile — carousels collapse
- Fix pattern: `min-height:260px !important` on mobile, `height:100%` at desktop breakpoint
- All slides fixed (6, 7, 8, 9, 10, 11, 12, 14 + 2, 4, 5)
- Critical: all fixes live in `server.js` render functions only

### Pending
- Slide-06 defect gallery JS verify
- Design system refactor
- Build/deploy scripts
- Delete old `dashboard.css`
