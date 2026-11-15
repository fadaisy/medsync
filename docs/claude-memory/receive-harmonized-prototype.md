---
name: receive-harmonized-prototype
description: "4 Nov 2026 working prototype merging every pharmacy receive surface into one flow; awaiting the owner's verdict, no real code changed"
metadata:
  node_type: memory
  type: project
  originSessionId: 52ced77c-7340-4f57-a7f8-7699ff80d13f
  modified: 2026-11-04T09:09:48.355Z
---

Owner asked (4 Nov 2026) to harmonize Receive a delivery. Prototype, private artifact: https://claude.ai/artifact/EbXqqehJVhp4ZMVQ9kcmTu (sample data, nothing in the repo changed). Source was in the session scratchpad; read it back from the artifact (`project/Main.dc.html`).

The surfaces it merges: Medicines "Receive a delivery · point" dialog (`app/pharmacy/stock/_components/receive-delivery.tsx`, writes straight to stock, never listed in Deliveries), Store Deliveries + Start dialog + delivery page (`app/pharmacy/store/deliveries/`), Controlled "Receive with a witness" (`lib/pharmacy/controlled-store.ts`), two Put away lists (`deliveries/_components/put-away.tsx` and `components/pharmacy/store/bring-in/put-away.tsx`), place-side Confirm receipt.

**Why:** the owner felt many areas claim the same function.

**How to apply:** if the owner approves, the build keeps `lib/pharmacy/stores/receiving-store.ts` as the one writer and retires the others; copy needs CSO sign-off. Check the owner's verdict before assuming the design is final. Related: [[pharmacy-medicines-build]].
