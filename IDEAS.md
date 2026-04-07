# Ideas

## Public Landing Page for Presentation Builder
**Date:** 2026-04-07  
**Context:** Mid-session during mobile responsiveness fixes on the slide system.  
**Idea:** Create a public-facing landing page for the app — single-page scrollable with a nav menu. Sections: hero, feature highlights/examples, subscription pricing tiers, integrations showcase, investor section, and any other product angles worth highlighting.  
**Risks / Dependencies:** This is Phase 2+ territory (SaaS, multi-user). Landing page implies public sign-up which requires auth infrastructure beyond the current single-user local app. Could be built as a static marketing page first (no real auth) and wired up later. No overlap with current Phase 1 work.  

---

## Dual-Preview Layout Builder (Desktop + Mobile Side by Side)
**Date:** 2026-04-07  
**Context:** Mid-session during the mobile responsiveness refactor — fixing desktop/mobile CSS conflicts across all slides.  
**Idea:** A layout builder mode that shows the slide in desktop format while simultaneously previewing how it looks on mobile. Mobile gets priority — the desktop layout adapts from mobile, not the other way around. Would eliminate the current guesswork of "fix mobile, break desktop."  
**Risks / Dependencies:** Depends on completing the design system refactor (standard slide anatomy, no per-slide layout CSS) first — otherwise the dual preview would show the same CSS conflict problems. Relates to Phase 3 (interactive slides). Could be a builder UI enhancement in Phase 2.  

---
