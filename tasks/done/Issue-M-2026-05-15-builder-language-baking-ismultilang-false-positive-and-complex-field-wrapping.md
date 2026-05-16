---
title: Builder — Save as Presentation — Language Baking — Fix isMultiLang false-positive and complex-field wrapping
type: Issue
priority: M
status: done
area: builder
---

Two bugs in the `bakeLanguageSpans` logic (server.js:3540-3582) cause visual/layout breakage in single-language presentations and break carousels in multi-language ones.

**Bug 3 — isMultiLang fires for English-only saves (server.js:3543):**
`isMultiLang = presLanguages.length > 0`. The client always includes the default language in the `languages` array (e.g. `['en']` when no extra languages are selected). So `presLanguages.length = 1` → isMultiLang = true → `bakeLanguageSpans` runs unnecessarily and wraps all `[data-edit]` text in `<span data-lang="en">` tags, causing CSS/layout issues.

Fix option A (server only): Change the check to:
```js
var isMultiLang = presLanguages.some(function(l) { return l !== presDefaultLang; });
```
Fix option B (client + server — cleaner): Change builder-ui/index.html ~line 1999 to NOT include the default language in the sent array:
```js
var allLangs = selectedLangs.filter(function(l) { return l !== defaultLang; });
// send: languages: allLangs  (additional languages only, default excluded)
```
and update the server to treat `presentation.languages` as "additional languages beyond default". Option B is semantically cleaner and also fixes the presentation record in presentations.json.

**Bug 4 — bakeLanguageSpans wraps complex HTML fields (server.js:3552-3581):**
The function wraps ALL `[data-edit]` elements (except `<img>` tags themselves) in `<span data-lang>` tags. But some fields contain structured HTML — e.g. `data-edit="carousel-track-html"` contains carousel item divs, and `data-edit="customer-logo"` contains img+label+input. Wrapping these in a single span breaks carousel JS and logo upload logic.

Fix: Add a skip list of non-translatable field keys inside `bakeLanguageSpans`:
```js
var NON_TRANSLATABLE = ['carousel-track-html', 'customer-logo', 'customer-logo-src'];
if (NON_TRANSLATABLE.indexOf(editKey) !== -1) return;
```
Alternatively, mark those elements with `data-translate="false"` in the template HTML and skip them in `bakeLanguageSpans`.

## Implementation Summary

**Problem:** Users reported carousels not navigating (images frozen on first slide), tabs not working, and language mixing in finished presentations. Investigation confirmed this was caused by `bakeLanguageSpans` in `buildFrozenPresentation` (server.js) running incorrectly and destructively modifying complex HTML fields.

**Root causes found:**

**Bug 3 — isMultiLang false-positive:**
`isMultiLang = presLanguages.length > 0` would fire even when the client sent `languages: ['en']` (only the default, no extra languages selected). This caused `bakeLanguageSpans` to run and wrap every `[data-edit]` text field in `<span data-lang="en">` even for single-language presentations — unnecessary extra markup that could affect CSS.

Investigated by examining `presentations.json`: presentation `00000001` had `languages: ["en","es"]` so isMultiLang was legitimately true in that case. But confirmed the check needed to only fire when there are languages BEYOND the default.

**Bug 4 — Complex HTML fields wrapped in `<span data-lang>` — primary cause of carousel/tabs breakage:**
`bakeLanguageSpans` iterated all `[data-edit]` elements and replaced their inner HTML with `<span data-lang="en">[original]</span><span data-lang="es" hidden>[duplicate]</span>`. This ran on `data-edit="carousel"` elements whose inner content is `<div class="ls-carousel-track">...</div>`.

The result in the frozen HTML:
```html
<div class="ls-carousel" data-edit="carousel">
  <span data-lang="en"><div class="ls-carousel-track">...</div></span>
  <span data-lang="es" hidden><div class="ls-carousel-track">...</div></span>
</div>
```

This broke the carousel in two ways: (1) the `<span>` is inline by default — a flex track with `height:100%` inside it cannot correctly resolve height against the `.ls-carousel` container, collapsing layout; (2) two duplicate carousel tracks exist, confusing `carousel.js`. Tabs (`data-edit="tabs"`) broke for the same reason.

Confirmed by inspecting `finished-presentations/00000001/index.html`: found `<span data-lang="en">` wrapping the `.ls-carousel-track` for slide 9 (Dimensions), while slide 8 (Surface/Defect Gallery) worked because its carousel uses a different pattern (`h77704536CarTrack` without `data-edit` on the outer container).

**Files changed:** `builder/server.js`

**Specific fixes (2 edits):**

1. **isMultiLang check** (was line 3576): changed from length-based to a semantic check:
```js
// Before:
var isMultiLang = presLanguages.length > 0;
// After:
var isMultiLang = presLanguages.some(function (l) { return l !== presDefaultLang; });
```

2. **bakeLanguageSpans skip guard** (after the `img` tag check, ~line 3592): added a structural check that skips any `[data-edit]` element whose children include block-level or form elements — this catches carousels (`<div>`), tabs (`<div>`), customer-logo (`<label>`, `<input>`) without requiring a hardcoded key list:
```js
if (el.children('div, ul, ol, table, label, input').length) return;
```

**To apply:** Restart the server and re-save the presentation. The frozen output will be rebuilt with correct language baking that only touches plain-text/inline fields.
