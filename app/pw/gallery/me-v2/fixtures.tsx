"use client";

import { plansFrom } from "@patient-core/membership";

import { MeMembershipWeb } from "@/components/tide/v2-me-web";

/** The approved prices (ADR 0519) as the server returns them; an invented member. */
const PRICES = [
  ["plus_family", "monthly", 5000],
  ["plus_family", "yearly", 50000],
  ["plus_care", "monthly", 10000],
  ["plus_care", "yearly", 100000],
  ["family_care", "monthly", 13000],
  ["family_care", "yearly", 130000],
].map(([tier, period, amountUgx]) => ({
  tier,
  period,
  amountUgx,
  effectiveFrom: "2026-11-16",
})) as Parameters<typeof plansFrom>[0];

const QR = Array.from({ length: 21 }, (_, r) =>
  Array.from({ length: 21 }, (_, c) =>
    (r * 7 + c * 3 + ((r * c) % 5)) % 3 === 0 ? "1" : "0",
  ).join(""),
);

export function MeV2Fixtures() {
  return (
    <MeMembershipWeb
      tier="basic"
      trial={false}
      endsLabel="2026-12-16"
      trialUsed={false}
      name="Sample Member"
      memberNo="K7M 42Q X9Z"
      id={{
        emergencyContact: "Next of kin on file",
        bloodGroup: null,
        allergies: [],
        conditions: ["Diabetes"],
        hospitalLine: "Demo Hospital",
      }}
      plans={plansFrom(PRICES, "2026-11-16")}
      msisdn="0772000123"
      qrToken={async () => ({ ok: true, modules: QR, expiresAt: "2026-11-16T09:05:00Z" })}
      startTrial={async () => ({ ok: true })}
      pay={async () => ({ ok: true, view: "paid" })}
    />
  );
}
