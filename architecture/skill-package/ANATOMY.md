# Template Anatomy — Quick Reference

Derived from `architecture/slide-system-rulebook.md` (the authoritative spec). Keep in sync; the rulebook
wins if they ever differ.

## CSS Variables (the full real contract — use only these)
```
Accent:  --accent  --accent-mid  --accent-light  --accent-rgb
Base:    --bg  --text  --text-muted
Cards:   --card-bg  --card-border  --card-radius  --card-shadow
Badges:  --badge-bg  --badge-border  --badge-color  --badge-radius
Logo:    --logo-bg  --logo-border  --logo-radius
Hero:    --slide-hero-bg  --slide-hero-rgb  --hero-overlay-start  --hero-overlay-end  --hero-overlay-angle
Fonts:   --font-body  --font-heading
```
Do not invent variables — `--bg-card`, `--border`, `--nav-bg` do **not** exist.

## Tracking helpers (tracker.js)
Event name format: `'slide-' + slideId`
Property format: `{ label: '[component]-[label]-[action]' }`

```js
Track.click(slideId, 'whatsapp')              // button-whatsapp-click
Track.tab(slideId, 'Overview')                // tab-Overview-click
Track.zoom(slideId, 'Camera Detail')          // image-Camera Detail-open
Track.carousel(slideId, 'next', 'Belt')       // carousel-Belt-next
Track.expand(slideId, 'Archive')              // toggle-Archive-expand
Track.event('slide-' + slideId, { label: 'custom' })
```

## Naming
- Template ID (= the slide's `data-slide` and CSS scope class): `template[NN]-[name]` — e.g. `template16-stats` (unique NN, never reused)
- Lang key: `[template-id].[element]` — e.g. `template16-stats.headline`
- data-edit key: short kebab noun — e.g. `headline`, `step-1`, `stat-value`
- data-feed key: metric name — e.g. `revenue-q1`, `lead-count`

## data-feed types
```html
<span data-feed="key" data-feed-type="number">0</span>
<p    data-feed="key" data-feed-type="text">Placeholder</p>
<div  data-feed="key" data-feed-type="chart"></div>
```

## Slide modes
```html
data-slide-mode="sequence"   default — appears in presentation flow
data-slide-mode="embedded"   hidden until triggered
```

Trigger button on parent slide:
```html
<button data-trigger-slide="ls17-detail">View Detail</button>
```
