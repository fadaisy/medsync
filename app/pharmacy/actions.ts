"use server";

import type { PatientIdentity } from "@/components/emr/orders/model";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { identitiesFor } from "@/lib/emr/read/results";
import { POINT_COOKIE, requirePharmacyActor } from "@/lib/pharmacy/actor";
import { findPrescriptions } from "@/lib/pharmacy/read";
import { requirePharmacyScope } from "@/lib/pharmacy/scope";

/**
 * Find a prescription by patient number (§5.7, D-PH0-09). A read, not a write: Zod, then the
 * pharmacy scope (auth, AAL2, pharmacy.view, the flag), then an exact match at the viewer's
 * hospital only. The number travels in the request body, never the URL (§12). An unknown number and
 * a number from another hospital give the same empty answer.
 */
const Input = z.object({ patientNumber: z.string().trim().min(1).max(40) });

export interface FoundRow {
  key: string;
  medicines: string[];
  state: string;
  writtenAtIso: string;
  from: string | null;
  patientUserId: string;
}

export async function findByPatientNumber(
  input: unknown,
): Promise<{ rows: FoundRow[]; identities: Record<string, PatientIdentity> }> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { rows: [], identities: {} };
  const scope = await requirePharmacyScope();
  const { rows } = await findPrescriptions(scope.hospitalId, parsed.data.patientNumber);
  const ids = await identitiesFor(
    scope,
    rows.map((r) => r.patientUserId),
    "pharmacy_find",
  );
  return {
    rows: rows.map((r) => ({
      key: r.key,
      medicines: r.medicines,
      state: r.state,
      writtenAtIso: r.writtenAt.toISOString(),
      from: r.from.departmentName,
      patientUserId: r.patientUserId,
    })),
    identities: Object.fromEntries(ids),
  };
}

/**
 * The acting dispensing point (5.1, D-PH1-45): remembered in a cookie, only for a point the person may
 * act at, and checked again on every write (PA2-4). Not a clinical record: no audit row.
 */
const PointInput = z.object({ pointId: z.uuid() });

export async function chooseActingPoint(input: unknown): Promise<{ ok: boolean }> {
  const parsed = PointInput.safeParse(input);
  if (!parsed.success) return { ok: false };
  const actor = await requirePharmacyActor();
  if (!actor.points.some((p) => p.id === parsed.data.pointId)) return { ok: false };
  (await cookies()).set(POINT_COOKIE, parsed.data.pointId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/pharmacy",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  refresh();
  return { ok: true };
}
