# Frontend — Status & Intent

## Current State
This folder is a placeholder for the Phase 2 rebuild.
It has a working React + Vite + shadcn + Tailwind CSS v4 scaffold with the following components installed:
- button, card, input (shadcn defaults)
- carousel, dialog, table, tabs (added to mirror builder slide components)

## Decision (2026-04-21)
The active development is happening in `../builder/` (the old app).
The goal is to finish Phase 1 on the old app first — validate the product, build the prototype — then migrate to this frontend for Phase 2 (multi-user SaaS).

## Why
- Phase 1 is about proving the product, not the tech stack
- The builder already works; migrating now adds complexity with no user value
- This scaffold will be the starting point once Phase 1 is proven

## When to revisit
When Phase 1 is complete and the product is validated, use this folder as the Phase 2 foundation.
