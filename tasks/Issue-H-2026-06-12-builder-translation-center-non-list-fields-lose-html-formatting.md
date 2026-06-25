---
title: Builder — Translation Center — Non-list Fields — Fix HTML formatting lost on save
type: Issue
priority: H
status: pending
area: builder
---

When a non-list field is edited in the Translation Center (TC), any inline HTML formatting on the original text (bold, italic, inline styles, accent `<span>`s, multi-color phrases) is lost. The TC strips all tags for editing (`stripHtmlTags`) and saves plain text, overwriting the rich HTML.

**Split into two parts.**

### Part 1 — English authored on the slide (SHIPPED v1.4.5)
The TC English column is now **read-only** (`preview.html` ~1601-1603, `tc-en-edit readonly`), matching how list fields already behave. English is edited on the slide via `contenteditable`, which preserves styling. This stops editing English in the TC from flattening it. ✅ Done.

### Part 2 — Preserve styling in TRANSLATIONS (remaining work, this task)
Translations are still stored/edited as plain text, so a non-English render of a styled field loses its formatting. The whole pipeline is plain-text: `sourceFields` come from the stripped textareas and the LLM (`/api/translations/translate`, server.js) translates plain text.

**Why it's not trivial — multi-color mid-phrase:** styling can split a phrase, e.g. `How <span class="blue">Osprey</span> sees what others miss` ("How" white, "Osprey" accent, rest white). A translation reorders words, so plain text can't be poured back into the English structure positionally.

**Fix direction (segment + tag-preserving):** split the English into runs — `["How ", <blue>"Osprey"</blue>, " sees what others miss"]` — translate/store each run keeping its wrapper, then reassemble. The LLM auto-translate should preserve the `<span>` around the corresponding run; manual TC edits stay mostly plain text per run. Edge cases: reordered words across languages, multiple spans, accent spanning a contiguous phrase. (List fields already reconstruct HTML from the English template via `linesToListHtml()` — a similar template-driven reassembly applies here.)

Related: [[project_translation_center_styling]] in memory. Render/edit pipeline notes in [[project_html_template_rendering]].
