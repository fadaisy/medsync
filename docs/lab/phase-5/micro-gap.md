# Step 10 gap report: microbiology feed, AMR export and HAI support

17 Oct 2026. Prompt Step 10 (GATE M) connects microbiology to infection prevention: isolate alerts (MB-1, MB-2), the
WHONET export (MB-3, MB-4, MB-5) and HAI support (MB-6), **only if** the microbiology module is merged and emits
`isolate_reported` events. **There is no microbiology module** in MedSync (STOP 0, row 10): no culture worklist, no
organism identification, no susceptibility entry, no isolate. Step 10 therefore stops here. **No `ipcMicroFeed` flag,
export or HAI view is written.**

## What is built and waiting

- **The IPC feed (Step 5)** evaluates alert-list entries against released results and outbreak referrals. Entries with
  organism or phenotype triggers (carbapenemase, MRSA, VRE, _C. auris_, ESBL) can be drafted and signed today; the
  workspace shows them as "Waiting for the microbiology module" and they never fire.
- **Scope `high_risk_units`** is part of the alert-entry shape; it needs the hospital's list of high-risk units, which
  the IPC lead keeps.
- **Phase 4 referrals** can already send a specimen to the national reference laboratory, which MB-2's referral of an
  isolate will reuse.
- **Surveillance** (`/ipc/surveillance`) shows "AMR export and healthcare-associated infections: Needs microbiology" and
  "No data", never 0.

## What the build will need

| Rule | Needs                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MB-1 | `isolate_reported` events: organism (coded), specimen type, phenotype flags (ESBL, carbapenemase, MRSA screen), susceptibility per drug with method and guideline                                                                                                         |
| MB-2 | The IPC lead's list of unusual resistance; isolate referral to the national reference laboratory through Phase 4; the alert shows "presumptive" and the confirmation state                                                                                                |
| MB-3 | WHONET column names and codes verified against the current WHONET documentation at build time (the research list is secondary); the field list signed by the data protection lead; names excluded unless the national surveillance plan requires them                     |
| MB-4 | The GLASS first-isolate rule (patient, specimen type, pathogen, period), applied in the aggregate view only, never to the raw export                                                                                                                                      |
| MB-5 | Hospital or community origin from the admission date and the specimen date, by the rule in the current GLASS manual, verified at build time                                                                                                                               |
| MB-6 | Positive cultures by ward and unit; device and procedure dates where the inpatient record holds them; denominators only where records exist; definitions from the national HAI surveillance plan when published, until then the IPC team adjudicates and the view says so |

## Scenarios not run

S55 (carbapenemase _K. pneumoniae_ alert on every ward, presumptive, with a referral), S56 (ESBL _E. coli_ only on a
high-risk unit), S57 (the WHONET export with admission date and per-drug results; GLASS rule only in the aggregate),
S58 (HAI "No data" where denominators are missing).

## To resume Step 10

1. Build and merge the microbiology module (its own phase): culture worklist, identification, susceptibility with
   method and guideline, and the `isolate_reported` event.
2. The IPC lead signs the organism and phenotype entries and the high-risk unit list; the data protection lead signs the
   WHONET field list.
3. Build MB-1 to MB-6 behind `ipcMicroFeed`, check the export in WHONET itself, and report STOP 10.
