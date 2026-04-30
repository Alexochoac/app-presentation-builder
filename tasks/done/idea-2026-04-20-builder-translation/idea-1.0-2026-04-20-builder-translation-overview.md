---
title: Builder — Presentation — Translation — Multi-language support per deck
priority: normal
status: done
area: builder
---

## Summary

Each deck supports multiple languages. The user translates on demand during editing or automatically at Create time. Translations are stored in the deck — one deck covers all languages, no duplicate decks needed.

## Three States

- **Edit** — working in the builder, changing content
- **Create** — generate the static HTML with all language versions baked in + footer switcher
- **Publish** — upload the static HTML to the internet (no translation logic here)

## Deck-Level Translation Tracking

- The deck tracks which languages have been translated
- Each field tracks a dirty flag per language (set when the English source changes after a translation was saved)
- Supported languages: all languages, with user-defined favorites pinned to the top of the selector

## During Edit

- "Translate" button runs translation only on untranslated or dirty fields — never re-translates clean fields
- Covers all selected languages in one run
- Each editable field shows its current translation per language + one previous version for rollback
- On re-translation: auto-replace the saved translation, push old version to history (last version only)

## At Create Time

- User picks: default language + optional languages available to the end viewer
- Any missing or dirty translations for selected languages run automatically before HTML is generated
- If a language is already fully translated and clean → used as-is, no API call
- Static HTML is baked with all language versions embedded + a footer language switcher for the viewer

## At Publish Time

- Just uploads the static HTML — no translation logic

## Language Selection UX (at Create)

- Multi-select dropdown with search
- User-defined favorites appear at the top
- All world languages included in the list

## Field History

- Last 1 previous version stored per field per language
- Accessible inside the builder by clicking the field
- User can restore the previous version manually

## Dependencies

- Requires Deck architecture to be in place first (see: Feature-H-2026-04-25-builder-my-decks-card-per-deck-branding-settings-premium.md)
- Translation API: Claude API (batch all dirty fields in one request per language)

---

## Implementation Plan

### Step 1 — Data Model (deck-level i18n store)

Add `decks/[deck-id]/i18n.json` to each deck. Structure:

```json
{
  "languages": ["en", "es", "it"],
  "favorites": ["es", "pt"],
  "defaultLanguage": "es",
  "fields": {
    "hero-title": {
      "en": "Scan smarter, not harder",
      "es": {
        "current": "Escanea mejor, no más duro",
        "previous": "Escanea de forma más inteligente",
        "dirty": false
      },
      "it": {
        "current": "Scansiona in modo più intelligente",
        "previous": null,
        "dirty": false
      }
    }
  }
}
```

- `en` is always the canonical source (plain string, never has dirty flag)
- Each other language has `current`, `previous`, and `dirty`
- `dirty: true` is set whenever the `en` value changes after a translation exists

Add `builder/data/languages.json` — a static list of all world languages with `code` and `name`, used to populate the language selector.

---

### Step 2 — Backend Endpoints (server.js)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/i18n/:deckId` | Return the full i18n.json for the deck |
| `POST` | `/api/i18n/:deckId/translate` | Translate dirty/missing fields via Claude API, save result |
| `POST` | `/api/i18n/:deckId/restore` | Restore `previous` to `current` for a specific field + language |
| `PATCH` | `/api/i18n/:deckId/field` | Save a manual correction to a field translation |
| `GET` | `/api/languages` | Return languages.json (with favorites for the deck) |

**Translate endpoint logic:**
1. Load `i18n.json`
2. Collect all fields where `dirty: true` or language key is missing
3. Batch into one Claude API prompt per target language: `"Translate these JSON values to {language}. Return the same JSON structure."`
4. On response: set `previous = current`, set `current = new value`, set `dirty = false`
5. Save updated `i18n.json`

Hook into the existing slide-save flow: whenever a `data-edit` field is saved, compare new value to `i18n.fields[key].en` — if different, update `en` and set `dirty: true` for all translated languages.

---

### Step 3 — Builder UI (preview.html)

**Toolbar additions:**
- "Translate" button → triggers `POST /api/i18n/:deckId/translate` for all dirty/missing fields across all deck languages
- Shows a count badge: "3 fields need translation"

**Field popover (on click of any `[data-edit]` field):**
- Existing edit controls stay as-is for English
- New tab/section: "Translations"
  - Shows current translation per language
  - Shows previous version with a "Restore" button if `previous` exists
  - Allows manual correction (editable inline, saved via `PATCH /api/i18n/:deckId/field`)

**Language favorites:**
- A settings panel (deck settings) where the user can pick favorite languages
- Saved to `i18n.json` → `favorites[]`

---

### Step 4 — Create Step (generate static HTML)

**Create modal additions:**
- Multi-select language dropdown (search + favorites pinned to top, all world languages)
- Pick default language for the viewer
- Pick optional viewer languages

**Build logic in `scripts/build.js`:**
1. For each selected language: check if all fields are translated and clean → if not, call translate endpoint first
2. For each `[data-edit]` field in the HTML: wrap content in `<span data-lang="en">...</span><span data-lang="es" hidden>...</span>` etc.
3. Inject `slides/shared/i18n-switcher.js` into the output HTML
4. Inject a footer language switcher UI (buttons per selected language)

**`slides/shared/i18n-switcher.js`:**
- On load: reads `?lang=` param or localStorage, shows matching `[data-lang]` spans, hides others
- Footer buttons call the switcher to change active language
- No server needed at view time — fully client-side

---

### Step 5 — New File: `builder/lib/translator.js`

Shared module used by the translate endpoint:
- Accepts: field map `{ key: enValue }`, target language, deck i18n state
- Calls Claude API with one batched prompt
- Returns translated field map
- Handles API errors gracefully (partial failures don't wipe existing translations)

---

### Build Order

1. `builder/data/languages.json` — static file, no dependencies
2. `decks/[deck-id]/i18n.json` schema — define structure, write migration for existing decks
3. `builder/lib/translator.js` — Claude API integration, testable in isolation
4. Backend endpoints in `server.js` — depend on translator.js and i18n.json
5. Hook slide-save to set dirty flags — small addition to existing save logic
6. Builder UI — translate button + field popover translation tab
7. `slides/shared/i18n-switcher.js` — client-side language switcher for finished presentations
8. `scripts/build.js` — Create step: language picker modal + embed i18n bundles into static HTML
