# Translation System — Architecture

This document describes how multi-language support works in the builder, covering the Translation Center UI, field filtering, blob extraction, read-only preview enforcement, and save reliability.

---

## 1. Data Model

Translations are stored in per-deck JSON files:

```
builder/data/decks/[deckId]/translations.json
```

Structure:
```json
{
  "languages": ["en", "es", "it", "de", "fr", "pt"],
  "slides": {
    "[librarySlideId]": {
      "[fieldKey]": {
        "en": "English source text",
        "es": { "current": "Texto en español", "previous": null, "dirty": false }
      }
    }
  }
}
```

- `en` — the English source at the time of translation (used for dirty detection)
- `current` — the active translated value
- `previous` — the last value before the most recent re-translation (enables undo)
- `dirty: true` — the English source changed since this translation was made; needs re-translation

---

## 2. Translation Center (TC)

Opened from the builder toolbar. Shows all translatable fields for every visible slide in the deck.

### Field collection (`GET /api/translations/fields-summary`)

For each slide the server builds `allFields` in three steps:

1. **Template defaults** — `extractSlideDefaultFields` renders the slide template with no saved edits and reads every `[data-edit]` element (skipping `data-edit-type="image"`).
2. **Saved edits** — `resolveSlideEdits` returns the current deck's saved edits. These override the template defaults.
3. **Blob extraction** — for each blob key (`tabs`, `company-carousel`, `carousel-track-html`, `carousel-track`), the blob HTML is parsed, `[data-builder-only]` elements are removed, and inner `[data-edit]` values are extracted. These override the merged result, ensuring the TC shows **current blob content** (e.g. the actual tab label "How It Works") rather than the stale template default.

### Field filters (applied before showing a row)

A field is **excluded** from the TC if its key or value matches any of:

| Condition | Why |
|---|---|
| Key ends in `-src` or is `customer-logo-src` | Image path, not text |
| Key starts with `__attr:` | HTML attribute, not user-visible text |
| Key is in `blobKeys` | Complex blob — translated via inner fields |
| Value contains `<img` | HTML with embedded image |
| Value matches `/\.(jpe?g|png|gif|webp|svg|bmp)(\?.*)?$/i` | Stored image path |
| Value contains `data-builder-only` | Builder-only markup |
| Stripped value shorter than 3 chars | Not worth translating |
| Stripped value is purely numeric | Not translatable |

### Three translate buttons

| Button | Behaviour |
|---|---|
| **Missing** (red) | Only sends fields with no `current` translation for that language |
| **Outdated** (yellow) | Only sends fields where `dirty: true` |
| **Translate All** | Sends all fields; server uses `force: true` to re-translate even clean fields |

Translation is done per-slide in sequence via `POST /api/translations/translate` with `{ slideId, sourceFields, languages, force }`. The AI model used is configured in `OPENROUTER_MODEL` (default: `anthropic/claude-haiku-4-5`).

### Manual editing

- Typing in a non-English textarea turns the border yellow (unsaved indicator).
- On blur, the value is saved via `PATCH /api/translations/field` with `keepalive: true` (survives page navigation).
- Clearing a field to empty saves `current: ""` — marks it red (missing) in the store.
- Editing the English source column saves via `POST /api/library/:id/edits` (also `keepalive: true`) and marks all language columns for that field as dirty. It also reloads the slide in the builder so the English change is visible immediately.

---

## 3. Read-Only Preview Enforcement

When the builder switches to a non-English language, **zero editing** is allowed. This is enforced in layers:

### CSS layer (instant, covers all controls)

`applyPreviewLang` adds `readonly-lang` to both `#slidesContainer` and `document.body`:

```css
/* Edit controls — hidden */
#slidesContainer.readonly-lang .ls-carousel-add,
#slidesContainer.readonly-lang .ls-carousel-del,
#slidesContainer.readonly-lang .ls-carousel-move,
#slidesContainer.readonly-lang .ls-cmp-replace,
#slidesContainer.readonly-lang .ls-tab-del,
#slidesContainer.readonly-lang .s6-icon-ctrls,
#slidesContainer.readonly-lang .s6-card-del,
#slidesContainer.readonly-lang .s6-add-btn { display: none !important; }

/* Text fields — prevent selection/caret */
#slidesContainer.readonly-lang [contenteditable] { user-select: none !important; }
#slidesContainer.readonly-lang [contenteditable]:focus { caret-color: transparent !important; }

/* Lightbox add-image button */
body.readonly-lang #lb-add-image { display: none !important; }
```

**Navigation controls remain functional**: `ls-carousel-prev`, `ls-carousel-next`, zoom/lightbox trigger, compare entry, compare divider.

### JavaScript layer

- `contentEditable = 'false'` is set on all `[data-edit]` text fields by `applyPreviewLang`.
- `scheduleSave` is overridden to be a no-op when `previewLang !== 'en'`.
- The `slide-carousel-save` event handler returns early when `previewLang !== 'en'` — prevents blob saves from tabs clicks or carousel interactions.
- Tab double-click rename is blocked in `tabs.js` via `if (window.previewLang && window.previewLang !== 'en') return`.
- Surface slide defect label click only stops propagation in English mode, so clicking a label in non-English selects the defect card normally.

### Dynamically-created elements

Elements without `data-edit` (e.g. surface slide defect labels created by JS) are also locked because the CSS `[contenteditable]` rule covers them regardless of how the attribute was set.

---

## 4. English Snapshot and Language Restore

When switching FROM English TO another language, `snapshotEnglish()` captures every `[data-edit]` element's current innerHTML into `enSnapshot`. Switching back to English restores from this snapshot.

**Critical**: when a slide is injected into the DOM while already in non-English mode (`injectSlide`), `snapshotEnglish()` is called **before** `applyPreviewLang`. This ensures the English content is always captured even if the language was restored from `localStorage` before the slides loaded.

On page load, if a non-English language is stored in `localStorage`, `previewLang` and the `readonly-lang` CSS classes are set immediately (no flash), and the actual translation application happens when each slide is injected.

---

## 5. doSave — Builder-Only Content Stripping

`doSave` (the autosave function) clones each `[data-edit][contenteditable]` element and removes all `[data-builder-only]` children before saving. This prevents tab delete buttons, carousel controls, and other builder UI from being saved as part of field values.

---

## 6. Known Constraints

- The `tabs` blob key (`data-edit="tabs"`) is excluded from translation as a unit. Tab labels within the blob ARE translatable via their individual `tab-*` keys (extracted from the blob).
- The surface slide (`slide-06-surface.html`) uses `s6-config` (a hidden JSON blob) as the source of truth for defect cards. Individual `s6-label-N` keys are extracted for translation and wired to `data-edit` attributes on the rendered label elements so `applyPreviewLang` can update them.
- `translate-all` runs per-slide in sequence (not parallel) to avoid rate limits on the AI translation API.
