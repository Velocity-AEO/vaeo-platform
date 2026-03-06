# Velocity AEO — Ground Truth
Last updated: March 5, 2026
Repo: github.com/Velocity-AEO/vaeo-platform

## MVP Scope (Locked)
- CMS: Shopify + WordPress ONLY
- Showit: DEFERRED to V1.1
- POC test bed: VAEO-shopify-safe (Cococabanna) — separate repo, never mix

## Build Status
### Done
- [x] C1 — WordPress adapter
- [x] C2 — Duplicate files resolved
- [x] C3 — Core interfaces locked (packages/core/types.ts)
- [x] C4 — Single CLI entry point (apps/terminal/src/index.ts)
- [x] C5 — Environment variables consolidated (packages/core/config.ts)
- [x] C6 — Shopify adapter (packages/adapters/shopify/src/index.ts)
- [x] C7 — Truth-server (packages/truth-server/src/index.ts)

- [x] C8 — Patch engine + rollback manifest (packages/patch-engine/src/index.ts)

### In Progress

### Not Started
- [ ] C9 — Rollback from manifest
- [ ] C10 — ActionLog
- [ ] C11 — BullMQ job queue
- [ ] C12 — Guardrail state machine
- [ ] C13 — Crawlee crawler
- [ ] C14 — Issue detectors
- [ ] C15 — Risk scorer
- [ ] C16 — AI content generator
- [ ] C17 — Schema template engine
- [ ] C18 — Lighthouse validator
- [ ] C19 — W3C HTML validator
- [ ] C20 — Schema validator
- [ ] C21 — Axe accessibility validator
- [ ] C22 — Playwright visual diff
- [ ] C23 — vaeo connect
- [ ] C24 — vaeo crawl
- [ ] C25 — vaeo audit
- [ ] C26 — vaeo optimize
- [ ] C27 — vaeo verify
- [ ] C28 — vaeo promote
- [ ] C29 — vaeo rollback
- [ ] C30 — Operator dashboard

## Repos
- Platform: ~/vaeo-platform (github.com/Velocity-AEO/vaeo-platform)
- POC test bed: ~/VAEO-shopify-safe (Cococabanna ops — never add platform code here)

## Last Built
- C7 truth-server — Claude Code — March 5 2026
