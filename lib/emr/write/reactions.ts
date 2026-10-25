import { randomUUID } from "node:crypto";
import type { EmrTx } from "@/lib/emr/db";

import { allergies } from "@/db/schema";
import { encrypt } from "@/lib/encryption";

/**
 * Pharmacy Phase 3 (AR-2, D-PH3-13): a suspected reaction enters the single allergy record as unconfirmed, type not
 * known, criticality unable to assess. The pharmacy never writes a clinical table itself (Phase 1 Law 2); this
 * EMR writer does, inside the reaction's transaction. Prescribing reads unconfirmed entries at the same level as
 * confirmed ones (lib/emr/allergy.ts); only a prescriber confirms or refutes it, as a new version (recordAllergy).
 */
export async function insertSuspectedAllergy(
  tx: EmrTx,
  input: {
    hospitalId: string;
    patientUserId: string;
    actorUserId: string;
    actorCadre: string;
    /** The catalogue medicine id; or the name typed, kept as text that prescribing still matches by name. */
    medicineId: string | null;
    text: string;
    manifestation: string | null;
    now: Date;
    clientKey: string;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.insert(allergies).values({
    id,
    logicalId: id,
    hospitalId: input.hospitalId,
    patientUserId: input.patientUserId,
    effectiveAt: input.now,
    recordedAt: input.now,
    recordedByUserId: input.actorUserId,
    authorCadre: input.actorCadre,
    source: "clinician",
    trust: 3,
    status: "final",
    sensitivity: "standard",
    substanceKind: input.medicineId ? "drug_ingredient" : null,
    substanceCode: input.medicineId,
    // The words always travel too, so the name matcher catches a code the formulary does not know.
    substanceTextCiphertext: encrypt(input.text),
    category: "medication",
    criticality: "unable_to_assess",
    manifestations:
      input.manifestation && input.manifestation !== "gastrointestinal"
        ? [input.manifestation]
        : [],
    verification: "unconfirmed",
    informant: "clinician_observed",
    clientKey: input.clientKey,
  });
  return id;
}
