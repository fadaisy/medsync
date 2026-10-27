import type { EmrDb } from "@/lib/emr/db";

import { fill, PHWS2 } from "@/content/pharmacy-workspace-v2";
import { db } from "@/db";
import { pharmacyChecksState } from "@/lib/pharmacy/check-state";
import { interactionsStateFor } from "@/lib/pharmacy/clinical/read";
import { pharmacyInteractionsLiveFor } from "@/lib/pharmacy/feature";
import { PharmacyNotice } from "../pharmacy-notice";
import { LimitsLineView } from "./pieces";

const L = PHWS2.limits;

/** The words of the limits line from the signed state (D-PW-08); pure, so the test reads the same sentence. */
export function limitsText(pairs: number | null, refs: { signed: number; total: number } | null) {
  const p = !pairs ? L.pairsNone : pairs === 1 ? L.pairsOne : fill(L.pairs, { n: pairs });
  const d = refs && refs.signed > 0 ? fill(L.doses, { n: refs.signed, total: refs.total }) : L.dosesNone;
  return fill(L.line, { pairs: p, doses: d });
}

/**
 * The limits line (D-PW-08): the same state the Phase 1 notice reads (`pharmacyChecksState`, the signed pairs in
 * force), as one line; the full notice is one click away, unchanged.
 */
export async function LimitsLine({
  hospitalId,
  text,
  linkLabel,
  href,
}: {
  hospitalId: string;
  /** A place's own sentence (Clinical); default, the checks sentence. */
  text?: string;
  linkLabel?: string;
  href?: string;
}) {
  const ix = await interactionsStateFor(
    db as unknown as EmrDb,
    hospitalId,
    pharmacyInteractionsLiveFor(hospitalId),
  );
  const pairs = ix.state === "partial" ? ix.pairs : null;
  const refs = pharmacyChecksState(hospitalId).doseReferences;
  return (
    <LimitsLineView
      text={text ?? limitsText(pairs, refs)}
      linkLabel={linkLabel}
      href={href}
      notice={<PharmacyNotice hospitalId={hospitalId} pairs={pairs} />}
    />
  );
}
