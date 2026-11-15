---
name: pharmacy-equipment-prototype
description: "4 Nov 2026 whole-pharmacy prototype with medicines and EMHSLU supplies together; verdict pending, no repo code changed"
metadata:
  node_type: memory
  type: project
  originSessionId: 1ca875d6-2fbd-4f0a-bec4-2c16af100a54
  modified: 2026-11-04T10:42:34.089Z
---

Design canvas https://claude.ai/artifact/BT8r6CER3XWD6LoVHi7LUT (MedSync Tide). Source in the session scratchpad only.
Core idea: supplies are ordinary lines from the national list (EMHSLU 2023 sections B and C) in the same grid, voucher, prescription, order and store as medicines. Names, sizes, levels and VEN are real; patients, batches, quantities and prices are samples.

**Why:** the owner rejected a first version built on device tags, loans and service as off. The list itself treats oximeters and forceps as plain supply lines. Do not bring tagged devices back unasked. **How to apply:** wait for the owner's verdict before any real build. The repo already holds the list (`data/pharmacy/national-list/emhslu-2023.csv`, loader ADR 0282, `item_kind = 'health_supply'`). Open assumptions: section D stays with the lab; a store keeper handles supplies but not medicines; latex warning needs CSO sign-off; instruments stay with the place and are counted at handover; Theatre added as a place. Related: [[pharmacy-rework-kit-build]], [[receive-harmonized-prototype]].
