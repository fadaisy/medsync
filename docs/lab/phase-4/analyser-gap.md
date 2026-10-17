# Step 10 gap report: the analyser bridge

17 Oct 2026. Prompt Step 10 builds the bridge, a driver profile, Analysers (5.8) and interfaced result entry
(5.9) **only if** Q7 produced the maker's LIS interface document for the exact analyser model on site. **No
document is in hand**, so Step 10 stops here. No bridge code, driver profile or code map is written. Codes and
units come from the maker's document, never from memory (Appendix A "Mapping source").

## What is missing, and from whom

| Needed (Q7, Q8)                                                                                                                                            | From whom                                                   | State |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----- |
| The first analyser's exact model and firmware                                                                                                              | The hospital lab                                            | None  |
| The maker's LIS / host interface document for that model and firmware (ASTM E1381/E1394 or HL7 v2, with codes, units, flags and the control-sample marker) | The maker or its Ugandan distributor, asked by the hospital | None  |
| Ports and cable (RS-232 or TCP), network point                                                                                                             | The hospital lab and IT                                     | None  |
| Where the bridge runs: power, UPS, network, outbound internet, who holds the hardware                                                                      | The hospital                                                | None  |
| Recorded messages (from the document, or captured on site with patient data replaced)                                                                      | The maker, or on site                                       | None  |

## What is built and waiting

- The server side the bridge would use: pairing (`/api/exchange/pair`), tokens, the inbound endpoint, bridge
  config and heartbeat (`/api/exchange/bridge/*`), store-before-acknowledge, the outbox and dead letters (Step 8).
- `/lab/exchange/analysers`: every analyser on the equipment register reads "Waiting for {model}'s interface
  document · Typed by hand". A paired bridge shows its health (AB-13 "Not heard since").
- B1–B5 (GATE A): adopt the OpenELIS analyser bridge with a MedSync companion. Nothing is downloaded or vendored
  until the document is in hand and the bridge's licence and dependencies are reviewed (S51).

## Scenarios not run

S41–S51, including the shadow run (S50), all need the document and the analyser. No `labAnalyserBridge` flag is
added until there is code for it to guard.

## To resume Step 10

1. The hospital asks the maker or distributor for the LIS document for the exact model and firmware (Q7), and
   answers Q8.
2. Re-check H16–H20 (research) against that document.
3. Build the driver profile from the document, test against recorded messages and a serial or TCP simulator,
   run GATE S and the shadow run, then report STOP 10.
