import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeftIcon, ClockIcon } from "lucide-react";

import { db } from "@/db";
import { encounters } from "@/db/schema/scheduling";
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

  const doc = record.documentation;

  return (
    <Wrap>
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          Encounter
        </span>
        <h1 className="font-display text-foreground text-[24px] leading-[1.1] font-medium tracking-[-0.015em]">
          {enc.encounterType} · {enc.state}
        </h1>
        <p className="text-muted-foreground font-mono text-[11.5px] tabular-nums">
          Started {enc.startedAt.toISOString().slice(0, 16).replace("T", " ")}
          {doc ? ` · documentation v${doc.version} (${doc.status})` : " · no documentation yet"}
        </p>
      </header>

      {/* Documentation entry */}
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
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-8 lg:py-10">
      <Link
        href="/doctor/patients"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-[12.5px] transition-colors"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden />
        Patients
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
