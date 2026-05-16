---
title: Translation System — AI Translator — Silent Failures and No User Feedback
type: Issue
priority: M
status: done
area: builder
---

The OpenRouter AI translator silently skips failed batches with no feedback to the user. If the API key is wrong, the network is down, or the model returns invalid JSON, the "Translate" button completes as if successful — but no translations were saved.

## What's broken

- `builder/lib/translator.js`: on any error (network, bad JSON, auth), returns `{ ok: false }` with no message.
- `POST /api/translations/translate-all` in `server.js`: iterates chunks, skips any where `result.ok === false`, and returns a success response regardless.
- `preview.html` Translation Center: shows a success state even when all batches failed.
- No timeout — if OpenRouter hangs, the UI hangs indefinitely.

## What to fix

**`builder/lib/translator.js`:**
- Add a `signal: AbortSignal.timeout(30000)` (30s) to the fetch call.
- On failure, return `{ ok: false, error: <message> }` with the actual error string.

**`server.js` — `POST /api/translations/translate-all`:**
- Track which chunks failed: collect `{ ok, error, fields }` per chunk.
- Return `{ success: true, translated: N, failed: M, errors: [...] }` so the client knows the full picture.

**`preview.html` — Translation Center:**
- After the translate-all call, if `res.failed > 0`, show a visible red banner:
  `"⚠ X field(s) could not be translated — check your OpenRouter API key or try again."`
- If all chunks failed (translated === 0), show a full error state instead of a success state.

## Files

- `builder/lib/translator.js`
- `server.js` — `POST /api/translations/translate-all`, `POST /api/translations/translate`
- `builder/features/builder-ui/preview.html` — Translation Center result handling

## Depends on
Task 2 (endpoints migrated to per-deck) — do after Task 2 so error handling is in the right place.

## Implementation Summary

### Problem
The AI translator (`translator.js` → OpenRouter API) failed completely silently. Any error — bad API key, network timeout, invalid JSON response — returned `{ ok: false }` with no user-visible feedback. Both server endpoints (`/translate` and `/translate-all`) skipped failed chunks with `continue` and always returned `{ success: true }`. The UI showed "all done" regardless.

Additionally, a pre-existing bug was found in `/api/translations/translate-all`: it called `translate(chunkTexts, lang)` using a language *code* (e.g. `'es'`) instead of the language *name* (e.g. `'Spanish'`), and then read `translated[key]` from the raw `{ ok, fields }` result object instead of `result.fields[key]` — meaning every translation result was silently discarded.

### Root causes
1. No fetch timeout in `translator.js` → hung requests froze the UI indefinitely
2. `/translate-all` passed wrong argument type to `translate()` (code vs name)
3. `/translate-all` read from wrong property on the result object (`translated[key]` vs `result.fields[key]`)
4. Both endpoints had no failure tracking — always returned success
5. UI had no partial-failure display path — only a `.catch(alert)` for full HTTP errors

### Files changed

**`builder/lib/translator.js`**
- Added `signal: AbortSignal.timeout(30000)` to the `fetch()` call

**`builder/server.js` — `POST /api/translations/translate`**
- Added `translatedCount`, `failedChunks`, `errors` tracking across the chunk loop
- On `!result.ok`: increments `failedChunks`, pushes `result.error` to errors array, continues
- Returns `{ success: true, data: t, translated: N, failed: M, errors: [...] }`

**`builder/server.js` — `POST /api/translations/translate-all`**
- Added `langList` lookup so language name (e.g. "Spanish") is passed to `translate()` instead of code ("es")
- Fixed result access from `translated[key]` → `result.fields[key]`
- Added `result.ok` guard — skips and tracks failures instead of silently discarding
- Added `translatedCount`, `failedChunks`, `errors` tracking
- Returns `{ success: true, data: t, translated: N, failed: M, errors: [...] }`

**`builder/features/builder-ui/preview.html` — `handleTranslateAllClick()`**
- `done++` still fires per slide processed (keeps progress bar consistent)
- `res.failed > 0` now adds to the `failed` counter (batch-level failures from server)
- "All done!" completion message appends a red `(N batch(es) failed — check API key)` note when `failed > 0`

**`builder/features/builder-ui/preview.html` — `handleTranslateClick()`** (Translation Settings button — later removed)
- Replaced `alert()` with an inline red error div below the button
- Shows partial failure count when `res.failed > 0`
- Clears on next successful run
- Note: this button was subsequently removed from Translation Settings entirely (separate UX change in same session)
