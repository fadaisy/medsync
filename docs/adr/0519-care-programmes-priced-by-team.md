# 0519 — Care programmes are priced by their team; safety is never priced

Date: 2026-11-16 · Status: accepted by the owner in chat ("continue the build with your recommendations"). The change to MR9 and D-MR-08 below needs the CSO's signature (`docs/patient-app/gate-a-amendment-1.md`).

## Decision

- **Pricing a programme:** the hospital defines each care programme by its condition and its team (roles, each with monthly cost and caseload). The price is worked out once, in `supabase/functions/_shared/care-pricing.ts`:
  - monthly price = cost per member ÷ (1 − margin − collection fee), rounded up to UGX 1,000;
  - a quarter costs 3 months less 5%;
  - a year costs 10 months.
- **Approval:** a second person approves each programme and add-on (four-eyes), like the fee bands.
- **Names:** programmes are named by condition and team, never by rank. Words such as "premium" and "gold" are refused, following the medical council's advertising rules.
- **Money:** the hospital employs the team and receives the fee. Tether's platform share, UGX 9,000 a member-month or 20% after the collection fee (whichever is higher, never above half the fee), is recorded on the bill and paid by the provider's split at settlement (ADR 0516).
- **What a paid period switches on:** proactive work: check-ins, team messages, reviews, sessions.
- **What stays free, paid or not:** danger alerts reaching the team, Help, the danger flows, results, the plan, readings and medicine ticks.
- **Plus draft prices** (server-held, hidden until approved):

  | Tier          | Monthly (UGX) |
  | ------------- | ------------- |
  | Plus Family   | 5,000         |
  | Plus Care     | 10,000        |
  | Family + Care | 13,000        |

  Each also has quarterly and yearly prices. Programme members get Plus Care within their programme.

## Why

A patient with a care team cannot be served profitably at UGX 3,000 a month. The cost is mostly the team's time, which differs by programme: a nurse-led blood pressure programme costs far less than an insulin programme with a specialist and a nutritionist. Pricing from the team keeps every programme above cost and lets a hospital add roles as a patient's needs grow. Keeping safety free keeps faith with the rule that money never decides who is kept safe. The research and the projections are in `docs/patient-app/business-model.md` and the projection page.
