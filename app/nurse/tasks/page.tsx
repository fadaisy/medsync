import type { TaskView } from "./_components/task-list";
import type { NurseTaskRow } from "@/lib/emr/read/nursing";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";

import { fill } from "@/content/lab-workspace-v2";
import { NURSE_TASKS_COPY as C } from "@/content/nurse-tasks";
import { db } from "@/db";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { formatClock } from "@/lib/emr/charts/scale";
import { asClinicalReader } from "@/lib/emr/db";
import { nurseTasksLiveFor } from "@/lib/emr/feature";
import { loadNurseTasks } from "@/lib/emr/read/nursing";
import { requireNurseScope } from "@/lib/nurse/scope";
import { TaskList } from "./_components/task-list";

export const metadata: Metadata = { title: "Tasks · Nurse · MedSync" };
export const dynamic = "force-dynamic";

type Payload = { drugs?: string[]; first?: string; test?: string; unit?: string };

function titleOf(t: NurseTaskRow): string {
  const p = t.payload as Payload;
  if (t.type === "iv_cannula") return C.ivTitle;
  if (t.type === "enter_result") return fill(C.resultTitle, { test: p.test ?? "" });
  return t.type;
}

function whyOf(t: NurseTaskRow): string | null {
  const p = t.payload as Payload;
  if (t.type !== "iv_cannula") return null;
  return fill(C.ivWhy, {
    names: (p.drugs ?? []).join(", "),
    first: p.first === "next_round" ? C.firstNextRound : C.firstNow,
  });
}

function resultOf(t: NurseTaskRow): string {
  const o = (t.outcome ?? {}) as { size?: string; site?: string };
  return o.size && o.site ? fill(C.ivResult, { size: o.size, site: o.site }) : C.done;
}

/** Nurse tasks (prescribing kit P2 (b), F5): what the prescriptions asked the nurses to do. */
export default async function NurseTasksPage() {
  const scope = await requireNurseScope();
  if (!nurseTasksLiveFor(scope.hospitalId)) notFound();
  const { open, done } = await asClinicalReader(
    { userId: scope.userId, hospitalId: scope.hospitalId },
    (tx) => loadNurseTasks(tx, scope.hospitalId),
  );
  const ids = [...new Set([...open, ...done].map((t) => t.patientUserId))];
  const codes = new Map(
    ids.length
      ? (
          await db
            .select({ id: patientProfiles.id, code: patientProfiles.patientCode })
            .from(patientProfiles)
            .where(inArray(patientProfiles.id, ids))
        ).map((r) => [r.id, r.code])
      : [],
  );
  const view = (t: NurseTaskRow): TaskView => ({
    id: t.id,
    type: t.type,
    patientUserId: t.patientUserId,
    patient: codes.get(t.patientUserId) ?? "",
    title: titleOf(t),
    why: whyOf(t),
    asked: fill(C.asked, { at: formatClock(t.createdAt), by: C.byPrescriber }),
    unit: (t.payload as Payload).unit ?? null,
    doneLine:
      t.status === "done" && t.doneAt
        ? fill(C.doneLine, {
            title: titleOf(t),
            patient: codes.get(t.patientUserId) ?? "",
            result: resultOf(t),
            at: formatClock(t.doneAt),
          })
        : null,
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1.5">
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.16em] uppercase">
          {C.kicker}
        </span>
        <h1 className="font-display text-display-s text-foreground">{C.title}</h1>
        <p className="text-muted-foreground text-body-s max-w-[60ch]">{C.sub}</p>
      </header>
      <TaskList open={open.map(view)} done={done.map(view)} />
    </div>
  );
}
