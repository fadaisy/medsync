# Step 9 gap report: a partner's electronic connection

17 Oct 2026. Prompt Step 9 builds a partner's FHIR R4 Task connection **only if** Q6 found a partner with an
interface document, a test environment and a signed agreement. **None of the three is in hand**, so Step 9 stops
here. Paper and typed entry (Steps 4–7) are the path for every partner today.

## What is missing, and from whom

| Needed                                                  | From whom                                          | State                     |
| ------------------------------------------------------- | -------------------------------------------------- | ------------------------- |
| A reference lab willing to exchange electronically      | The hospital (lab lead), from the Q3 referral book | Not asked (Q6, owner)     |
| Its interface document (FHIR R4 Task, or what it uses)  | That lab                                           | None                      |
| A test environment with test credentials                | That lab                                           | None                      |
| A signed data-sharing agreement; legal record (PT-2..4) | The hospital's data protection lead and that lab   | None                      |
| GATE S review of its endpoint and credentials (S40)     | Owner and CSO                                      | Not started (no endpoint) |

## What is built and waiting (tested against the simulator only)

- `lib/exchange/adapter.ts` (`fhirReceive`) and `lib/emr/fhir.ts` (`referralBundle`, `checkR4Structure`): the
  outgoing Bundle carries only the fields on the signed field list; incoming Task statuses and results are read.
- The exchange core of Step 8: pairing, tokens, store-before-acknowledge, EX-7, MA-1, back-to-file, the outbox.
- `tests/emr-db/lab-exchange.test.ts`: S37 and S38 pass against a simulated partner. **They do not count as S37
  and S38 against a partner's test environment**, which the prompt requires.

## What stays off

- No partner endpoint, URL or credential is configured. The outbox cron sends with an "unavailable" transport,
  so nothing leaves the hospital.
- A partner sender can be paired, but enabling it needs the partner's signed legal record (PT-4).
- S39 (disable stops sending at once) is covered for inbound by S36 (revoke). The outbound half waits for a real
  transport.

## To resume Step 9

1. The lab lead names a reference lab that offers an interface (Q6), with its document and test environment.
2. The data protection lead records and signs the legal record and the field list at `/referral-governance`.
3. A transport for that partner replaces "unavailable" in `app/api/cron/exchange-outbox/route.ts`. Its
   credentials go in the secrets store, never the repo.
4. GATE S is run on the endpoint, then S37–S40 against the partner's test environment, and STOP 9 is reported.
