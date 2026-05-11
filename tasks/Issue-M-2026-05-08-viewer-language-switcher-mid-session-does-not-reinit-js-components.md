---
title: Viewer — Language Switcher — Mid-session switch does not re-initialize JS components (tabs, carousel)
type: Issue
priority: M
status: pending
area: viewer
---

When a user switches language mid-session in a finished presentation, complex components like tabs and carousels that were already initialized by Tabs.init / Carousel.init won't re-initialize for the newly shown language span. The fix requires calling component init on the newly visible [data-lang] container after switchLang runs, or restructuring the baked HTML so component JS can handle multi-language content natively.
