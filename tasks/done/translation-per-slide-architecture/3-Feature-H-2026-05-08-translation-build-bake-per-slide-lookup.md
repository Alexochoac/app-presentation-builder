---
title: Translation — Build/Deploy — bakeLanguageSpans uses per-slide translation lookup
type: Feature
priority: H
status: done
area: build-deploy
---

After the data model migration (task 1), update buildFrozenPresentation in server.js to look up translations per-slide when baking language spans into the finished HTML.

Currently getTranslationValue(fieldKey, lang, translationsData) does a global lookup. It must be updated to accept a slideId and look up translations.slides[slideId][fieldKey][lang] first, falling back to the global fields[fieldKey][lang] for truly shared fields (like credit, badge).

Changes needed:
- getTranslationValue(slideId, fieldKey, lang, translationsData)
- bakeLanguageSpans($) receives the current slide's librarySlideId and passes it to getTranslationValue
- Verify that section-label, headline, tabs, ben-list, tagline etc. each get the correct per-slide English/Italian/etc. value

Depends on: task 1 (per-slide data model)
