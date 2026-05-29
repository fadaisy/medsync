import type { Metadata } from "next";
import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { hospitalWards } from "@/db/schema/hospital-wards";
import { shiftHandovers } from "@/db/schema/nurse-workspace";
import { users } from "@/db/schema/users";
import { requireNurseScope } from "@/lib/nurse/scope";
import { HandoverForm } from "./_components/handover-form";

export const metadata: Metadata = { title: "Handover · Nurse · MedSync" };
export const dynamic = "force-dynamic";

const SHIFT_LABEL: Record<string, string> = {
  day: "Day shift",
  evening: "Evening shift",
  night: "Night shift",
  custom: "Custom",
};

export default async function NurseHandoverPage() {
  const scope = await requireNurseScope();

  const [wards, recent] = await Promise.all([
    db
      .select({ id: hospitalWards.id, name: hospitalWards.name })
      .from(hospitalWards)
      .where(and(eq(hospitalWards.hospitalId, scope.hospitalId), eq(hospitalWards.state, "active")))
      .orderBy(asc(hospitalWards.name)),
    db
      .select({
        id: shiftHandovers.id,
        wardId: shiftHandovers.wardId,
        wardName: hospitalWards.name,
        shiftLabel: shiftHandovers.shiftLabel,
        summary: shiftHandovers.summary,
        submittedAt: shiftHandovers.submittedAt,
        submittedByName: users.fullName,
      })
      .from(shiftHandovers)
      .leftJoin(hospitalWards, eq(hospitalWards.id, shiftHandovers.wardId))
      .leftJoin(users, eq(users.id, shiftHandovers.submittedByUserId))
      .where(eq(shiftHandovers.hospitalId, scope.hospitalId))
      .orderBy(desc(shiftHandovers.submittedAt))
      .limit(15),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-8 lg:py-10">
      <header className="flex flex-col gap-2">
        <span className="text-muted-foreground inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
          <span aria-hidden className="size-1 rounded-full bg-teal-500 ring-2 ring-teal-500/20" />
          {scope.hospitalName} · Handover
        </span>
        <h1 className="font-display text-foreground text-[26px] leading-tight font-medium tracking-[-0.015em]">
          Shift handover
        </h1>
        <p className="text-muted-foreground max-w-[60ch] text-[12.5px]">
          What does the next shift need to know? Submit a handover for your ward — every submission
          is audited and visible to nursing + medical staff at the hospital.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Submit */}
        <section className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5">
          <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
            Submit handover
          </h2>
          <HandoverForm wards={wards} />
        </section>

        {/* Recent handovers */}
        <aside className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
          <h2 className="text-muted-foreground font-mono text-[10.5px] tracking-[0.14em] uppercase">
            Recent · {recent.length}
          </h2>
          {recent.length === 0 ? (
            <p className="text-muted-foreground text-[12.5px]">No handovers yet.</p>
          ) : (
            <ul className="divide-border/60 -mx-2 flex flex-col divide-y">
              {recent.map((h) => (
                <li key={h.id} className="flex flex-col gap-1 px-2 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-foreground text-[12.5px] font-medium">
                      {h.wardName ?? "Ward"} · {SHIFT_LABEL[h.shiftLabel] ?? h.shiftLabel}
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px] tabular-nums">
                      {formatRelative(h.submittedAt.toISOString())}
                    </span>
                  </div>
                  <span className="text-muted-foreground text-[11.5px] leading-relaxed">
                    {h.submittedByName ?? "—"}
                  </span>
                  <p className="text-foreground/90 line-clamp-3 text-[12px] leading-relaxed">
                    {h.summary}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function formatRelative(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
