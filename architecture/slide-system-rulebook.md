# Slide System Rulebook

**This is the single source of truth for how slides work** — anatomy, lifecycle, IDs, styling, tracking,
the deck model, and template guardrails. Read this before creating or modifying any slide, template, or
theme.

It supersedes the older `template-anatomy.md` and `template-lifecycle.md` (now deleted and consolidated
here). The skill bundle's `skill-package/ANATOMY.md` is a derived quick-reference kept in sync with this
file. For *why* each rule was chosen and the migration status, see
[`standardization-plan.md`](standardization-plan.md).

> **Rule of precedence:** if any other document, comment, or skill disagrees with this file, **this file
> wins.** Fix the other document.

---

## 1. The Lifecycle — Template → Slide → Deck → Published

| Stage | Analogy | Where it lives | What it is |
|---|---|---|---|
| **Template** | Cookie cutter | `builder/data/templates.json` + an `.html` file in `builder/features/slides/` | A blank structural slide: layout + the 5 anatomy layers + placeholder content. Never holds real content. |
| **Slide** (library) | Cookie dough | `builder/data/slide-library.json` | A template filled with real content. Reusable master copy. |
| **Deck slide** | Decorated cookie | a deck's `deck.json` (order/visibility) + the slide's per-deck content copy | A slide placed in one deck, with its own **independent copy** of the content (see §5). |
| **Published** | Packaged cookie | `finished-presentations/[presId]/index.html` | A frozen, self-contained HTML file sent to the customer. No server needed. |

### Render chain (how a slide is drawn)
```
deck.json  →  librarySlideId  →  slide-library.json  →  templateId  →  the .html cartridge
                                       ↓
                          merge the deck's content copy
                                       ↓
                  applyEditsToHtml(readFileSync(cartridge), edits)  →  rendered slide
```

### Live vs frozen (critical)
- **Drafts** (library/deck slides in the builder) hold a **live pointer** to the template. Structure
  changes propagate to them automatically.
- **Published presentations** are **frozen snapshots** — immune to later template edits or deletes.
  Republish to adopt changes.

---

## 2. The Slide is an HTML "Cartridge" (source of truth)

**One `.html` file per slide in `builder/features/slides/` is the single source of truth for that slide's
structure.** It is self-contained: markup + a scoped `<style>` + a scoped `<script>`.

- ❌ **Do not** build slide structure as hardcoded JavaScript string-builders in `server.js`. (The ~14
  legacy slides that still do this are tech debt being migrated to cartridges — do not add more.)
- ✅ A new slide = drop in a new `.html` cartridge. Importing, creating, and editing a slide all mean
  working with one file.

---

## 3. Anatomy — the 5 layers every cartridge must implement

### Layer 1 — Style-Ready (CSS variables only, no hardcoding)
All visual properties use CSS variables. **Never** hardcode colors, fonts, radii, or shadows that belong to
a theme.

**The contract = the `:root` of `builder/features/slides/style.css`** (the single source of truth — the
validator derives its allowlist directly from it). It defines two kinds of variable:

- **Theme-settable** (overridden when a theme is applied → these change on theme switch):
  `--accent` `--accent-mid` `--accent-light` `--accent-rgb` · `--bg` `--text` `--text-muted` ·
  `--card-bg` `--card-border` `--card-radius` `--card-shadow` · `--badge-*` · `--logo-*` ·
  `--slide-hero-bg` `--slide-hero-rgb` `--hero-overlay-*` · `--font-body` `--font-heading`
- **Structural / bridged** (defined once, constant across themes): `--bg-card`→`var(--card-bg)` and
  `--border`→`var(--card-border)` (legacy aliases, still valid), `--bg-card-hover` `--border-hover`
  `--nav-bg` `--nav-border` `--dot-inactive` `--counter` `--orb-a` `--orb-b`.

Rules:
- No hardcoded hex/rgb. For accent tints use `rgba(var(--accent-rgb), .10)`, never `rgba(245,166,35,.10)`.
- Use any variable defined in that `:root`. (Both `--card-bg` and the bridged `--bg-card` are valid — they
  resolve to the same value. Prefer the `--card-*` theme names in new work.)
- Don't set `font-family` directly — use `var(--font-body)` / `var(--font-heading)`.
- The `<style>` block is scoped to the slide's class — no global pollution.
- **Responsive, mobile-first.** Slides reflow to fit any screen (they are *not* a fixed scaled canvas) —
  published decks are often opened on a phone. Base styles target **mobile** (the default, no media query);
  desktop refinements go in **`@media (min-width: 769px)`**. Do **not** use desktop-first `@media (max-width: …)`
  overrides — pick one mental model. *Recommended (not required):* use `clamp()` / `vw` for fluid type and
  spacing so the slide flexes smoothly and needs fewer breakpoints.

### Layer 2 — Translation-Ready
Translation keys off **`data-edit`** — the build wraps every `[data-edit]` text element in per-language
`<span data-lang>` siblings (`bakeLanguageSpans`, server.js). So **any editable text carrying `data-edit`
is automatically translation-ready** — there is nothing extra to add.

Do **not** add `data-lang-key`: the app never reads it (verified against server.js), so it is dead markup.
The only requirement is that user-visible text which should be translatable is an editable node with
`data-edit`.

### Layer 3 — Tracking-Ready (`Track.*()` only)
All tracking goes through the `Track` helper (`builder/features/slides/components/tracker.js`).
**Never call `umami.track()` directly.**

- **Event name:** `slide-<id>` (e.g. `slide-template14-cta`)
- **Properties:** `{ label: '<component>-<label>-<action>' }` — one joined string.

```js
Track.click(slideId, 'whatsapp')        // → { label: 'button-whatsapp-click' }
Track.tab(slideId, 'Overview')          // → { label: 'tab-Overview-click' }
Track.carousel(slideId, 'next', 'Belt') // → { label: 'carousel-Belt-next' }
Track.expand(slideId, 'Archive')        // → { label: 'toggle-Archive-expand' }
Track.zoom(slideId, 'Camera')           // → { label: 'image-Camera-open' }
var slideId = Track.slideId(el);        // resolve id from any element
```
Wire tracking inside the slide's scoped `<script>` IIFE — written once, fires in every presentation.

### Layer 4 — Slide Mode
```html
<div class="slide" data-slide="[id]" data-slide-mode="sequence">
```
- `sequence` — appears in the normal flow (default).
- `embedded` — hidden until a trigger button (`<button data-trigger-slide="[target-id]">`) is clicked.

### Layer 5 — Data Feed (only if the slide receives live data)
```html
<span data-feed="revenue-q1" data-feed-type="number">0</span>
<p    data-feed="summary"    data-feed-type="text">Placeholder</p>
<div  data-feed="chart-data" data-feed-type="chart"></div>
```
Omit entirely if the slide has no live-data needs.

### The Standard Class Skeleton

Every cartridge is built from a **shared vocabulary of standard classes**. These classes are also the
**hooks that theme Finish blocks target** (§6) — so a slide built only from them gets fully re-skinned by
any theme, for free.

**Four tiers:**

| Tier | Purpose | Standard classes |
|---|---|---|
| **1. Frame** *(required, every slide)* | the slide shell | `.slide` · `.slide-logo-row` · `.slide-layout` · `.slide-head` · `.section-label` · `.slide-title` · `.slide-subtitle` · `.divider` · `.slide-body` |
| **2. Primitives** *(compose content from these)* | reusable building blocks | `.card` (`.card-icon` / `.card-title` / `.card-desc`) · `.cards-row` · `.kpi-card` (`.kpi-value` / `.kpi-label`) · `.feature-list` / `.feature-item` · `.cta-box` / `.cta-steps` · `.badge` |
| **3. Components** *(interactive, markup owned by component JS)* | carousel / tabs / lightbox | `.ls-carousel*` · `.ls-tabs*` · `.lb-*` |
| **4. Variants** *(opt-in layouts)* | hero / two-column | `.hero-bg` / `.hero-content` / `.hero-overlay` · `.slide-split` / `.slide-split-img` / `.slide-split-text` |

**One base + modifiers (not many separate classes).** A surface that's "a kind of card" uses the base
`.card` plus a small modifier — never its own standalone class. The base carries the shared look
(background, border, radius, shadow); the modifier only adds the difference. So a theme styles `.card`
*once* and every flavor inherits it:

```html
<div class="card">                  …</div>   <!-- plain card             -->
<div class="card card-kpi">         …</div>   <!-- card, stat/metric flavor -->
<div class="card card-integration"> …</div>   <!-- card, logo-grid flavor   -->
```
Canonical choices: one stat primitive is **`.kpi-card`** (retire `.stat-*`); the old `.int-card` /
`.col-card` become `.card.card-integration` / `.card.card-column`.

**The core rule:**

> Slides **compose from the standard classes above.** Per-slide `template[NN]-*` classes are allowed
> **only for unique positioning/layout a theme never needs to touch** — never for surfaces, colors, cards,
> or decoration. Anything a theme should be able to restyle must wear a standard class.

This rule is what guarantees full style-conversion: every styleable surface wears a name the theme knows,
so the theme's Finish block can't miss one. Bespoke per-slide classes (`.ls4-shaded`, `.ls27-car`, …) are
the legacy variance being migrated away.

### The Responsive Model — `pb-responsive` (required on every content cartridge)

Every rebuilt **content** cartridge's root carries the shared class `pb-responsive` (e.g.
`class="slide content templateNN-name pb-responsive"`). It is defined once in `features/slides/style.css`
and is the single source of responsive behavior — **do not re-implement it per slide.**

The model — **the slide is the *sole* scroll container:**
- Content **stacks and the whole slide scrolls** (like mobile) at every size; **no inner element gets a
  fixed height or its own overflow.** A scrollbar appears only when content genuinely overflows, and
  content is **never clipped or hidden**.
- `justify-content: safe center` — centers content when it fits, top-aligns + scrolls when it doesn't
  (plain `center` on a scroll container clips the **top** and makes it unreachable — never use it).
- Columns/grids go multi-column **by available width, not a device breakpoint**:
  `grid-template-columns: repeat(auto-fit, minmax(<min>px, 1fr))` (stack when each column would be < min).
- Spacing + corner chrome (logos / credit) scale with `clamp()`, not stepped breakpoints. The shared block
  reserves ~72px top clearance so the centered header never rides under the corner logo/credit band.
- The active slide uses `transform: none` (not `scale(1)`) so descendant `position:fixed` controls pin to
  the **viewport** (a transformed ancestor traps `fixed` to itself and it scrolls with content).

**Therefore, in a cartridge's scoped `<style>`: never set `overflow`, fixed `height`/`height:100%`,
`flex:1; min-height:0`, `justify-content:center`, or `@media` breakpoints to re-create a fixed-height
layout.** Size inner content to its own content; let the slide scroll. Per-slide CSS is positional only.

*(Hero/cover slides (`.slide.hero`) are full-bleed and do not scroll — they are not `pb-responsive`.
Legacy non-`pb-responsive` slides keep the old fixed-height model until they are rebuilt.)*

---

## 4. IDs & Naming

Each lifecycle stage gets a readable, predictable ID. **Use meaningful suffixes for collisions, never
timestamps.**

| Thing | Format | Example | Notes |
|---|---|---|---|
| **Template** (+ the slide's `data-slide` and CSS scope class) | `template[NN]-[name]` | `template14-cta` | `NN` is a unique, never-reused number. |
| **Library slide** | `lib-[name]` | `lib-cta`, `lib-cover` | No number — one template → many slides; the *name* (purpose) disambiguates. The `lib-` prefix is enforced by code (id generation + hardcoded checks like `librarySlideId === 'lib-cover'`); don't drop it. |
| **Deck slide** | `deck-[name]` | `deck-cta` | No number — a number would read like position and lie after a reorder. Scoped to one deck. |

Other conventions:
- CSS scope class = the template id (`.template14-cta { … }`).
- `data-edit` key = short kebab noun (`headline`, `step-1`, `stat-value`).
- `data-feed` key = kebab metric name (`revenue-q1`).
- Template file = `slide-[NN]-[name].html` in `builder/features/slides/`.

---

## 5. The Deck Model — Isolated Copies

When a slide is added to a deck, the deck gets an **independent copy** of its content. Editing a slide in
one deck **never** affects the same slide in another deck.

- **Structure is shared & live** via the template (layout/component fixes propagate everywhere).
- **Content is isolated per deck** (each deck owns its copy).
- "Add to deck" = an explicit **content copy** into that deck.
- A slide cannot be edited in two decks at once through one shared copy — each deck has its own.

This is the coherent split: **structure = shared; content = private to each deck.** No cross-deck surprises.

---

## 6. The Style System — Two-Block Themes

A theme has **two blocks**, and applying a theme should *completely* convert a slide's look (the headline
goal):

1. **Palette block** — the ~25 CSS variables in §3. Re-skins colors/fonts/cards/radii on any slide
   automatically.
2. **Finish block** — the signature visual DNA (blur, glow, slab borders, hand-drawn wobble, decorative
   shapes, animations). Generic CSS that targets the **shared slide skeleton classes** so it restyles every
   slide uniformly.

Both blocks are injected at the deck/slide container (`effectiveStyleCss`, server.js). Full conversion only
works because slides are standardized (cartridges + variables only + shared classes) — a theme has nothing
consistent to grab onto otherwise. The raw look references live in `builder/style-references/*.html`; the
Finish CSS is extracted from them into each `builder/themes/*.css`.

---

## 7. Template Guardrails

The template's set of `data-edit` **slots is a contract** — slides depend on it. `applyEditsToHtml` fills
only slots that still exist, so a removed/renamed slot **silently drops** the saved content.

- **Safe (propagates freely):** CSS, layout, placeholder text, **adding** new slots, component behavior.
- **Breaking (HARD BLOCK):** removing or renaming a slot is **blocked when any slide holds content for that
  slot** (it would orphan it). Allowed only when zero slides use the slot — so dead slots don't accumulate
  forever while keeping a zero-orphaning guarantee.
- **Delete is guarded:** the delete path counts dependents (library slides with that `templateId` + their
  deck slides) and **archives by default** (existing slides keep working); hard-delete only when zero
  dependents.
- **Published presentations are immune** (frozen snapshots) — republish to adopt template changes.

---

## 8. Full Cartridge Skeleton

```html
<div class="slide [layout-class] [slide-id]"
     data-slide="[slide-id]"
     data-slide-mode="sequence">

  <!-- Brand-neutral by default: the product logo. The deck's real logos are injected
       here at serve time (withLiveLogos → the data-edit="logo-row" hook). data-managed marks
       it server-injected, never hand-editable — so auto-save can't serialise injected logos
       back into the slot (and non-deck/template views show the product logo). -->
  <div class="slide-logo-row" data-edit="logo-row" data-managed>
    <img src="/shared/brand/logo.svg" alt="Put A Presentation">
  </div>

  <div class="slide-layout">
    <header class="slide-head">
      <div class="section-label"
           data-edit="section-label"
           contenteditable spellcheck="false">Section Name</div>
      <h1 class="slide-title"
          data-edit="headline"
          contenteditable spellcheck="false">Dummy Headline</h1>
      <div class="divider"></div>
    </header>

    <div class="slide-body">
      <!-- slide content; data-feed on live-data elements only -->
    </div>
  </div>

  <style>
    .[slide-id] { /* layout only — use var(--accent), var(--text), var(--card-bg), … */ }
  </style>

  <script>
  (function () {
    var slide   = document.currentScript.closest('[data-slide]');
    var slideId = Track.slideId(slide);
    /* wire interactions via Track.*(slideId, …) */
    setTimeout(function () { if (window.PE) PE.initSlide(slide); }, 0);
  })();
  </script>
</div>
```

---

## 9. Checklist — before a cartridge is complete

- [ ] One `.html` cartridge file (not a JS string-builder)
- [ ] `data-slide` + `data-slide-mode` on the root element
- [ ] ID follows `template[NN]-[name]`; CSS scope class matches it
- [ ] Every editable text node has `data-edit` (this is also what makes it translatable — no `data-lang-key`)
- [ ] No hardcoded colors/fonts/radii — only the §3 variables (and only ones that exist)
- [ ] Responsive, mobile-first — desktop refinements in `@media (min-width: 769px)`, no `max-width` overrides
- [ ] Every interactive element uses `Track.*()` (never raw `umami.track()`)
- [ ] Scoped `<style>` and scoped `<script>` IIFE
- [ ] **Generic placeholder content only** — a template is a reusable skeleton, so its defaults must be
      brand-neutral dummy data, **never real customer/company data**. Use `Company Name`, `Product One`,
      `Founded · YEAR`, `Tab Label`, `Feature name — short description`, `City, Country`,
      `name@example.com`, `[Customer] · [Name], [Title]` — not real names, stats, products, addresses, or
      emails. The real content lives in the **deck** (per-deck `deckEdits`), filled in when the slide is
      added to a deck — never baked into the template.
- [ ] `data-feed` only on elements designed to receive live data
- [ ] `data-builder-only` on any control that must be stripped from final output
- [ ] Logo-row is **brand-neutral + server-managed**: `.slide-logo-row` carries `data-edit="logo-row"`
      **and `data-managed`**, and defaults to the **product logo** (`/shared/brand/logo.svg`), never a
      specific customer/brand logo. The deck injects its real logos at serve time; `data-managed` keeps it
      non-editable so auto-save never serialises injected logos back into the slot. *(Validator-enforced:
      `logo-default`.)*
