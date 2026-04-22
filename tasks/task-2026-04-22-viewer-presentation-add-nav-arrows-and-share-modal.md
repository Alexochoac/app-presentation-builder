---
title: Viewer — Presentation — Add nav arrows and share modal
priority: high
status: pending
area: viewer
---

Add two features to all published presentations:

1. **Navigation arrows** — left/right arrow buttons fixed in the footer or sides so viewers can move between slides without scrolling.

2. **Share modal** — a share icon in the footer opens a "Share presentation" form. The form asks for name, role, and an optional message. Two channel buttons: WhatsApp and Email (no copy link button — the UTM link is embedded in the prepared message, not exposed separately).

   - **WhatsApp flow:** clicking WhatsApp reveals a phone number input. Clicking Send opens `wa.me/[number]?text=[prepared message]` in a new tab. The message includes the UTM link: `https://app-presentation-builder.pages.dev/finished-presentations/[p.id]/?utm_source=share&utm_medium=whatsapp&utm_content=[name]&utm_term=[role]`.
   - **Email flow:** clicking Email reveals an email address input. Clicking Send opens the user's default mail client (`mailto:`) with a pre-filled subject and body that includes the UTM link: `https://app-presentation-builder.pages.dev/finished-presentations/[p.id]/?utm_source=share&utm_medium=email&utm_content=[name]&utm_term=[role]`.

Reference: an existing share modal pattern is already in use in the softsolution project (share-modal, share-card, share-sub, share-form-row elements). Use the same structure and adapt the styles to match the viewer's footer.
