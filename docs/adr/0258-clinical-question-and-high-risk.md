# ADR 0258 — The clinical question, the revealed working diagnosis, and the high-risk specimen warning

**Status:** Accepted — 2026-10-12 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-2/gate-a-proposal.md)). Built on `feat/lab-one-menu` behind its flag; migrations 0107–0111 are GATED and owner-applied. No clinical value is set by this decision.

## Decision

1. The clinical question is the order's existing reason text (no second field).
2. The working diagnosis opens in the lab only on demand; each opening is logged in the identity reveal's access log;
   a restricted diagnosis is masked unless the order is restricted too. It is never cached on the specimen.
3. The high-risk warning attaches to the encounter from the clerking desk's fever-with-bleeding rules or a clinician's
   flag with a reason; only a clinician clears it, with a reason. It is amber, never red, and shows on collection, the
   label, the request form, the worklist, the specimen page and the downtime form. It never changes routing.
