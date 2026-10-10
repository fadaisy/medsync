# Numbers ledger

Migration and ADR numbers claimed by work in flight, so two branches never take the same number. Claim a block
here, in the branch that will use it, **before** writing the first migration or ADR. Release unused numbers when
the work merges. Highest numbers are read across `origin/main` and every local and remote branch.

| Block               | Claimed by                                                     | Branch                     | On          | State                        |
| ------------------- | -------------------------------------------------------------- | -------------------------- | ----------- | ---------------------------- |
| migration 0097      | Lab Phase 0 (lab access sync)                                  | `feat/lab-front-door`      | 10 Oct 2026 | used, not merged             |
| ADR 0221–0226       | Lab Phase 0                                                    | `feat/lab-front-door`      | 10 Oct 2026 | used, not merged             |
| migration 0098–0117 | Pharmacy Phase 0 (front door) and the pharmacy phases after it | `feat/pharmacy-front-door` | 10 Oct 2026 | 0098–0102 used, rest claimed |
| ADR 0227–0241       | Pharmacy Phase 0 and the pharmacy phases after it              | `feat/pharmacy-front-door` | 10 Oct 2026 | 0227–0237 used, rest claimed |

On `origin/main` (4087e4c, 10 Oct 2026) the highest migration is **0096** and the highest ADR **0220**.

**Known collision:** ADR **0073** names two files: `0073-clerkship-problem-list-synthesis.md` (main) and
`0073-examination-shared-parameter-qc.md` (`origin/feat/exam-consistency-qc` only). Whoever merges that branch
renumbers its ADR.
