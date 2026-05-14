# Template Anatomy — Quick Reference

Full spec: `architecture/template-anatomy.md` in the project repo.

## CSS Variables (always available)
```
--accent        primary brand color
--accent-rgb    RGB triplet for rgba()
--accent-light  lighter variant
--bg            slide background
--bg-card       card / panel background
--text          primary text
--text-muted    secondary text
--border        border color
```

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
- Slide ID: `ls[NN]-[name]` — e.g. `ls16-stats`
- Lang key: `[slide-id].[element]` — e.g. `ls16-stats.headline`
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
