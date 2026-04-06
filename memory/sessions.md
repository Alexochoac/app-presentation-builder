# Sessions

## 2026-04-06 — Preview fix, mobile-first conversion, table fixes, settings page

### Accomplished
- **Slide preview in dashboard**: fixed iframe loading bare fragments (no CSS/JS) — added server-side shell route `GET /slides/preview/:id` that wraps fragment in full HTML page with `style.css`
- **Preview thumbnail sizing**: fixed scale computation using `requestAnimationFrame` then switched to measuring stable panel element; thumbnail now fills available panel width correctly
- **Slide visibility bug**: `.slide { opacity:0 }` default — shell now forces `.slide { opacity:1 !important }` so slide renders in preview without JS
- **Save handler bug**: all 3 save handlers in `preview.html` were constructing wrong filenames from carousel position index — fixed to derive from `SLIDES[current].file` directly
- **Mobile-first conversion**: converted ALL `@media (max-width)` to `@media (min-width)` across active slides, slide library, style mockups, and shared CSS files (3 parallel agents)
- **table.js fixes in slide-04**: added missing `[data-ls-col-restore]`, `[data-ls-row-restore]`, `[data-ls-add-row]` to both tables; fixed `ls4-col-label` → `ls-col-label`; fixed `ls4-dot` → `ls-dot` class names; removed dead inline JS (`ls4InitTable` etc.); fixed `text-align` on first column
- **Resizable first column**: added drag handle to `table.js` — applies to all `data-ls-table` tables, saves width on release
- **Column collapse fix**: proc-matrix colgroup had all columns saved as `ls-col-collapsed` — cleared saved state so all columns visible on load
- **Settings page**: built `/settings` with Theme toggle (dark/light, working), Company Profile, Presentation Defaults, Integrations, Account (all Coming Soon)
- **Dashboard nav**: Settings link now routes to `/settings`; Theme section removed from dashboard
- **Customer Settings**: renamed dashboard "Company Settings" → "Customer Settings" with customer-specific fields (company, contact person, title, logo)

### Pending
- Slides need true mobile-first layout audit — `style.css` shared components done, but each slide's inline `<style>` block needs per-slide responsive layout
- Delete old `dashboard.css` after confirming new style works
- Presentation view (read-only mode)
- Slide-06 defect selector names — static HTML
- `scripts/build.js` and `scripts/deploy.js`

---

## 2026-04-05 (session 2) — Dashboard redesign, style system, GitHub repo

### Accomplished
- Created GitHub repo `Alexochoac/app-presentation-builder` (public), pushed all code
- Added `README.md` with project description and setup instructions
- Improved `.gitignore` with OS/editor/log entries
- **Dashboard slide library redesign**: library now hides slides already in deck; empty state shows "Clone Existing" button
- **Two-way slide preview**: click slide title in deck → preview iframe (scaled thumbnail) in right panel; click library card → preview in left panel
- **Scaled thumbnail preview**: full 1280×720 slide rendered via CSS `scale()` to fit panel — no scroll, full slide visible
- **Lightbox on click**: clicking thumbnail opens fullscreen overlay (16:9, click outside or Escape to close)
- **Clone slide**: `POST /api/clone-slide` endpoint — copies HTML structure, resets editable text to placeholder values, clears images, adds to library + deck
- **Hidden slides**: show "Extras Menu" amber badge in deck list
- **Style system**: created `builder/shared/app-style.css` — Apple Keynote dark/light theme with CSS variables, replaces `dashboard.css`
- Dark/light theme toggle with `localStorage` persistence, applied via `data-theme` on `<html>`
- Server now serves `/shared/*` for shared app assets
- Built 4 dashboard style mockups for review
- Final style decision: Apple Keynote dark/light — theme toggle lives in Settings

### Pending
- Delete old `dashboard.css` after confirming new style works
- Test dashboard in browser with new style
- Presentation view (clean read-only mode)
- Slide-06 defect selector names — move to static HTML
- `scripts/build.js` and `scripts/deploy.js`

---

## 2026-04-05 — Dashboard, mobile responsiveness, full editability pass

### Accomplished
- Designed and built the **Dashboard** as post-login home (`/`): two-panel layout (deck manager + slide library), company settings placeholder, top nav with logout
- Created `builder/data/deck.json` and `builder/data/slide-library.json` as source of truth
- Added `GET/PUT /api/deck` and `GET /api/slide-library` endpoints to `server.js`
- Modified `preview.html` to fetch deck from API (replaces hardcoded `SLIDES` array)
- Full mobile audit of all 14 slides on iPhone 15 (390px)
- Full editability audit: added `data-edit` + `contenteditable` to every visible text element across all 14 slides
- Fixed broken edit bugs across slides 02, 03, 10, 14
- Fixed `list.js` stale chip save bug and self-healing restore area

### Pending
- Slide-06 defect selector names are JS-generated — need static HTML approach
- Image caption editing UI
- `scripts/build.js` and `scripts/deploy.js`
