---
title: Builder — Save Presentation Modal — Card Logo — Auto-default from cover slide with required validation
type: Feature
priority: M
status: done
area: builder
---

When saving a new presentation, the Card Logo field in the Save modal now auto-defaults to the customer logo from the cover slide (ls01-cover or ls26-cover). If no cover/hero slide exists in the deck, the field shows no default and is required before saving. The `coverLogoSrc` value is sent with the POST body so the server persists it correctly without re-uploading the file. Label changed from "Logo" to "Card Logo". Deck logo fallback removed from the create flow.
