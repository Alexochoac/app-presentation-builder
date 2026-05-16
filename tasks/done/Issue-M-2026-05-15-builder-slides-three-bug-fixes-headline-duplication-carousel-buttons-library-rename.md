---
title: Builder — Slides — Fix 3 bugs — headline duplication, carousel button stacking, library rename not persisted
type: Issue
priority: M
status: done
area: builder
---

Three bugs identified and fixed in session 2026-05-15.

## 1. Company intro slide — "Quality inspection is all we do" appeared twice

**Root cause:** The `headline` edit key in `builder/data/slide-library.json` and `builder/data/translations.json` was saved with the entire outer `<h1>` element as its value (including builder highlight inline styles), instead of just the inner HTML. When the server injected this as `innerHTML` of a new `<h1>`, the browser parsed it as two separate headings.

**Fix:** Replaced both bad values with the clean inner content: `Quality inspection <span class="blue">is all we do</span>`.

---

## 2. Slide 7 (CulletScanner-Technology) — carousel images could not be deleted or reordered

**Root cause:** `carousel.js` `initOne()` unconditionally appended prev/next/+Image/Auto nav buttons on every initialization with no guard for existing ones. Because the `tabs` blob is saved with runtime HTML (including those injected buttons), each reload added another full set. Slide 7 had accumulated 4 sets, breaking click targets.

**Fix:** Added one cleanup line in `carousel.js` `initOne()` before appending buttons — mirrors the existing counter cleanup already at that location:
```js
el.querySelectorAll('.ls-carousel-prev, .ls-carousel-next, .ls-carousel-add').forEach(function (n) { n.remove(); });
```
This is self-healing: existing corrupted blobs are cleaned on next load, and the bug cannot recur.

---

## 3. Library slide rename not reflected in decks

**Root cause:** The `blur` handler on the library card name (both grid and list views in `features/slides/index.html`) updated `s.name` in the local JS array only — no API call was made. `GET /api/deck` reads `libSlide.name` from disk, so the rename was lost on every page load.

**Fix:**
- Added `PATCH /api/slide-library/:id` endpoint in `server.js` that writes the updated `name` field to `slide-library.json`.
- Wired both blur handlers (grid card and list row) to call this endpoint when the name changes.
