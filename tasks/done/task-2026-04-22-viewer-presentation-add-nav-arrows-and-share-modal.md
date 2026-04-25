---
title: Viewer — Presentation — Add nav arrows and share modal
priority: high
status: done
area: viewer
---

Add two features to all published presentations:

1. **Navigation arrows** — left/right arrow buttons fixed in the footer or sides so viewers can move between slides without scrolling.

2. **Share modal** — a share icon in the footer opens a "Share presentation" form. The form asks for name, role, and an optional message. Two channel buttons: WhatsApp and Email (no copy link button — the UTM link is embedded in the prepared message, not exposed separately).

   - **WhatsApp flow:** clicking WhatsApp reveals a phone number input. Clicking Send opens `wa.me/[number]?text=[prepared message]` in a new tab. The message includes the UTM link: `https://app-presentation-builder.pages.dev/finished-presentations/[p.id]/?utm_source=share&utm_medium=whatsapp&utm_content=[name]&utm_term=[role]`.
   - **Email flow:** clicking Email reveals an email address input. Clicking Send opens the user's default mail client (`mailto:`) with a pre-filled subject and body that includes the UTM link: `https://app-presentation-builder.pages.dev/finished-presentations/[p.id]/?utm_source=share&utm_medium=email&utm_content=[name]&utm_term=[role]`.

Reference: an existing share modal pattern is already in use in the softsolution project (share-modal, share-card, share-sub, share-form-row elements). Use the same structure and adapt the styles to match the viewer's footer.

## Implementation Summary

All changes made in `builder/server.js` inside `buildFrozenPresentation()` — the single function that generates all finished presentation HTML. No new files created.

**Side nav arrows (desktop only)**
- Added `#fp-arrow-prev` and `#fp-arrow-next` buttons rendered outside `#fp-shell`, fixed at `top: 50%` on left/right edges (16px inset), 48px circles with blur backdrop.
- Hidden by default (`display: none`), shown via `@media (min-width: 768px) { display: flex }`.
- Disabled state synced in both `goTo()` and `goToOptional()` alongside the existing header nav buttons.
- Click handlers call `goTo(idx ± 1)`.

**Share button placement**
- Header: share icon (SVG) placed after `#fp-title` on the right-hand side. Header order is now: `← Dashboard | ‹ counter › [spacer] [presentation name] [share icon]`. Title no longer has `flex:1`; a `#fp-header-spacer` div takes the space instead.
- Footer: `justify-content: center`, slide name and share icon sit together as a centered pair. Order: `[slide name] [share icon]`.

**Share modal**
- Full-screen overlay (`#fp-share-overlay`) with dark backdrop + blur, containing a 340px modal card.
- Fields: Name, Role, Message (optional).
- Two channel buttons (WhatsApp / Email). Clicking one reveals the corresponding contact input (phone or email) below; the other hides.
- Send button disabled until name + role + channel + contact field are all filled.
- WhatsApp: opens `https://wa.me/[phone]?text=[message + UTM link]` in new tab.
- Email: opens `mailto:[address]?subject=...&body=[message + UTM link]` in new tab.
- Presentation ID is baked in at build time via `JSON.stringify(presentation.id)`.
- Fires `umami.track("share-send", { medium, name, role })` on send.
- Both share buttons (header + footer) open the same modal.
- Clicking the overlay backdrop or Cancel closes and resets the modal.
