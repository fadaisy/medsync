---
name: pharmacy-medicines-build
description: "Set-up › Medicines rework (MEDICINES-TAB.md kit) built 3 Nov 2026 on feat/pharmacy-medicines in the main folder, pushed; 0270 applied"
metadata:
  node_type: memory
  type: project
  originSessionId: 1ca875d6-2fbd-4f0a-bec4-2c16af100a54
  modified: 2026-11-03T10:08:34.229Z
---

Set-up › Medicines rebuilt from the kit in `docs/pharmacy/rework/` (MEDICINES-TAB.md) on `feat/pharmacy-medicines`
in ~/Desktop/medsync (main folder, not a worktree). Pushed 3 Nov 2026 (70643a27), no PR. ADR 0471.

- One grid `components/pharmacy/medicines/grid.tsx`, edit mode in Set-up, operate mode in Stock › Medicines.
- Point billing moved to Set-up › Places (`point-billing.tsx`). Old Prices page and Medicines list deleted.
- 0270 applied (3 Nov). GATED 0271 (catalogue classes from EMHSLU sections, 6243a5d4) awaits owner apply. EMHSLU tag fix ed901505; unit choice for 401 no-unit catalogue medicines f46f8d31.
- NDA register loader: owner said yes (3 Nov) — build it when they bring the NDA file; cat_register_editions and cat_products are empty, no loader yet.
- Copy `PHARMACY_MEDICINES_COPY` draft; RX_CHECKS doses need CSO sign; national controlled list `unconfirmed`.
- PGlite harness pglite package went missing once; reinstall with `cd ~/Desktop/emr-harness/pg && npm install`.
- Preview launcher cannot read .env.local (sandbox); the user often has `next dev` on :3000 from the main folder — use it.

**Why:** owner asked for the medicines setup rework executed to perfection, fully functional.
**How to apply:** read docs/pharmacy/HANDOFF.md "Set-up › Medicines" before continuing. See [[pharmacy-rework-build]].

**3 Nov, 25ab1330:** Stock › Receive a delivery (`app/pharmacy/stock/_components/receive-delivery.tsx`, `receiveDelivery` in lib/pharmacy/stock/store.ts) built from the Receive prototype on the Design canvas. Not in it: "against an order" (orders live in Store › Deliveries) and supplier picker. Draft is localStorage per point. Not checked in the browser (pane signed out).

**3 Nov, 4a485d5c:** Main store prototype (Store.dc.html on the canvas). Requisitions built first: per-batch pick list + notes + print on /pharmacy/store/issues/[id]. Shelves need a put-away step + migration (not built). Pre-existing failure: pharmacy-demo-stores "/store/packs" lane test (fails on main too).

**3 Nov, 4f677055:** put-away (Store › Receive) + shelf on the pick list; migration 0272 pharmacy_batch_shelves (append-only, GATED, unapplied — owner runs `cd ~/Desktop/medsync && npm run db:migrate`, after 0271). Pages hide put-away until 0272 exists.
