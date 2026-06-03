---
name: slide-template-creator
description: Creates HTML slide templates for the App Presentation Builder. Use when the user says "create a slide", "new slide", "new template", or asks to generate a slide template. Guides the user through a short Q&A and outputs a ready-to-import HTML file.
---

# Slide Template Creator

When triggered, run the following flow — ask Step 1 questions, wait for answers, then execute Steps 2, 3, and 4 in order.

## Step 1 — Ask these questions in one message

```
I'll create a slide template for you. A few quick questions:

1. **Slide number** — What's the next template number? (e.g. template16, template17)
2. **Slide name** — Short name for the slide (e.g. stats, team, timeline)
3. **Slide type** — Pick one: Cover · Content · Stats/Metrics · Visual/Gallery · Two-Column · CTA · Data/Chart
4. **Content blocks** — What goes on this slide? List the elements (e.g. "headline, 3 stat numbers, a supporting image, a short paragraph")
5. **Interactive elements** — Any buttons, tabs, carousels, expandable sections, or links?
6. **Live data?** — Will any values be fed via webhook? If yes, which ones?
7. **Slide mode** — Does this slide appear in the normal flow, or is it a hidden drill-down triggered by another slide?
```

## Step 2 — Output the visual preview

**You MUST output this step.** Generate a complete, standalone HTML page (full `<!DOCTYPE html>` document) as an `html` code block. This lets the user see the slide rendered directly in Claude before importing it into the app. Do not skip this step.

This preview page is NOT imported into the app — it is only for visual review.

The `<head>` must contain a `<style>` block with the **full verbatim contents of `app-base.css`** (included in this skill package). Copy every line of that file into the style block — do not summarise or paraphrase it. This is the real app stylesheet and must be reproduced exactly so the preview matches what the app looks like.

The `<body>` must contain:
1. A `.slides-container` div wrapping two `.glow-orb` divs (class `a` and `b`) followed by the slide fragment.
2. The slide fragment's root element must include `active` in its class list so it renders visible, e.g. `class="slide content template[NN]-[name] active"`.

A `<script>` block at the end of `<body>` must stub the app globals so the slide's JavaScript does not throw errors:
`window.Track = { slideId:function(el){return el?(el.dataset.slide||'preview'):'preview';}, click:function(){}, tab:function(){}, carousel:function(){}, expand:function(){}, zoom:function(){}, event:function(){} };`
`window.PE = { initSlide:function(){} };`

After this code block, write: **"👆 Preview only — do not save this file."**

## Step 3 — Output the importable fragment

**You MUST output this step.** Generate the clean HTML fragment (the `<div class="slide...">` block only — no `<html>`, `<head>`, or `<body>` tags) as an `html` code block. This is the file the user will import into the app.

The root slide class must NOT include `active` in this version.

See ANATOMY.md for the full spec. Key rules:

Root element:

    <div class="slide content template[NN]-[name]"
         data-slide="template[NN]-[name]"
         data-slide-mode="sequence|embedded">

Every text node gets: `data-edit="key"` (kebab-case), `contenteditable spellcheck="false"`, and dummy placeholder text only — no real content. (Do NOT add `data-lang-key` — translation keys off `data-edit`; the app never reads `data-lang-key`.)

Style rules: all colors via CSS variables (`var(--accent)`, `var(--text)`, `var(--text-muted)`, `var(--bg)`, `var(--card-bg)`, `var(--card-border)`). Use only variables that exist (`--bg-card`, `--border`, `--nav-bg` do NOT exist — see ANATOMY.md for the full real list). Never hardcode hex or rgb theme colors. Mobile-first CSS, desktop overrides in `@media(min-width:769px)`. Scoped to the slide's class — no global pollution.

Tracking rules: use `Track.click(slideId, 'label')` for buttons/links, `Track.tab(slideId, 'Label')` for tabs, `Track.carousel(slideId, 'next'/'prev', 'caption')` for carousels, `Track.expand(slideId, 'Section')` for accordions. Get slideId via `var slideId = Track.slideId(slide);`. Never call `window.umami.track()` directly.

Data feed (only if user said yes to live data): `<span data-feed="metric-key" data-feed-type="number">0</span>`

Builder-only elements: `<button data-builder-only="">+ Add Item</button>`

Script block (always end the IIFE with): `setTimeout(function () { if (window.PE) PE.initSlide(slide); }, 0);`

Standard slide wrapper structure:

    <div class="slide-logo-row">
      <img src="/slides/shared/LOGO SoftSolution grays.png" alt="Softsolution">
      <span class="slide-logo-sep"></span>
      <img src="/slides/shared/LOGO LiteSentry Greys.png" alt="LiteSentry" class="slide-logo-ls">
    </div>
    <div class="slide-layout">
      <header class="slide-head">
        <div class="section-label" data-edit="section-label" contenteditable spellcheck="false">Section Name</div>
        <h1 class="slide-title" data-edit="headline" contenteditable spellcheck="false">Dummy Headline</h1>
        <div class="divider"></div>
      </header>
      <div class="slide-body">
        <!-- content here -->
      </div>
    </div>

After this code block, write: **"Save this as: `slide-[NN]-[name].html` → drop it in `builder/features/slides/`"**

## Step 4 — Show the checklist

After Step 3, always show:

    ✅ Checklist
    - [x] data-slide + data-slide-mode on root
    - [x] Every editable text node has data-edit (no data-lang-key)
    - [x] No hardcoded theme colors — CSS variables only
    - [x] Interactive elements have Track.*() calls
    - [x] Scoped <style> block
    - [x] Scoped <script> IIFE block
    - [x] Dummy content only — no real customer data
    - [ ] data-feed slots (not needed / added for: ___)
    - [x] data-builder-only on builder controls

Mark items accordingly based on what was generated.
