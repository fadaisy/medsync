import "server-only";

import type { Payload } from "./signed-config";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray } from "drizzle-orm";

import { labSettings, labSignedConfigs } from "@/db/schema";
import { PAYLOADS } from "./signed-config";

/**
 * Lab settings (Lab Phase 2 §5.14, artboard 14): the hospital's lab_settings row, and for elevation and the
 * HIV algorithm the signed version in force, the lead-signed draft waiting for the CSO, and the open draft.
 * Nothing is defaulted: a missing row or version reads as null (Law 5).
 */

type Kind = "elevation" | "hiv_algorithm";
export interface ConfigSlot<K extends Kind> {
  signed: { payload: Payload<K>; inForceFrom: Date | null } | null;
  awaitingCso: { id: string; payload: Payload<K> } | null;
  draft: { id: string; payload: Payload<K> | null; authoredBy: string } | null;
}

const KEYS = { elevation: "hospital", hiv_algorithm: "serial" } as const;

export async function loadLabSettingsPage(tx: EmrTx, hospitalId: string) {
  const [settings] = await tx
    .select({
      reportEgfr: labSettings.reportEgfr,
      paymentMode: labSettings.paymentMode,
      highRiskProcedure: labSettings.highRiskProcedure,
    })
    .from(labSettings)
    .where(eq(labSettings.hospitalId, hospitalId));
  const rows = await tx
    .select()
    .from(labSignedConfigs)
    .where(
      and(
        eq(labSignedConfigs.hospitalId, hospitalId),
        inArray(labSignedConfigs.kind, ["elevation", "hiv_algorithm"]),
        inArray(labSignedConfigs.status, ["signed", "draft"]),
      ),
    )
    .orderBy(desc(labSignedConfigs.version));

  function slot<K extends Kind>(kind: K): ConfigSlot<K> {
    const mine = rows.filter((r) => r.kind === kind && r.key === KEYS[kind]);
    const parse = (p: unknown) => {
      const r = PAYLOADS[kind].safeParse(p);
      return r.success ? (r.data as Payload<K>) : null;
    };
    const signed = mine.find((r) => r.status === "signed");
    const waiting = mine.find((r) => r.status === "draft" && r.leadSignedBy);
    const open = mine.find((r) => r.status === "draft" && !r.leadSignedBy);
    const signedPayload = signed ? parse(signed.payload) : null;
    const waitingPayload = waiting ? parse(waiting.payload) : null;
    return {
      signed: signedPayload ? { payload: signedPayload, inForceFrom: signed!.inForceFrom } : null,
      awaitingCso: waitingPayload ? { id: waiting!.id, payload: waitingPayload } : null,
      draft: open
        ? { id: open.id, payload: parse(open.payload), authoredBy: open.authoredBy }
        : null,
    };
  }

  return {
    reportEgfr: settings?.reportEgfr ?? false,
    paymentMode: settings?.paymentMode ?? "off",
    highRiskProcedure: settings?.highRiskProcedure ?? null,
    elevation: slot("elevation"),
    hiv: slot("hiv_algorithm"),
  };
}
