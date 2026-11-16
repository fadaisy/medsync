# GATE A · Amendment 1: care programmes cost money; safety stays free

Status: **signed by Fadhul (CSO and owner), in chat, 16 Nov 2026** ("lets sign off what needs to be signed"). The owner approved this in chat on 16 Nov 2026 ("continue the build with your recommendations"). Code is built behind `careMode`, which stays off in production until Gate CG.

## What changes

| Signed before                                                              | Amended to                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MR9: no entitlement changes "the care team's ability to reach the patient" | No entitlement or payment changes **safety**: danger alerts reaching the team, Help, danger flows, results, the plan, readings and ticks. A paid care programme buys the team's **proactive** work: check-ins, messages from the team, reviews, sessions |
| D-MR-08: Care mode features (readings, plan, danger) free                  | These stay free. **New:** care programmes with a team are paid. Each is priced from its team by the hospital and approved by a second person (ADR 0519)                                                                                                  |
| D-MR-08 Plus prices: 3,000, 5,000, 7,000 a month                           | Draft: Plus Family 5,000; Plus Care 10,000; Family + Care 13,000 a month, with quarterly (5% off) and yearly (10 months) plans. Programme members get Plus Care within their programme                                                                   |

## What the code already holds

- **Alerts:** `care_raise_alert` never reads payment. A test raises an alert for an unpaid enrolment.
- **Patient messages:** sending is never gated. Out of hours, one automatic reply points to Help.
- **Programme names:** a name like "Premium" or "Gold" is refused by the database.

## Signature

☐ Signed by: **\*\***\_\_**\*\*** (CSO) · Date: **\_\_**
