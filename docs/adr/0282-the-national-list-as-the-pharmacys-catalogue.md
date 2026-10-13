# ADR 0282 — The national list as the pharmacy's catalogue

**Status:** Accepted — 2026-10-13 (owner, also the CSO). Completes CT-3 (gate-a-proposal §8), whose loader and
link confirmation Step 4 did not build. Migration 0136 (GATED).

## Decision

1. **The edition, whole and as printed.** The owner loads an edition of the national list (EMHSLU 2023: 802
   medicines and 1,919 health supplies, `data/pharmacy/national-list/emhslu-2023.csv`) with
   `scripts/pharmacy/load-national-list.ts`, in one transaction. Rows keep the edition's own values, misspellings
   and non-standard level codes included. They also carry what the edition prints beside the six import columns:
   kind, list section, a supply's unit, the specialist band and the source page (0136).
2. **Flagged rows.** The 26 rows the conversion could not read with confidence load as printed, with a
   `check_note`. A flagged row cannot be linked until the CSO records a check against the printed list. That check
   is append-only, and the row itself is never changed.
3. **Links are national, and the CSO confirms each one.** From `/admin/pharmacy-catalogue`, the superadmin acting
   as CSO links each prescribing-list medicine to one medicine row of the edition. The proposal is an exact
   generic-name match. It is confirmed one at a time, or as a reviewed batch of single matches. The database
   refuses a link to a supply row, to a row of another edition, or to an unchecked flagged row.
4. **Pharmacy staff search it from Stock** (`/pharmacy/stock/national-list`), under RLS (`pharmacy.view`). It is
   reference only. Products are still set up only for prescribing-list medicines, and nothing on the list can be
   prescribed, supplied or stocked because it is listed. In production the page waits for its own wording
   (`NATIONAL_LIST_COPY`) to be signed.

## Consequences

- Once a medicine is linked, Stock shows its class (VEN) and the "out, of which vital" figure (CT-3, 5.8).
- Stocking and issuing health supplies, and items outside the prescribing list, is a later decision. It needs
  products that are not tied to a medicine and an "issued to a ward" movement.
- A later edition loads beside this one, and the most recent is the one in use. Links are per edition, so they
  are confirmed again.

## Alternatives considered

- Per-hospital links: rejected. The list is national, and the same work would repeat at every hospital.
- Correcting misprints while loading: rejected (nothing is corrected by guess). The CSO's check records what was
  verified.
- Holding back the uncertain rows: rejected. The catalogue would start 26 items short.
