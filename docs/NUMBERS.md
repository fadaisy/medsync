# Numbers ledger

Migration and ADR numbers claimed by work in flight, so two branches never take the same number. Claim a block
here, in the branch that will use it, **before** writing the first migration or ADR. Release unused numbers when
the work merges. Highest numbers are read across `origin/main` and every local and remote branch.

| Block                    | Claimed by                                                                                                       | Branch                       | On          | State                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------------- | ----------- | ---------------------------- |
| migration 0097           | Lab Phase 0 (lab access sync)                                                                                    | `feat/lab-front-door`        | 10 Oct 2026 | used                         |
| ADR 0221–0226            | Lab Phase 0                                                                                                      | `feat/lab-front-door`        | 10 Oct 2026 | used                         |
| migration 0098–0100      | Pharmacy Phase 0 (access, placement, prescription reads)                                                         | `feat/pharmacy-front-door`   | 10 Oct 2026 | used                         |
| ADR 0227–0237            | Pharmacy Phase 0                                                                                                 | `feat/pharmacy-front-door`   | 10 Oct 2026 | used                         |
| migration 0101           | Lab: staff keep access to their specimens (hotfix)                                                               | `feat/lab-front-door`        | 11 Oct 2026 | used                         |
| ADR 0238                 | Lab: the same hotfix                                                                                             | `feat/lab-front-door`        | 11 Oct 2026 | used                         |
| migration 0102–0119      | Lab Phase 1 (safety floor) and lab phases after it                                                               | `feat/lab-safety-floor`      | 11 Oct 2026 | claimed                      |
| ADR 0239–0259            | Lab Phase 1 and lab phases after it                                                                              | `feat/lab-safety-floor`      | 11 Oct 2026 | claimed                      |
| migration 0120–0139      | Pharmacy Phase 0 (0120, 0121) and the pharmacy phases after it                                                   | `feat/pharmacy-front-door`   | 11 Oct 2026 | 0120–0121 used, rest claimed |
| ADR 0260–0279            | The pharmacy phases after Phase 0                                                                                | `feat/pharmacy-front-door`   | 11 Oct 2026 | claimed                      |
| ADR 0280                 | Several accounts in one browser                                                                                  | `feat/multi-account`         | 11 Oct 2026 | used                         |
| migration 0140–0146      | Pharmacy Phase 1 (extends the pharmacy block to 0122–0146)                                                       | `feat/pharmacy-dispensing`   | 11 Oct 2026 | claimed                      |
| migration 0107–0111      | Lab Phase 2 (catalogue v2, one menu, bedside, NCD feed)                                                          | `feat/lab-one-menu`          | 12 Oct 2026 | used (unapplied)             |
| ADR 0251–0259            | Lab Phase 2                                                                                                      | `feat/lab-one-menu`          | 12 Oct 2026 | used                         |
| ADR 0281                 | Pharmacy Phase 1: the CSO signs alone for now                                                                    | `feat/pharmacy-dispensing`   | 13 Oct 2026 | used                         |
| migration 0136, ADR 0282 | Pharmacy: the national list as the catalogue                                                                     | `feat/pharmacy-dispensing`   | 13 Oct 2026 | used (unapplied)             |
| migration 0112–0118      | Lab Phase 3 (registers, reports and quality)                                                                     | `feat/lab-quality-registers` | 13 Oct 2026 | used (unapplied)             |
| migration 0119           | Lab Phase 3 (spare, unused)                                                                                      | `feat/lab-quality-registers` | 13 Oct 2026 | released                     |
| migration 0150–0159      | Lab Phase 3 (spare, unused)                                                                                      | `feat/lab-quality-registers` | 13 Oct 2026 | released                     |
| ADR 0300–0311            | Lab Phase 3                                                                                                      | `feat/lab-quality-registers` | 13 Oct 2026 | used                         |
| ADR 0312–0319            | Lab Phase 3 (spare, unused)                                                                                      | `feat/lab-quality-registers` | 13 Oct 2026 | released                     |
| migration 0150–0169      | Lab Phase 4: 0150 to 0153 used, the rest spare                                                                   | `feat/lab-connect-outward`   | 17 Oct 2026 | claimed                      |
| ADR 0312–0329            | Lab Phase 4: 0312 to 0327 used, 0328 and 0329 spare                                                              | `feat/lab-connect-outward`   | 17 Oct 2026 | claimed                      |
| migration 0154–0169      | Lab Phase 5: 0154 to 0157 used; 0158 lab catalogue codes; 0159 to 0169 spare                                     | `feat/lab-beyond-lis`        | 17 Oct 2026 | claimed                      |
| migration 0171–0172, ADR 0350–0355 | Lab test menu v2 (0171 schema, 0172 catalogue v2 = CFC v1.7)                                    | `feat/lab-test-menu-v2`      | 19 Oct 2026 | used (unapplied)             |
| ADR 0328–0345            | Lab Phase 5: 0328 to 0339 used; 0340 to 0342 taken by Mobile Tide v1 (`feat/mobile-tide-v1`); 0343 to 0345 spare | `feat/lab-beyond-lis`        | 17 Oct 2026 | claimed                      |
| migration 0178 | Lab: remove the demo (`lab_demo_remove`); 0174–0177 are taken on other branches | `feat/lab-demo-unload` | 20 Oct 2026 | used (unapplied) |

On `origin/main` (cf404abd, 11 Oct 2026) the highest migration is **0121** and the highest ADR **0280**.

**Pharmacy Phase 1** (`feat/pharmacy-dispensing`) holds migrations **0122–0146** and ADRs **0260–0279**. Used:
migrations 0122–0135 and every ADR 0260–0279. 0136–0146 stay claimed for fixes until the slice merges, then are
released.

**Resolved 11 Oct 2026:** the lab's hotfix took migration 0101 and ADR 0238 while the pharmacy branch held
unapplied files numbered 0101 and 0102; the pharmacy's became 0120 and 0121. Released by the pharmacy: migrations
0101–0117 and ADRs 0238–0241.

**Known collision:** ADR **0073** names two files: `0073-clerkship-problem-list-synthesis.md` (main) and
`0073-examination-shared-parameter-qc.md` (`origin/feat/exam-consistency-qc` only). Whoever merges that branch
renumbers its ADR.

| ADR 0360–0366            | Tide everywhere (web migration)                                | `feat/tide-everywhere`       | 21 Oct 2026 | 0360–0361 used               |
| migration 0180–0204      | Pharmacy Phase 2 (stores, wards and supply)                    | `feat/pharmacy-stores`       | 21 Oct 2026 | 0180–0182, 0184 used         |
| ADR 0370–0384            | Pharmacy Phase 2 (stores, wards and supply)                    | `feat/pharmacy-stores`       | 21 Oct 2026 | claimed                      |
| migration 0210–0229      | Pharmacy Phase 3 (clinical pharmacy and stewardship)           | `feat/pharmacy-clinical`     | 25 Oct 2026 | claimed                      |
| ADR 0390–0401            | Pharmacy Phase 3 (clinical pharmacy and stewardship)           | `feat/pharmacy-clinical`     | 25 Oct 2026 | claimed                      |
