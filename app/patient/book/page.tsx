import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import {
  appointments,
  availabilityBlocks,
  clinicianSchedulingSettings,
  departmentSchedulingPolicy,
} from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { requirePatientScope } from "@/lib/patient/scope";
import { BookingWizard } from "./_components/booking-wizard";

export const metadata: Metadata = { title: "Book · MedSync" };
export const dynamic = "force-dynamic";

export interface ClinicianOption {
  userId: string;
  fullName: string;
  departmentId: string;
  departmentName: string;
  /** Effective slot length: clinician override, else department default, else 15. */
  slotMinutes: number;
  bufferMinutes: number;
  autoConfirm: boolean;
  allowVirtual: boolean;
  /** Bookable windows (active blocks of kind='bookable') in the lookahead. */
  bookableBlocks: Array<{ startsAtIso: string; endsAtIso: string }>;
  /** Live appointments in the lookahead — used to subtract taken slots. */
  liveAppointments: Array<{ startsAtIso: string; endsAtIso: string }>;
}

const LOOKAHEAD_DAYS = 14;

export default async function PatientBookPage() {
  const scope = await requirePatientScope();

  if (!scope.primaryHospitalId) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10 sm:px-6">
        <h1 className="font-display text-foreground text-[24px] font-medium tracking-[-0.015em]">
          Set your primary hospital first
        </h1>
        <p className="text-muted-foreground text-[13.5px] leading-relaxed">
          Booking is scoped to your primary hospital. Pick one from your profile, then come back.
        </p>
        <Link
          href="/patient"
          className="text-foreground inline-flex w-fit items-center gap-1 text-[13px] underline-offset-2 hover:underline"
        >
          Back to home →
        </Link>
      </div>
    );
  }

  const clinicians = await fetchBookableClinicians(scope.primaryHospitalId);

  if (clinicians.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-10 sm:px-6">
        <h1 className="font-display text-foreground text-[24px] font-medium tracking-[-0.015em]">
          No clinicians available right now
        </h1>
        <p className="text-muted-foreground text-[13.5px] leading-relaxed">
          {scope.primaryHospitalName} hasn&apos;t set up bookable hours yet. Check back soon —
          we&apos;ll notify you when slots open.
        </p>
        <Link
          href="/patient"
          className="text-foreground inline-flex w-fit items-center gap-1 text-[13px] underline-offset-2 hover:underline"
        >
          Back to home →
        </Link>
      </div>
    );
  }

  return (
    <BookingWizard
      clinicians={clinicians}
      hospitalId={scope.primaryHospitalId}
      hospitalName={scope.primaryHospitalName ?? "your hospital"}
    />
  );
}

/* ─── Data fetch ──────────────────────────────────────────────────── */

async function fetchBookableClinicians(hospitalId: string): Promise<ClinicianOption[]> {
  // 1. Active affiliations at this hospital — that's the clinician set.
  const affiliations = await db
    .select({
      userId: staffAffiliations.userId,
      departmentId: staffAffiliations.departmentId,
      fullName: users.fullName,
      departmentName: hospitalDepartments.name,
    })
    .from(staffAffiliations)
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, ["active", "approved"]),
      ),
    )
    .orderBy(asc(hospitalDepartments.name), asc(users.fullName));

  if (affiliations.length === 0) return [];

  const clinicianIds = Array.from(new Set(affiliations.map((a) => a.userId)));
  const departmentIds = Array.from(new Set(affiliations.map((a) => a.departmentId)));

  // 2. Settings for each clinician at this hospital (default missing).
  const settings = await db
    .select({
      clinicianUserId: clinicianSchedulingSettings.clinicianUserId,
      autoConfirm: clinicianSchedulingSettings.autoConfirm,
      slotMinutes: clinicianSchedulingSettings.defaultSlotMinutes,
      bufferMinutes: clinicianSchedulingSettings.bufferMinutes,
      allowVirtual: clinicianSchedulingSettings.allowVirtual,
    })
    .from(clinicianSchedulingSettings)
    .where(
      and(
        eq(clinicianSchedulingSettings.hospitalId, hospitalId),
        inArray(clinicianSchedulingSettings.clinicianUserId, clinicianIds),
      ),
    );
  const settingsByClinician = new Map(settings.map((s) => [s.clinicianUserId, s]));

  // 3. Department defaults — used when a clinician has no settings row.
  const deptDefaults = await db
    .select({
      departmentId: departmentSchedulingPolicy.departmentId,
      slotMinutes: departmentSchedulingPolicy.defaultSlotMinutes,
      bufferMinutes: departmentSchedulingPolicy.defaultBufferMinutes,
      autoConfirm: departmentSchedulingPolicy.defaultAutoConfirm,
      allowVirtual: departmentSchedulingPolicy.allowVirtual,
    })
    .from(departmentSchedulingPolicy)
    .where(inArray(departmentSchedulingPolicy.departmentId, departmentIds));
  const deptByDeptId = new Map(deptDefaults.map((d) => [d.departmentId, d]));

  // 4. Bookable availability blocks for the lookahead window.
  const since = new Date();
  const until = new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const blocks = await db
    .select({
      clinicianUserId: availabilityBlocks.clinicianUserId,
      startsAt: availabilityBlocks.startsAt,
      endsAt: availabilityBlocks.endsAt,
    })
    .from(availabilityBlocks)
    .where(
      and(
        eq(availabilityBlocks.hospitalId, hospitalId),
        eq(availabilityBlocks.kind, "bookable"),
        eq(availabilityBlocks.state, "active"),
        inArray(availabilityBlocks.clinicianUserId, clinicianIds),
        gte(availabilityBlocks.endsAt, since),
        lt(availabilityBlocks.startsAt, until),
      ),
    )
    .orderBy(asc(availabilityBlocks.startsAt));
  const blocksByClinician = new Map<string, Array<{ startsAtIso: string; endsAtIso: string }>>();
  for (const b of blocks) {
    const list = blocksByClinician.get(b.clinicianUserId) ?? [];
    list.push({ startsAtIso: b.startsAt.toISOString(), endsAtIso: b.endsAt.toISOString() });
    blocksByClinician.set(b.clinicianUserId, list);
  }

  // 5. Live appointments to subtract.
  const liveAppts = await db
    .select({
      clinicianUserId: appointments.clinicianUserId,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.hospitalId, hospitalId),
        inArray(appointments.clinicianUserId, clinicianIds),
        inArray(appointments.status, [
          "requested",
          "pending_approval",
          "confirmed",
          "arrived",
          "in_progress",
        ]),
        gte(appointments.endsAt, since),
        lt(appointments.startsAt, until),
      ),
    );
  const apptsByClinician = new Map<string, Array<{ startsAtIso: string; endsAtIso: string }>>();
  for (const a of liveAppts) {
    const list = apptsByClinician.get(a.clinicianUserId) ?? [];
    list.push({ startsAtIso: a.startsAt.toISOString(), endsAtIso: a.endsAt.toISOString() });
    apptsByClinician.set(a.clinicianUserId, list);
  }

  // 6. Compose. One row per (clinician, department) pair — a clinician
  //    affiliated to two depts shows twice.
  return affiliations.map((a) => {
    const s = settingsByClinician.get(a.userId);
    const d = deptByDeptId.get(a.departmentId);
    return {
      userId: a.userId,
      fullName: a.fullName,
      departmentId: a.departmentId,
      departmentName: a.departmentName,
      slotMinutes: s?.slotMinutes ?? d?.slotMinutes ?? 15,
      bufferMinutes: s?.bufferMinutes ?? d?.bufferMinutes ?? 0,
      autoConfirm: s?.autoConfirm ?? d?.autoConfirm ?? false,
      allowVirtual: s?.allowVirtual ?? d?.allowVirtual ?? false,
      bookableBlocks: blocksByClinician.get(a.userId) ?? [],
      liveAppointments: apptsByClinician.get(a.userId) ?? [],
    };
  });
}
