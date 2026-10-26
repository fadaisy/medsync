# ADR 0390 — Signed clinical content: packs, versions, signatures, withdrawal

**Status:** Accepted — 2026-10-25, Pharmacy Phase 3 GATE A signed by Fadhul (CSO).

## Decision

- Interaction pairs, alert levels, look-back windows, the added query codes, the "check worth signing" minimum and the PCNE map are entries in `pharmacy_content_entries`. Each is versioned, with an author and a source.
- An entry goes into force only with two signers, each with their own fresh second factor, or with one signer and a recorded exception (D-PH3-26). The database guard enforces this.
- A version in force never changes. A new version replaces it once signed. Withdrawal takes an entry out of force at once.
- Only entries in force act (Law 3). Candidates are imported once per file hash, as drafts.
