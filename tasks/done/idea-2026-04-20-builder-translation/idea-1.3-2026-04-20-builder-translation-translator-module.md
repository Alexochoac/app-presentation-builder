---
title: Builder — Translation — 1.3 — translator.js Claude API module
priority: normal
status: done
area: builder
parent: idea-1.0-2026-04-20-builder-translation-overview.md
---

## Summary

Create `builder/lib/translator.js` — a shared Node.js module that handles all communication with the Claude API for translation. Used by the backend translate endpoint.

## File

`builder/lib/translator.js`

## Responsibilities

- Accept a map of fields to translate: `{ "hero-title": "Scan smarter, not harder", ... }`
- Accept a target language name (e.g. "Spanish")
- Send one batched Claude API prompt with all fields — not one call per field
- Return the translated field map in the same structure
- Handle partial failures gracefully — if the API fails, do not wipe existing translations

## Prompt Strategy

Send all fields as a JSON object in a single prompt:

```
Translate the values in this JSON object to {language}.
Return only the JSON object with the same keys and translated values.
Do not translate keys. Do not add explanation.

{ "hero-title": "Scan smarter, not harder", "hero-subtitle": "The fastest scanner on the market" }
```

## Notes

- Use the Claude API with prompt caching where possible (system prompt cached)
- API key read from `.env` — never hardcoded
- Module is testable in isolation without running the full server

## Acceptance Criteria

- [x] `builder/lib/translator.js` exists and exports a `translate(fields, targetLanguage)` function
- [x] Sends one API call per language (not one per field)
- [x] Returns translated field map matching input structure
- [x] Errors are caught and returned as a structured error (does not throw)
- [x] API key loaded from environment variable

## Done Summary

Created `builder/lib/translator.js` exporting `translate(fields, targetLanguage)`. Uses `@anthropic-ai/sdk` with `claude-haiku-4-5-20251001`, batches all fields in one prompt, uses prompt caching on the system prompt, returns `{ ok, fields, error }`. Added `@anthropic-ai/sdk` to `builder/package.json`.
