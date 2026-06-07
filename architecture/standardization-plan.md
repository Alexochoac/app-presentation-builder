# Pipeline Standardization — Decisions & Plan

> ## ▶ RESUME HERE (last worked 2026-06-03)
> **Branch:** `docs/standardization` (NOT merged to master). Check out this branch before continuing.
> **Method (locked):** RECREATE alongside, in deck order — new template → new `lib-` slide → new
> `deck-rebuild` deck; clean up old stuff only at the very end. Full loop in "The Standard Slide-Rebuild Loop".
> **Done:** rulebook · validator · pre-commit gate · two-block theming (glassmorphism finish) · **CTA rebuilt**
> (pilot) · **#1 COVER** → `template01-cover` · **#2 COMPANY INTRO** → `template02-company` /
> `slide-02-company.html` / `lib-company-v2` / in `deck-rebuild` (tabs+carousel+map-as-uploadable-image,
> pillars/IQC as `.card`+modifier; verified live). Two shared changes landed: **(a)** `applyEditsToHtml` now
> re-applies inner edits over a blob (mirrors `applyEditsToBlob`; unit-tested across preview/deck/publish);
> **(b)** new validator rule **`logo-default`** (ERROR) + rulebook §8/§9 — logo-row must be brand-neutral
> (`data-edit="logo-row"` + product logo `/shared/brand/logo.svg` + `data-managed` so injected logos
> aren't auto-saved); CTA brought into compliance · **(c)** templates use **generic placeholder data only**
> (rulebook §9) — company + CTA genericized, real content moved to the deck's `deckEdits`; new validator
> `real-data` WARN (heuristic blocklist) flags real-customer terms in templates.
> **Builder-UX batch — COMPLETE (2026-06-03):** ✅ card **Details/lineage** area (all 4 card surfaces; the
> canonical per-card debug panel) · ✅ **dummy hero** placeholder + safety-net CSS · ✅ **universal gallery
> toggle** (flag on library slide; circled-"f" Features button on preview.html + builder canvas; injected in
> all 6 render sites). **Follow-up:** verify gallery *interactivity* in published output (injection wired,
> runtime unverified).
> **✅ Single render path — DONE (2026-06-07):** one `renderCartridge(resolved, {galleryEnabled, rawEdits,
> deck, editable})` (server.js ~4177) now backs all 6 cartridge-render sites (deck-preview, Builder Preview,
> publish ×2, library-preview, library-edit). A per-slide feature is wired ONCE and can't drift. Verified
> byte-identical before/after across deck-preview / Builder Preview / library-preview / library-edit (publish
> uses the same folded call, inspection-verified). Also made `PORT` env-driven (`process.env.PORT || 3000`).
> **✅ #3 WHY US — DONE (2026-06-07):** `template03-why-us` / `slide-03-why-us.html` / `lib-why-us` / in `deck-rebuild`.
> Problem-vs-benefit two-column compare (each column = one editable `.card` list blob, tier rows as `<li class="compare-tier">`,
> ✓/✕ markers via CSS); gallery is server-injected (flag on the lib slide), no gallery markup in the cartridge. Validator clean
> (0/0). Real LineScanner/Osprey content migrated into `deckEdits["deck-rebuild"]` (reshaped to the new classes); old
> `tpl-new-comparison` + `lib-comparison` kept as fallback. Verified live in the `deck-rebuild` context. **Dropped (follow-up if
> wanted):** the old "click to view chart" popup + 📈/💰 hint emojis — rebuilt lean.
> **Next:** continue the rebuild loop on **#4 Products Overview (`tpl-new-capability-matrix`)**. Roadmap below.
> **Pending verify:** publish `deck-rebuild` once and diff the frozen output (confirms the `applyEditsToHtml`
> change end-to-end in the publish path).
> **To run the app:** `cd builder && node server.js` → log in at localhost:3000. **deck-rebuild** holds the
> rebuilt slides; `default` is the untouched working deck. **Verify a render:** authenticated curl / headless.

**Status:** in progress · started 2026-05-30
**Why this exists:** Slides vary depending on how they were built, transformed, added to a deck, and
published. Each pipeline handoff trusts the previous stage and validates nothing. This document is the
single record of the rules we are standardizing on, and why.

---

## The Goal

A slide should pass through the whole pipeline — **template → slide → deck → published** — the *same way
every time*, independent of its components, layout, or features.

**Headline outcome:** *Applying any style to any slide or deck completely converts its look* — not just
its colors, but its full visual identity (blur, glow, borders, decoration). See the Two-Block Theme Model
below. Full style-conversion is the **reward** for standardizing: it only works when every slide shares one
skeleton and holds no bespoke styling of its own.

---

## The root cause

Five overlapping rule documents (`CLAUDE.md`, `template-anatomy.md`, `template-lifecycle.md`,
`skill-package/SKILL.md`, `skill-package/ANATOMY.md`) **contradict each other**. A validator can only
enforce unambiguous rules, so step one is resolving every contradiction into one answer, then collapsing
the five docs into a single source of truth.

---

## Decisions (resolved contradictions)

### ✅ #1 — Tracking calls: always `Track.*()`
Raw `umami.track()` is **forbidden** in slides/components. All tracking goes through the `Track` helper
(`builder/features/slides/components/tracker.js`). Matches what the codebase already does (all components +
~16 slides). Fix: update `CLAUDE.md` and the 3 legacy slides (slide-01-cover, slide-18, slide-26) + the
anatomy doc's own skeleton/checklist, which still show raw `umami.track()`.

### ✅ #2 — Event shape (consequence of #1)
Event name = `slide-<id>` (e.g. `slide-ls14`). Properties = `{ label: 'component-label-action' }` — one
joined string. `CLAUDE.md`'s `{ component, label, action }` three-field version is stale; delete it.

### ✅ #3 — Slide source of truth: HTML-file "cartridges"
One `.html` file per slide in `builder/features/slides/` **is** the source of truth. New JS string-builder
render functions are **forbidden**. The ~14 legacy slides whose structure is welded into `server.js`
(`renderCompanyLayout`, etc., dispatched by `renderLayoutToHtml` at server.js:3233) keep working and get
migrated to cartridges over time. Cartridges are authorable by the skill and checkable by a validator;
welded-in JS is neither. `template-lifecycle.md`'s claim that "server.js is the sole source of truth, .html
files are reference only" is false — at render time server.js does `applyEditsToHtml(readFileSync(file))`.

### ✅ #4 — ID convention: stage-name prefixes, number on template only
```
template[NN]-[name]   →   slide-[name]   →   deck-[name]
(fixed catalog,           (named by          (scoped to
 numbered, permanent)      purpose)           one deck)
```
- Number lives **only** on templates (a fixed catalog; numbers never reused).
- No number on slides (one template → many slides; the *name* disambiguates: `slide-cta-demo`,
  `slide-cta-pricing`).
- No number on deck slides (a number would read like *position* and lie after a reorder).
- Disambiguate collisions with **meaningful suffixes** (`-demo`, `-v2`), **never timestamps**.
- Library layer (`lib-*`) is already consistent. Fix the deck-slide ID generator, which currently emits
  timestamp soup (`deck-lib-1777096783950-1777096961176`).
- **Migration cost:** the old `ls`/`lib` token is also used as the CSS scope class (`.ls14-cta`) and the
  translation-key prefix (`ls14-cta.headline`), so renaming is a real find-replace across HTML/CSS/lang keys.

### ✅ #5 — CSS variable contract: the real ~25-var family list
The **theme files are the contract** (not the docs). The real list, in families:
- **Accent:** `--accent`, `--accent-mid`, `--accent-light`, `--accent-rgb`
- **Base:** `--bg`, `--text`, `--text-muted`
- **Cards:** `--card-bg`, `--card-border`, `--card-radius`, `--card-shadow`
- **Badges:** `--badge-bg`, `--badge-border`, `--badge-color`, `--badge-radius`
- **Logo:** `--logo-bg`, `--logo-border`, `--logo-radius`
- **Hero:** `--slide-hero-bg`, `--slide-hero-rgb`, `--hero-overlay-start`, `--hero-overlay-end`, `--hero-overlay-angle`
- **Fonts:** `--font-body`, `--font-heading`

Slides use **only** these variables and hardcode nothing (no hex/rgb, no fixed radii/shadows/fonts). The
anatomy doc undercounts (17) AND lists vars that don't exist (`--bg-card`, `--border`, `--nav-bg`); the
quick-ref undercounts worse (8). Both get replaced with a pointer to this list.
**To verify when building the validator:** confirm all 35 theme files define this identical set (a quick
cross-check was inconsistent — some themes may be missing variables, which would break slides only on those
themes).

### ✅ NEW — Two-Block Theme Model
A "style" has two halves. Today only the first is wired up.

1. **Palette block** — the ~25 CSS variables (#5). Already extracted into `themes/*.css`, applied to any
   slide automatically. ✅
2. **Finish block** — the signature visual DNA (blur, glow, slab borders, hand-drawn wobble, Memphis
   shapes, animations) that makes a style recognizable. **Still trapped inside `style-references/*.html`**
   and never reaches slides. ❌
   *Proof:* `glassmorphism.html` has 14 blur effects; `glassmorphism.css` has 0. `cyberpunk-neon.html` has
   26 glows; `cyberpunk-neon.css` has 0.

**Decision:** every theme becomes **Palette block + Finish block**. The Finish block is generic CSS that
targets the **shared slide skeleton classes** (`.slide-card`, `.badge`, `.slide-title`, …) so it restyles
every slide uniformly. The injection pipe already exists (server.js:111, `effectiveStyleCss`) — no new
machinery needed. This is only possible once slides are standardized (#3, #5, shared classes); that's why
full style-conversion is the payoff of standardization, not a separate feature.

---

### ✅ #6 — Deck model: isolated copies (Model A)
Content is **copied per deck and independent**; editing a slide in one deck never affects another.
Structure stays **shared & live via the template** (layout/component fixes still propagate everywhere).
This matches the user's intuition, anatomy Rule 5, AND actual code behavior.

**The smoking gun:** `resolveSlideEdits` (server.js:4457) does **no merge** — it returns *only*
`deckEdits[deckId]`, ignoring the base `edits`. So the system already stores a full independent copy per
deck; it is *not* the shared-base-plus-diffs (Model B) that `lifecycle.md` describes (that merge was never
built). The `edits` field is vestigial and `deckEdits.default` (server.js:6872) is a confusing fake "base"
— both are the source of the "default deck contamination" class of bug.

**Cleanup to make Model A honest:**
- "Add to deck" should be an explicit **content copy** (snapshot the master content into `deckEdits[deckId]`).
- `deckEdits[deckId]` is that deck's private content; editing it touches nothing else.
- Remove the vestigial `edits` / `deckEdits.default` ambiguity (library standalone editing writes the
  master copy directly; decks get snapshots).
- Coherent split: **structure = shared/live (template); content = isolated per deck.**

---

### ✅ Template change/delete guardrails
A library/deck slide stores only content edits + a **live pointer** (`templateId`); structure is fetched
from the template at render time (`applyEditsToHtml`, server.js:858, fills only slots that still exist —
confirmed it silently drops content for a removed/renamed slot). Rules:

- **Rule 1 — Slots are a contract (HARD BLOCK on breaking changes).** Safe changes (CSS, layout,
  placeholder text, **adding** slots, component behavior) propagate to all drafts freely. Removing/renaming
  a `data-edit` slot is **blocked when any slide holds content for that slot** (would orphan it). Allowed
  only when zero slides use the slot (orphans nothing) — this avoids permanent dead-slot cruft while
  keeping a zero-orphaning guarantee. Build on the existing template-update diff/review machinery
  (`templateUpdateIgnoredAt` field, server.js:6309; see
  `tasks/Feature-L-2026-05-10-template-update-notifications-diff-and-review-flow.md`).
- **Rule 2 — Guarded delete.** The delete path must count dependents (library slides with that
  `templateId` + their deck slides) and **archive by default** (existing slides keep working), hard-delete
  only when zero dependents. Current `DELETE /api/templates/:id` (server.js:6210) already keeps the HTML
  file; verify/extend it to count dependents.
- **Rule 3 — Published presentations are immune.** Frozen snapshots; template edits/deletes can't touch
  them. Republish to adopt changes. Already true — just document it.

---

## The Standard Slide-Rebuild Loop (locked 2026-06-01)

Rebuild **recreates** — never modifies the old template in place — so the one working deck (`default`,
SoftSolution/GlassQuality) keeps rendering untouched the whole time. Same steps, every slide, **in deck
order** (see the 16-slide roadmap below). The CTA pilot proved the steps; this version swaps "re-point the
old template" for "create a new template with a clean ID."

| Step | Action | Gate |
|------|--------|------|
| **A. Read** | Open the old template + its library/deck content + the CTA cartridge as reference (read-only). | — |
| **B. Build** | New cartridge `builder/features/slides/slide-NN-name.html` with a **new** clean template ID (`templateNN-name`), per rulebook §3 anatomy + §9 checklist. **Generic placeholder content only — never the real customer data** (that goes in the deck at step E/F). Old template untouched. | — |
| **C. Validate** | `node scripts/validate.js <file>` — must reach **0 errors** (warnings OK if intentional). | hard |
| **D. Register** | Add the new template to `templates.json` so the app sees it. | — |
| **E. Content** | New library slide from the new template. The **real** customer content (SoftSolution stats, products, contacts, etc.) goes into the **deck slide's `deckEdits`** here — not the template. | — |
| **F. Add to new deck** | Append to the **brand-new parallel deck** (NOT `default`). | — |
| **G. Verify** | Authenticated render — content + theme Finish injects, no errors. | — |

**Cleanup is deferred to the very end (step H, once):** after all 15 slides are rebuilt and the new deck is
verified, do one pass deleting the old templates, old library slides, old `default` deck, and the welded-in
JS twins in `server.js`. Old set stays as a working fallback until then.

### Roadmap (deck order — rebuild top to bottom)
1. New-Cover · `ls01` → **✅ `template01-cover`** · 2. Company Intro · `tpl-new-company` → **✅ `template02-company`** · 3. Why Us ·
`tpl-new-comparison` → **✅ `template03-why-us`** / `slide-03-why-us.html` / `lib-why-us` / in `deck-rebuild` (problem-vs-benefit
two-column compare, tier-grouped lists, ✓/✕ markers, gallery server-injected; real LineScanner content in deck; verified live) ·
4. Products Overview · `tpl-new-capability-matrix` · 5. LineScanner-Technology ·
`tpl-new-technology` · 6. Osprey-Technology · `tpl-new-technology` *(same template as #5)* ·
7. CulletScanner-Technology · `ls05-technology` · 8. Surface Types · `tpl-new-defect-gallery` ·
9. Dimensions · `tpl-new-carousel-cards` · 10. Screen Printing · `tpl-new-checklist-carousel` · 11. Logo
Check · `tpl-new-carousel-tags` · 12. Traceability · `tpl-new-tabs-carousel` · 13. Sensitivity ·
`tpl-new-carousel-steps` · 14. Installation · `tpl-new-full-carousel` · 15. Integrations ·
`tpl-new-cards-grid` · 16. Call to Action · `template14-cta` ✅ **done (pilot)**.

## Gallery: make it a universal per-slide feature (decided 2026-06-01)

Investigating the cover (#1) surfaced that the **gallery** is bespoke markup welded into the cartridge,
when it should be a **universal opt-in feature** like the server-injected logo-row / hero-bg.
- **How it works today:** logic is already a shared component (`features/slides/components/gallery.js`),
  activated by two hand-placed markup hooks (`data-ls-gallery-open` button + `data-ls-gallery`
  `data-edit="gallery-track"` store). The store's whole inner HTML saves as ONE blob under `gallery-track`
  (via `slide-carousel-save` → `/api/deck/slides/:id/edits`); inner spans persist transitively, so they
  must NOT carry their own `data-edit`.
- **Translation reality (important):** the gallery is **NOT translated** at publish. `bakeLanguageSpans`
  (server.js:4714) skips elements with block children, so the gallery store is skipped; `data-lang-key` is
  read by nothing (only *written* by the dead `lib/template-generator.js`). The deck's `stat-1-*` /
  `gallery-caption-1` translation entries are **orphans**. Published gallery = English-only. Decision: keep
  that parity for now (don't fix gallery i18n during rebuilds).
- **Decision:** gallery becomes a **server-injected, per-slide-toggled** feature (checkbox in builder UI;
  flag lives **per slide**, matching where `gallery-track` content already lives). `gallery-track`
  persistence is unchanged.
- **Sequencing:** (1) rebuild the cover **lean — no gallery markup in the cartridge**; (2) build the
  universal gallery toggle as its own task; the cover becomes its first consumer by flipping the flag.

## Builder-UX batch (captured 2026-06-01) — do as ONE task after the cover loop

Three builder-layer capabilities surfaced while rebuilding the cover. All are shared/builder features (not
per-slide bespoke) and naturally batch together. Sequence: finish the cover loop (E–G) first, then this batch.

1. ✅ **Universal gallery toggle** — DONE (2026-06-03). Slide-level feature, flag `galleryEnabled` on the
   **library slide** (option B — a property of the slide everywhere it's used). Server helper
   `injectGallery(html, enabled)` adds the original cover's grid-icon "Gallery" button + a starter
   `gallery-track` store into any slide; `Gallery.init` added to the render init blocks. Wired into **all 6
   cartridge-render sites** (see the "single render path" idea below — the drift this exposed). Toggle UI: a
   simple circled **"f"** Features button (lower-right) on **Builder Preview (preview.html)** and the builder
   canvas, opening a "Slide features" popover with a Gallery on/off switch → POST `/api/library/:id/features`
   → re-render. Routes: `GET/POST /api/library/:id/features`.
   **Bug found & fixed (2026-06-03):** the gallery opened in deck-preview/preview.html but did nothing via
   double-click → builder canvas, because that page calls `Gallery.init(document)` and `gallery.js` did
   `slideEl.closest('[data-slide]')` — **`document` has no `.closest()`**, so init threw and never wired the
   button. Fixed in `gallery.js` to derive the slide root from the store element (`store.closest('[data-slide]')
   || store.parentElement || …`), so it works whether passed the slide, a container, or `document`. Lesson:
   another instance of per-render-path inconsistency → reinforces the single-render-path idea below.
   **Published output (2026-06-03):** ✅ FIXED & VERIFIED. The baked page bundles all component JS (incl.
   gallery.js) and sets `PB_READONLY`, but its `initSlide()` never called `Gallery.init` — added it. Verified
   a published presentation opens the gallery as a read-only viewer (carousel + thumbnails, no edit buttons).
   NOTE: published presentations are frozen snapshots — **existing ones must be re-published / rebuilt-all**
   to gain the gallery; new publishes get it automatically.
   **Follow-up (minor, cosmetic):** `library-preview` (the tiny readonly card thumbnail) injects the gallery
   button but doesn't load gallery.js/init it — harmless, low priority.
2. ✅ **Card "Details" area** — DONE (2026-06-02). Read-only **ⓘ** button on every card, opening a lineage
   modal. **Standardized across all four card surfaces** with one shared modal shape (see "The Details /
   Debug Info Area" below). Shows lineage *to each layer's depth*:
   - **Deck slide thumbnail** (`builder-ui/index.html`): Template id+name → Library slide id → Deck slide id.
   - **Library slide card** (grid+list, `slides/index.html`): Template id+name → Library slide id.
   - **Template card** (grid+list, `slides/index.html`): Template id+name + cartridge file + category.
   Direct QA during the rebuild: confirm a card points to `template01-cover`, not old `ls01`.
   Server: `/api/deck` now also returns `templateId`+`templateName` per slide (needed for the thumbnail).
3. ✅ **Dummy hero background** — DONE (2026-06-02, partial-by-design). Shipped
   `builder/shared/brand/hero-placeholder.svg` (plain on-brand purple gradient — the user preferred a clean
   background over a glyph/label motif) + **safety-net CSS** in `features/slides/style.css`
   (`.hero-bg:not([src]), .hero-bg[src=""]` → placeholder) so an empty hero never shows a broken-image icon.
   **Deferred:** setting it as the **default `hero-bg` src** is left per-cartridge during each hero-slide
   rebuild (the CSS net already covers the universal case; `injectDeckBranding` server.js:~4119 overrides
   with the real deck image when present).

### The Details / Debug Info Area (the standard debugging surface) — added 2026-06-02

The ⓘ Details modal is now the **canonical place to surface per-card debug info**. It is standardized so
anything we add appears identically everywhere:
- **Shared modal shape** (both `builder-ui/index.html` and `slides/index.html`): solid box (`#111` dark /
  `#fff` light), blurred dark backdrop, 16px radius, drop-shadow, pill Close button. **Do not** use
  `var(--surface)` for the box — it's `rgba(255,255,255,0.05)` and renders see-through (the bug we fixed).
- **Shared row markup:** uppercase muted label · monospace id · optional muted sub-line. Helper:
  `showCardDetails(title, rows)` + `makeInfoBtn(onClick)` in `slides/index.html`; the thumbnail uses
  `showSlideDetails(slide)` in `builder-ui/index.html`.

**Candidate fields to add when debugging needs them** (each is just another `{label, id, sub}` row):
- `slideMode` / `data-slide-mode` (sequence vs build) — quick check it matches the template.
- **Validator status** — pass / N errors / N warnings for that template's cartridge (`scripts/validate.js`).
- **Template-update state** — is the live template newer than this slide's snapshot? (`templateUpdateIgnoredAt`,
  server.js:~6309) — flags "needs review".
- **Used-in decks** — for a library slide, which decks reference it (dependent count; ties into the guarded-
  delete rule).
- **Edited slots** — which `data-edit` keys hold content vs fall back to template placeholder.
- **Active style/theme** applied to the deck (palette ref + whether a Finish block exists for it).
- **Timestamps** — created / last-edited.
- **Gallery flag** — once the universal gallery toggle (item 1) lands, show on/off here.

Rule: new debug info goes in this Details area (consistent, discoverable), not scattered as one-off badges.

## ✅ DONE (2026-06-07) — Single render path: one `renderCartridge()` — captured 2026-06-03

**Surfaced while building the gallery toggle.** A per-slide feature appeared in deck preview but not in
Builder Preview (preview.html) — twice — because `server.js` has **6 independent cartridge-render sites**,
each duplicating `read file → applyEditsToHtml → injectDeckBranding`:

| server.js | path | consumed by |
|---|---|---|
| ~107  | `GET /slides/deck-preview/:id` | deck preview + deck thumbnails |
| ~3227 | `GET /slides/:deckSlideId.html` | **Builder Preview (preview.html)** |
| ~6815 | `GET /slides/library-edit/:id` | builder canvas ("Open in Builder") |
| ~6690 | `GET /slides/library-preview/:id` | library card previews |
| ~5009 | publish (visible slides) | published decks |
| ~5048 | publish (hidden slides) | published decks |

Every per-slide feature (gallery, hero-bg, logo-row, …) must be hand-wired into **all six** — miss one and
it "shows here but not there." This is the exact drift the whole initiative exists to kill, now at the
render layer.

**User's principle (locked intent):** **Builder Preview (preview.html) is the source of truth**; deck
preview, deck thumbnails, library previews, and published output must all be *reflections* of it — never
their own divergent renders.

**Proposed fix:** extract **one** `renderCartridge(resolved, { libSlide, deckConfig, edits, readonly })`
that does `read → injectGallery → applyEditsToHtml → (optional) injectDeckBranding` once; replace all 6 call
sites with a call to it. Then a feature is added in **one place** and can't diverge across surfaces.

**Why not done yet / decide first:** it touches every render path (regression risk). The 6 sites have subtle
variant args to fold into `opts` — readonly flag (`!readonly` / `true` / `false`), edit-wrapping
(`withBrandCredit(withLiveLogos())` vs `processedEdits` vs raw), and whether `injectDeckBranding` is applied
— plus publish does extra baking (strip builder-only, bake language spans, rewrite image paths) *after* the
render. Needs careful per-path testing. Relates to decision **#3** (cartridge = source of truth).

**✅ Done 2026-06-07 — exactly as proposed.** `renderCartridge(resolved, opts)` lives at server.js ~4177:
```js
function renderCartridge(resolved, opts) {            // opts: { galleryEnabled, rawEdits, deck, editable }
  var edits = opts.deck ? withBrandCredit(withLiveLogos(opts.rawEdits), opts.deck) : opts.rawEdits;
  var html  = injectGallery(fs.readFileSync(resolved.filePath, 'utf8'), opts.galleryEnabled);
  html = applyEditsToHtml(html, edits, opts.editable);
  if (opts.deck) html = injectDeckBranding(html, opts.deck);
  return html;
}
```
The two variant args that genuinely differ per surface stay at the call site: `rawEdits` (the
`resolveSlideEdits` result) and `editable` (deck-preview `!readonly`, Builder Preview/library-edit `true`,
publish/library-preview `false`). The edit-wrapping + branding are now uniform: applied iff `deck` is
truthy — which matches the prior `deckConfig ? wrap : raw` / `if (deckConfig) inject` logic at every site.
**Scope kept tight:** only the cartridge branch was touched; the legacy `canvas` branch (`renderLayoutToHtml`)
and publish's post-render baking were left as-is. **Verification:** byte-identical before/after across
deck-preview / Builder Preview / library-preview / library-edit (gallery-enabled cartridge `lib-cover` + a
second cartridge), via an isolated `PORT=3007` instance diffed against the running old-code server. Publish
(sites 3/4) uses the identical folded call — inspection-verified, not live-published (avoids a concurrent
write to the repo). Side change: `PORT` is now `process.env.PORT || 3000` (matches the existing `.env` entry;
enables isolated test instances).

## Next steps

1. ~~Decide #6 and the template-change/delete guardrail rules.~~ ✅ done
2. ~~**Consolidate** the five rule docs into one source of truth.~~ ✅ done — see
   [`slide-system-rulebook.md`](slide-system-rulebook.md). Deleted `template-anatomy.md`,
   `template-lifecycle.md`, `claude-skill-template-creator.md`; updated `CLAUDE.md` and the skill bundle to
   comply. No contradicting docs remain.
3. ~~**Define the shared slide skeleton**~~ ✅ done — rulebook §3 "The Standard Class Skeleton": 4 tiers
   (Frame / Primitives / Components / Variants), one base `.card`/`.kpi-card` + modifiers (not many separate
   classes), and the core rule (compose from standard classes; per-slide classes only for non-themed
   layout). These classes are the theme Finish-block hooks.
4. ~~Build the **validator** (`scripts/validate.js`)~~ ✅ done — `node scripts/validate.js [--summary]`.
   Validates the **16 registered templates** (by template ID, like the app; orphans/tests listed
   separately). **Corrected baseline (2026-05-31):** the ONLY real error-level issue is `slide-mode` (13/16 missing
   `data-slide`/`data-slide-mode`); the rest are warnings/info (bespoke-class 10/16, hardcoded-color 9/16,
   hardcoded-font 6/16). Two early "errors" were **validator bugs, not slide problems**: `data-lang-key` is
   dead markup (translation keys off `data-edit`), and `ghost-css-var` was a **false positive** —
   `--bg-card`/`--border`/`--nav-bg` etc. ARE defined (and bridged to `--card-bg`/`--card-border`) in
   `builder/features/slides/style.css` `:root`, the real contract. The validator now **derives its var
   allowlist from that `:root`** so it can't drift. Also surfaced: `ls06-surface`+`ls06-surface-copy` share
   one file; 15 orphan .html files (removed).
   **Theme-switching reality:** the palette is already wired — style.css `:root` bridges old↔new var names,
   so themes already re-skin cards/accents/fonts. The genuinely missing half is the **Finish block**
   (signature effects: blur/glow/etc.).
   **Gate wired (2026-05-31):** `scripts/hooks/pre-commit` validates only the *staged* slide cartridges
   (legacy backlog never blocks unrelated work); enabled via `git config core.hooksPath scripts/hooks`
   (run once per clone); bypass with `git commit --no-verify`. Tested: blocks a bad slide, passes clean/
   no-slide commits. TODO later: flip to a strict whole-set gate once the backlog is rebuilt; also gate the
   server template-save API.
5. **Extract the Finish blocks** from each `style-references/*.html` into its theme (~35 styles).
6. Migrate legacy welded-in JS slides → cartridges, and old IDs → the new convention, incrementally.
7. Implement Model-A copy-on-add + the template guardrails (build on the existing template-update diff flow).
