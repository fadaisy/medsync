"use client";

import { useEffect } from "react";

import { recordPrescriptionPrint } from "@/lib/emr/actions/pharmacy-queries";

/**
 * D-PH1-49 (gate-a-proposal §1 W3, ADR 0278): when the page is printed, one
 * `prescription_print_events` row per printed line. `beforeprint` only: opening the page is not a
 * print. Renders nothing, so the paper is unchanged. A failed write never stops the print.
 */
export function PrintRecord({
  patientUserId,
  encounterId,
  prescriptionIds,
}: {
  patientUserId: string;
  encounterId: string;
  prescriptionIds: readonly string[];
}) {
  const ids = prescriptionIds.join(",");
  useEffect(() => {
    const onPrint = () =>
      void recordPrescriptionPrint({
        surface: "doctor",
        patientUserId,
        encounterId,
        prescriptionIds: ids.split(","),
      }).catch(() => undefined);
    window.addEventListener("beforeprint", onPrint);
    return () => window.removeEventListener("beforeprint", onPrint);
  }, [patientUserId, encounterId, ids]);
  return null;
}
