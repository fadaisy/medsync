# Numbers ledger

Migration and ADR numbers claimed by work in flight, so two branches never take the same number. Claim a block
here, in the branch that will use it, **before** writing the first migration or ADR. Release unused numbers when
the work merges. Highest numbers are read across `origin/main` and every local and remote branch.

| Block               | Claimed by                                                     | Branch                     | On          | State                        |
| ------------------- | -------------------------------------------------------------- | -------------------------- | ----------- | ---------------------------- |
| migration 0097      | Lab Phase 0 (lab access sync)                                  | `feat/lab-front-door`      | 10 Oct 2026 | used                         |
| ADR 0221–0226       | Lab Phase 0                                                    | `feat/lab-front-door`      | 10 Oct 2026 | used                         |
| migration 0098–0100 | Pharmacy Phase 0 (access, placement, prescription reads)       | `feat/pharmacy-front-door` | 10 Oct 2026 | used                         |
| ADR 0227–0237       | Pharmacy Phase 0                                               | `feat/pharmacy-front-door` | 10 Oct 2026 | used                         |
| migration 0101      | Lab: staff keep access to their specimens (hotfix)             | `feat/lab-front-door`      | 11 Oct 2026 | used                         |
| ADR 0238            | Lab: the same hotfix                                           | `feat/lab-front-door`      | 11 Oct 2026 | used                         |
| migration 0102–0119 | Lab Phase 1 (safety floor) and lab phases after it             | `feat/lab-safety-floor`    | 11 Oct 2026 | claimed                      |
| ADR 0239–0259       | Lab Phase 1 and lab phases after it                            | `feat/lab-safety-floor`    | 11 Oct 2026 | claimed                      |
| migration 0120–0139 | Pharmacy Phase 0 (0120, 0121) and the pharmacy phases after it | `feat/pharmacy-front-door` | 11 Oct 2026 | 0120–0121 used, rest claimed |
| ADR 0260–0279       | The pharmacy phases after Phase 0                              | `feat/pharmacy-front-door` | 11 Oct 2026 | claimed                      |
| ADR 0280            | Several accounts in one browser                                | `feat/multi-account`       | 11 Oct 2026 | used                         |
| migration 0140–0146 | Pharmacy Phase 1 (extends the pharmacy block to 0122–0146)     | `feat/pharmacy-dispensing` | 11 Oct 2026 | claimed                      |
| migration 0107–0111 | Lab Phase 2 (catalogue v2, one menu, bedside, NCD feed)        | `feat/lab-one-menu`        | 12 Oct 2026 | used (unapplied)             |
| ADR 0251–0259       | Lab Phase 2                                                    | `feat/lab-one-menu`        | 12 Oct 2026 | claimed                      |

On `origin/main` (cf404abd, 11 Oct 2026) the highest migration is **0121** and the highest ADR **0280**.

**Pharmacy Phase 1** (`feat/pharmacy-dispensing`) uses migrations **0122–0146** (25: the rest of the pharmacy
block plus 0140–0146) and ADRs **0260–0279** (20).

**Resolved 11 Oct 2026:** the lab's hotfix took migration 0101 and ADR 0238 while the pharmacy branch held
unapplied files numbered 0101 and 0102; the pharmacy's became 0120 and 0121. Released by the pharmacy: migrations
0101–0117 and ADRs 0238–0241.

**Known collision:** ADR **0073** names two files: `0073-clerkship-problem-list-synthesis.md` (main) and
`0073-examination-shared-parameter-qc.md` (`origin/feat/exam-consistency-qc` only). Whoever merges that branch
renumbers its ADR.
