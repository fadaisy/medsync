import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

import { requireDoctorScope } from "@/lib/doctor/scope";
import { listDoctorEncounters } from "@/lib/encounter/assignment";
import { encounterEngineLive } from "@/lib/encounter/feature";

export const metadata: Metadata = { title: "Encounters · Doctor · MedSync" };
export const dynamic = "force-dynamic";

/**
 * The doctor's encounters list — open + recent (started) encounters, each a link
 * into its clerking. The `planned` inbound queue lives on /doctor/assigned.
 */
export default async function DoctorEncountersPage() {
  const scope = await requireDoctorScope();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 lg:py-10">
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          Encounters
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.1] font-medium tracking-[-0.015em]">
          Open &amp; recent encounters
        </h1>
        <p className="text-muted-foreground text-[12.5px]">
          Encounters you&apos;ve started — open one to continue the clerking. New assignments to
          start are on{" "}
          <Link href="/doctor/assigned" className="text-foreground underline underline-offset-4">
            Assigned
          </Link>
          .
        </p>
      </header>

      {!encounterEngineLive() ? (
        <Note
          title="Clinical module not active"
          body="Encounters appear here once the encounter module is enabled."
        />
      ) : (
        <EncounterList doctorUserId={scope.userId} hospitalId={scope.hospitalId} />
      )}
    </div>
  );
}

async function EncounterList({
  doctorUserId,
  hospitalId,
}: {
  doctorUserId: string;
  hospitalId: string;
}) {
  const rows = await listDoctorEncounters({ doctorUserId, hospitalId });
  if (rows.length === 0) {
    return (
      <Note
        title="No encounters yet"
        body="Start one from Assigned → Start encounter; it will appear here while it's open."
      />
    );
  }
  return (
    <ul className="border-border divide-border/60 flex flex-col divide-y overflow-hidden rounded-xl border">
      {rows.map((r) => (
        <li key={r.encounterId}>
          <Link
            href={`/doctor/encounters/${r.encounterId}`}
            className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3 transition-colors"
          >
            <span className="text-foreground min-w-0 flex-1 truncate text-[13px] font-medium">
              {r.patientCode ?? "Patient"}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] uppercase ${
                r.state === "in_progress"
                  ? "bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {r.state === "in_progress" ? "Open" : r.state}
            </span>
            <span className="text-muted-foreground hidden font-mono text-[10.5px] tabular-nums sm:inline">
              {r.encounterType} · {r.startedAtIso.slice(0, 16).replace("T", " ")}
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </Link>
        </li>
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
