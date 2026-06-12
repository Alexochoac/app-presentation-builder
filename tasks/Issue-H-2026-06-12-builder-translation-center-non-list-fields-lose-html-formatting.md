---
title: Builder — Translation Center — Non-list Fields — Fix HTML formatting lost on save
type: Issue
priority: H
status: pending
area: builder
---

When a non-list field is edited in the Translation Center, any inline HTML formatting on the original text (bold, italic, inline styles, spans, etc.) is permanently lost.

**Root cause (three-step data loss):**
1. `stripHtmlTags()` is called before rendering the value into the textarea (`preview.html:1494`) — the user never sees the HTML, only plain text
2. On blur, the plain text value is saved to the server as-is — no HTML
3. The value is written back to the slide via `el.innerHTML = entry.current` (`preview.html:1167`) — but since it's plain text, no formatting is applied

List fields are not affected because they reconstruct the full HTML structure from the English template via `linesToListHtml()` — the same approach should be applied to non-list fields.

**Fix direction:** When saving a non-list translation, merge the plain text back into the original English HTML structure (replace text nodes only, preserve tags and attributes) — the same way `linesToListHtml()` does it for lists. The English HTML is available as the source template to clone from.
