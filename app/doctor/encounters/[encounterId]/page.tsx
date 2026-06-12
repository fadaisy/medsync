import type { PatientSummary } from "@/lib/doctor/patient-access";
import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeftIcon, ClockIcon } from "lucide-react";

import { db } from "@/db";
import { encounters } from "@/db/schema/scheduling";
import { fetchPatientSummaryAudited } from "@/lib/doctor/patient-access";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { encounterEngineLive } from "@/lib/encounter/feature";
import { loadEncounterRecord } from "@/lib/encounter/record";
import { toEncounterScope } from "@/lib/encounter/workspace-scope";
import { ClerkshipForm } from "./_components/clerkship-form";

export const metadata: Metadata = { title: "Encounter · Doctor · MedSync" };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ encounterId: string }>;
}

export default async function DoctorEncounterPage({ params }: PageProps) {
  const { encounterId } = await params;
  const scope = await requireDoctorScope();

  if (!encounterEngineLive()) {
    return (
      <Wrap>
        <Note
          title="Clinical module not active"
          body="The encounter / EMR schema is applied at sign-off. The documentation surface activates then."
        />
      </Wrap>
    );
  }

  const [enc] = await db
    .select({
      patientUserId: encounters.patientUserId,
      hospitalId: encounters.hospitalId,
      encounterType: encounters.encounterType,
      state: encounters.state,
      startedAt: encounters.startedAt,
    })
    .from(encounters)
    .where(eq(encounters.id, encounterId))
    .limit(1);

  if (!enc || enc.hospitalId !== scope.hospitalId) {
    return (
      <Wrap>
        <Note
          title="Encounter unavailable"
          body="It doesn't exist, or it's outside your hospital."
        />
      </Wrap>
    );
  }

  const record = await loadEncounterRecord(encounterId, enc.patientUserId, toEncounterScope(scope));
  if (!record.ok) {
    return (
      <Wrap>
        <Note title="No access" body={record.error} />
      </Wrap>
    );
  }

  // Patient info — pulled, not typed (read-only header). Audited PHI read.
  const patient = await fetchPatientSummaryAudited({
    doctor: {
      userId: scope.userId,
      hospitalId: scope.hospitalId,
      departmentId: scope.departmentId,
    },
    patientUserId: enc.patientUserId,
    surface: "encounter_clerking_header",
  });

  const doc = record.documentation;

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <WorkspaceTopBar
        scope={scope}
        patientName={patient ? `${patient.firstName} ${patient.surname}` : null}
      />
      <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-5 px-4 py-5 lg:px-8 lg:py-6">
        {patient ? <PatientHeader patient={patient} allergies={record.allergies} /> : null}

        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-foreground text-[20px] leading-[1.1] font-medium tracking-[-0.015em]">
            {enc.encounterType} · {enc.state}
          </h1>
          <p className="text-muted-foreground font-mono text-[11px] tabular-nums">
            Started {enc.startedAt.toISOString().slice(0, 16).replace("T", " ")}
            {doc ? ` · documentation v${doc.version} (${doc.status})` : " · no documentation yet"}
          </p>
        </header>

        {/* Documentation entry — full-bleed workspace; reasoning docks as its own rail */}
        <ClerkshipForm encounterId={encounterId} initial={record.clerkship} />

        {/* Timeline */}
        <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] uppercase">
            <ClockIcon className="size-3.5" aria-hidden />
            Timeline
          </h2>
          {record.timeline.length === 0 ? (
            <p className="text-muted-foreground text-[12.5px]">No events yet.</p>
          ) : (
            <ul className="divide-border/60 -mx-2 divide-y">
              {record.timeline.map((ev) => (
                <li key={ev.id} className="flex items-baseline justify-between gap-3 px-2 py-1.5">
                  <span className="text-foreground text-[12.5px]">
                    <span className="text-muted-foreground inline-block w-[96px] font-mono text-[10px] tracking-[0.06em] uppercase">
                      {ev.kind}
                    </span>{" "}
                    {ev.label}
                  </span>
                  <span className="text-muted-foreground font-mono text-[10.5px] tabular-nums">
                    {ev.recordedAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const CADRE_LABEL: Record<string, string> = {
  INTERN_DOCTOR: "Intern Doctor",
  MEDICAL_OFFICER: "Medical Officer",
  MEDICAL_OFFICER_SG: "MO Special Grade",
  CONSULTANT: "Consultant",
  SENIOR_CONSULTANT: "Senior Consultant",
};

/** Full-bleed workspace top bar (the doctor shell chrome is hidden here). */
function WorkspaceTopBar({
  scope,
  patientName,
}: {
  scope: Awaited<ReturnType<typeof requireDoctorScope>>;
  patientName: string | null;
}) {
  return (
    <header className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b px-4 supports-backdrop-filter:backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/doctor/encounters"
          className="text-muted-foreground hover:text-foreground inline-flex shrink-0 items-center gap-1 text-[12.5px] transition-colors"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden />
          Encounters
        </Link>
        <span className="text-border hidden sm:inline" aria-hidden>
          |
        </span>
        <span className="text-foreground hidden truncate text-[13px] font-medium sm:inline">
          {patientName ?? "Clerking"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground hidden items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] uppercase lg:inline-flex">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-teal-500 ring-2 ring-teal-500/20"
          />
          <span className="max-w-[180px] truncate" title={scope.hospitalName}>
            {scope.hospitalName}
          </span>
          <span className="text-muted-foreground/70" aria-hidden>
            ·
          </span>
          <span className="max-w-[140px] truncate">{scope.departmentName}</span>
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${
            scope.isJunior
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              : "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200"
          }`}
        >
          {CADRE_LABEL[scope.cadreCode] ?? scope.cadreCode}
        </span>
        <Link
          href="/sign-out"
          className="text-muted-foreground hover:text-foreground text-[12px] transition-colors"
        >
          Sign out
        </Link>
      </div>
    </header>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 lg:py-10">
      <Link
        href="/doctor/encounters"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        Encounters
      </Link>
      {children}
    </div>
  );
}

function Note({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-border bg-card/40 text-muted-foreground rounded-xl border border-dashed p-6">
      <span className="text-foreground/80 text-[14px] font-medium">{title}</span>
      <p className="mt-1 text-[12px] leading-relaxed">{body}</p>
    </div>
  );
}

const SEX_LABEL: Record<string, string> = {
  male: "Male",
  female: "Female",
  intersex: "Intersex",
  prefer_not_say: "—",
};

/**
 * Patient info — PULLED from the record, shown read-only (no re-typing). Allergies
 * surfaced first (safety). Corrections happen on the patient record, not here.
 */
function PatientHeader({
  patient,
  allergies,
}: {
  patient: PatientSummary;
  allergies: { id: string; substance: string; severity: string | null }[];
}) {
  const age = computeAgeYears(patient.dateOfBirth);
  const anaphylaxis = allergies.some((a) => a.severity === "anaphylaxis");
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-foreground text-[15px] font-medium">
          {patient.firstName} {patient.surname}
        </span>
        <span className="text-muted-foreground font-mono text-[11.5px] tabular-nums">
          {patient.patientCode}
        </span>
        <span className="text-muted-foreground text-[12px]">
          {SEX_LABEL[patient.sex] ?? patient.sex}
          {age !== null ? ` · ${age}y` : ""}
        </span>
        <span className="text-muted-foreground/70 ml-auto font-mono text-[9.5px] tracking-[0.12em] uppercase">
          pulled · read-only
        </span>
      </div>
      <div
        className={
          allergies.length > 0
            ? "flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 ring-1 ring-amber-200/70 dark:bg-amber-950/30 dark:ring-amber-800/40"
            : "text-muted-foreground text-[12px]"
        }
      >
        <span className="font-mono text-[10px] tracking-[0.12em] text-amber-700 uppercase dark:text-amber-300">
          Allergies{anaphylaxis ? " · anaphylaxis" : ""}
        </span>
        {allergies.length === 0 ? (
          <span className="text-[12px]">None recorded</span>
        ) : (
          allergies.map((a) => (
            <span
              key={a.id}
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[11.5px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
            >
              {a.substance}
              {a.severity ? ` (${a.severity})` : ""}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function computeAgeYears(dobIso: string | null): number | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
