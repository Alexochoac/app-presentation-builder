# Template Anatomy Spec

## What Is a Template

A template is a **blank structural slide** — it defines layout, structure, and component type.
It always has:
- The app's default styling (CSS variables, no hardcoded colors)
- Dummy/placeholder content (no real customer data)
- All five anatomy layers pre-wired (see below)

Templates are the starting point for every slide in the system. Once a template is filled with
real content it becomes a **library slide**. Library slides belong to one of two subtypes:

| Subtype | Style | Scope |
|---|---|---|
| **General slide** | Generic (default app style) | Not tied to a deck. Inherits deck style when added to one. |
| **Deck slide** | Deck-specific style baked in | Belongs to a specific deck. Style flows from the deck. |

---

## Style Inheritance Rules

1. **Style library** — All styles come from a curated library. New styles are imported (can be AI-generated). Styles are never created from scratch inside the app.
2. **Deck is authoritative** — Once a slide is in a deck, the deck's style is applied to it.
3. **First-slide exception** — When the first slide is added to an empty deck, the deck inherits that slide's style (direction reverses: slide → deck). This only applies to the first slide.
4. **Live inheritance** — If a deck's style changes, all slides in that deck update automatically.
5. **Multi-deck duplication** — A slide cannot live in two decks simultaneously. To reuse a slide across two decks, duplicate it first.

---

## The Five Anatomy Layers

Every template must implement all five layers, even if some are minimal placeholders.

### 1. Style-Ready

All visual properties use CSS variables — never hardcoded colors, fonts, or spacing values
that belong to a theme.

```css
/* Required CSS variables (provided by the active style) */
--accent          /* primary brand color */
--accent-rgb      /* RGB triplet for rgba() usage */
--accent-light    /* lighter variant */
--bg              /* slide background */
--bg-card         /* card/panel background */
--text            /* primary text color */
--text-muted      /* secondary text color */
--border          /* border color */
```

Rule: if a color would change when switching styles, it must use a variable.

### 2. Translation-Ready

Every user-visible text element carries `data-lang-key`. The key format is:
```
[slide-id].[element-key]
```

Example: `data-lang-key="cta.headline"`

```html
<h1 data-edit="headline"
    data-lang-key="cta.headline"
    contenteditable spellcheck="false">
  Ready for a live demonstration?
</h1>
```

Rules:
- Every `contenteditable` text node gets a `data-lang-key`
- Every button label, placeholder, and aria-label gets a `data-lang-key`
- Images do not need lang keys unless they have a text overlay or alt text that changes per language

### 3. Tracking-Ready

All tracking goes through the `Track` helper (`builder/features/slides/components/tracker.js`).
Never call `umami.track()` directly — always use `Track.*()`.

**Event format** (defined in tracker.js):
- Event name: `'slide-[slide-id]'` — e.g. `slide-ls14`
- Properties: `{ label: '[component]-[label]-[action]' }` — one concatenated string

**Available helpers:**

```js
Track.click(slideId, 'whatsapp')              // → slide-ls14, { label: 'button-whatsapp-click' }
Track.tab(slideId, 'Overview')                // → slide-ls14, { label: 'tab-Overview-click' }
Track.zoom(slideId, 'Camera Detail')          // → slide-ls14, { label: 'image-Camera Detail-open' }
Track.carousel(slideId, 'next', 'Belt')       // → slide-ls14, { label: 'carousel-Belt-next' }
Track.expand(slideId, 'Archive')              // → slide-ls14, { label: 'toggle-Archive-expand' }
Track.event('slide-ls14', { label: 'custom-foo' }) // raw call, full control
```

**Resolving slideId from a DOM element:**

```js
var slideId = Track.slideId(el); // walks up to nearest [data-slide], returns its value
```

**Where to wire it:**
Tracking calls live inside the slide's scoped `<script>` IIFE — written once, fires in every
presentation that uses the slide. No per-presentation wiring needed.

```js
(function () {
  var slide   = document.currentScript.closest('[data-slide]');
  var slideId = Track.slideId(slide);

  slide.querySelector('.cta-btn-wa').addEventListener('click', function () {
    Track.click(slideId, 'whatsapp');
  });
  slide.querySelector('.cta-btn-email').addEventListener('click', function () {
    Track.click(slideId, 'email');
  });
})();
```

### 4. Slide Mode

Every slide declares how it appears in a presentation:

```html
<div class="slide" data-slide="[id]" data-slide-mode="sequence">
```

| Mode | Behavior |
|---|---|
| `sequence` | Appears in the normal presentation flow (default) |
| `embedded` | Hidden from the flow — only shown when a trigger button is clicked |

A trigger button on a parent slide points to the embedded slide:

```html
<button data-trigger-slide="[target-slide-id]">View Detail</button>
```

All new templates default to `data-slide-mode="sequence"` unless specifically designed
as a drill-down or detail panel.

### 5. Data Feed (Webhook-Ready)

Elements that can receive live data from a webhook carry `data-feed`:

```html
<span data-feed="revenue-q1" data-feed-type="number">0</span>
<div  data-feed="chart-data"  data-feed-type="chart"></div>
<p    data-feed="summary-text" data-feed-type="text">Placeholder</p>
```

| Feed type | Use |
|---|---|
| `text` | String replacement |
| `number` | Numeric value (formatted per locale) |
| `chart` | JSON payload to feed a chart component |

If a template has no live data needs, omit `data-feed` entirely — do not add empty placeholders.
Only add it when the slide is explicitly designed to receive external data.

---

## Full HTML Skeleton

```html
<div class="slide [layout-class] [slide-id]"
     data-slide="[slide-id]"
     data-slide-mode="sequence">

  <!-- Logo row (always present) -->
  <div class="slide-logo-row">
    <img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution">
    <span class="slide-logo-sep"></span>
    <img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls">
  </div>

  <!-- Slide layout -->
  <div class="slide-layout">
    <header class="slide-head">
      <div class="section-label"
           data-edit="section-label"
           data-lang-key="[slide-id].section-label"
           contenteditable spellcheck="false">
        Section Name
      </div>
      <h1 class="slide-title"
          data-edit="headline"
          data-lang-key="[slide-id].headline"
          contenteditable spellcheck="false">
        Dummy Headline Text
      </h1>
      <div class="divider"></div>
    </header>

    <div class="slide-body">
      <!-- slide-specific content here -->
      <!-- data-feed attributes on elements that receive webhook data -->
    </div>
  </div>

  <!-- Scoped styles — no hardcoded theme colors -->
  <style>
    .[slide-id] { /* layout only */ }
    /* Use var(--accent), var(--text), var(--bg-card), etc. */
  </style>

  <!-- Scoped script — tracking + interactivity -->
  <script>
  (function () {
    var slide   = document.currentScript.closest('[data-slide]');
    var slideId = slide ? slide.dataset.slide : '[slide-id]';

    function track(component, label, action) {
      if (window.umami) umami.track(slideId, { component: component, label: label, action: action });
    }

    /* wire interactive elements */
    /* example: */
    /* slide.querySelector('.my-btn').addEventListener('click', function () { */
    /*   track('cta', 'my-btn', 'click');                                    */
    /* });                                                                    */

    /* init slide engine */
    setTimeout(function () { if (window.PE) PE.initSlide(slide); }, 0);
  })();
  </script>

</div>
```

---

## Naming Conventions

| Thing | Format | Example |
|---|---|---|
| Slide ID | `ls[NN]-[name]` | `ls14-cta` |
| CSS scope class | same as slide ID | `.ls14-cta` |
| Lang key | `[slide-id].[element]` | `ls14-cta.headline` |
| data-edit key | short kebab-case noun | `headline`, `step-1`, `contact-name` |
| data-feed key | kebab-case metric name | `revenue-q1`, `lead-count` |
| Template file | `slide-[NN]-[name].html` | `slide-14-cta.html` |

---

## Checklist — Before a Template Is Considered Complete

- [ ] `data-slide` and `data-slide-mode` on root element
- [ ] Every text node has `data-edit` + `data-lang-key`
- [ ] No hardcoded colors — all theme values use CSS variables
- [ ] Every interactive element has a `umami.track()` call
- [ ] Scoped `<style>` block (no global style pollution)
- [ ] Scoped `<script>` block using IIFE pattern
- [ ] Dummy/placeholder content only — no real customer data
- [ ] `data-feed` on any element designed to receive webhook data
- [ ] `data-builder-only` on any element that should be stripped in final output
