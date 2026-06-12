---
title: Builder + Viewer — Fullscreen — Add native fullscreen button via Fullscreen API
type: Feature
priority: M
status: pending
area: builder
---

Add a fullscreen button that triggers the browser's native Fullscreen API (`element.requestFullscreen()`), equivalent to F11 — browser chrome (tabs, address bar) disappears and the content fills the entire monitor.

Two surfaces:
- **Builder** — fullscreen the deck preview panel so the user can review slides without distraction while editing
- **Viewer (finished presentations)** — fullscreen the entire presentation for live demos and sales calls

The button should toggle in/out of fullscreen and update its icon accordingly (`document.fullscreenElement` / `fullscreenchange` event). Falls back gracefully on browsers that block the API (e.g. some iframe contexts).

ESC to exit is handled automatically by the browser — no code needed for that. What the app must do is listen to the `fullscreenchange` event so the button icon resets correctly when the user exits via ESC (without clicking the button).
