import type { Metadata } from "next";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { listAssignedEncountersForDoctor } from "@/lib/encounter/assignment";
import { encounterEngineLive } from "@/lib/encounter/feature";
import { AssignedRow } from "./_components/assigned-row";

export const metadata: Metadata = { title: "Assigned · Doctor · MedSync" };
export const dynamic = "force-dynamic";

export default async function DoctorAssignedPage() {
  const scope = await requireDoctorScope();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 lg:py-10">
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          Assigned to you
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.1] font-medium tracking-[-0.015em]">
          Patients waiting to be seen
        </h1>
        <p className="text-muted-foreground text-[12.5px]">
          Triaged patients assigned to you. Start the encounter to open the clerking, or hand it to
          a colleague.
        </p>
      </header>

      {!encounterEngineLive() ? (
        <Note
          title="Clinical module not active"
          body="Assignments appear here once the encounter module is enabled."
        />
      ) : (
        <AssignedList doctorUserId={scope.userId} hospitalId={scope.hospitalId} />
      )}
    </div>
  );
}

async function AssignedList({
  doctorUserId,
  hospitalId,
}: {
  doctorUserId: string;
  hospitalId: string;
}) {
  const rows = await listAssignedEncountersForDoctor({ doctorUserId, hospitalId });
  if (rows.length === 0) {
    return <Note title="Nothing waiting" body="No patients are currently assigned to you." />;
  }
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <AssignedRow key={r.encounterId} row={r} />
      ))}
    </ul>
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
