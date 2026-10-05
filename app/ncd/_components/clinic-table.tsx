"use client";

import type { ClinicRow } from "@/lib/ncdreg/read/views";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { REVIEW_LABELS } from "@/lib/ncdreg/read/derive";
import { cn } from "@/lib/utils";
import { ConditionTags, fmtTime, Num, StageLabel } from "./kit";
import { useOutbox } from "./outbox-provider";

/** Today's clinic table (B8): roomy rows, stage with icon and word, a dash where a value does not apply. */
export function ClinicTable({
  rows,
  date,
  today,
  canEnrol,
  timeZone,
}: {
  rows: ClinicRow[];
  date: string;
  today: string;
  canEnrol: boolean;
  timeZone: string;
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? rows.filter(
          (r) =>
            r.identity.name.toLowerCase().includes(s) ||
            r.identity.registryNumber.toLowerCase().includes(s),
        )
      : rows;
  }, [q, rows]);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="border-input focus-within:shadow-focus flex h-9 min-w-[240px] items-center gap-2 rounded-lg border px-2.5">
          <SearchIcon className="text-ink-500 size-4" aria-hidden />
          <span className="sr-only">Filter the clinic list</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or registry number"
            className="text-body-s flex-1 bg-transparent outline-none"
          />
        </label>
        <span className="text-caption text-muted-foreground ml-auto">{shown.length} patients</span>
      </div>
      <div className="border-border overflow-x-auto border-y">
        <table className="w-full min-w-[960px] border-collapse text-[14px]">
          <caption className="sr-only">Patients expected or seen on {date}</caption>
          <thead>
            <tr className="text-ink-600 border-border border-b text-left text-[13px]">
              {[
                "Patient",
                "Conditions",
                "Stage",
                "Arrived",
                "Last blood pressure",
                "Last glucose",
                "Review due",
                "",
              ].map((h) => (
                <th key={h} scope="col" className="h-11 px-3.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Row key={r.personId} r={r} date={date} today={today} timeZone={timeZone} />
            ))}
            {canEnrol && date === today ? (
              <tr>
                <td colSpan={8} className="h-14 px-3.5">
                  <Link
                    href="/ncd/enrol?walkin=1"
                    className={cn(buttonVariants({ variant: "ghost" }), "gap-2")}
                  >
                    <PlusIcon aria-hidden />
                    Add a walk-in patient
                  </Link>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({
  r,
  date,
  today,
  timeZone,
}: {
  r: ClinicRow;
  date: string;
  today: string;
  timeZone: string;
}) {
  const { submit } = useOutbox();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const arrive = () =>
    start(async () => {
      const visitId = crypto.randomUUID();
      const res = await submit("visit.arrive", {
        visitId,
        personId: r.personId,
        appointmentId: r.appointmentId,
        visitType: r.walkIn ? "unscheduled" : "scheduled",
      });
      if (!res.ok) setErr("message" in res ? res.message : "Not saved");
      else router.push(`/ncd/visit/${visitId}`);
    });
  return (
    <tr className="border-border hover:bg-ink-25 border-b last:border-b-0">
      <td className="h-14 px-3.5">
        <Link
          href={`/ncd/patients/${r.personId}`}
          className="flex flex-col focus-visible:underline"
        >
          <span className="text-foreground font-medium">{r.identity.name}</span>
          <Num className="text-muted-foreground text-[12px]">{r.identity.registryNumber}</Num>
        </Link>
      </td>
      <td className="px-3.5">
        <ConditionTags conditions={r.conditions} />
      </td>
      <td className="px-3.5">
        <StageLabel stage={r.stage} />
        {r.walkIn ? <span className="text-muted-foreground ml-2 text-[12px]">Walk-in</span> : null}
      </td>
      <td className="px-3.5">
        {r.arrivedAt ? (
          <Num>{fmtTime(r.arrivedAt, timeZone)}</Num>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </td>
      <td className="px-3.5">
        {r.lastBp ? (
          <span className="inline-flex flex-col">
            <Num>{r.lastBp}</Num>
            {r.lastBpTone === "out" ? (
              <span className="text-ink-600 text-[12px]">140/90 or above</span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </td>
      <td className="px-3.5">
        {r.glucoseApplies && r.lastGlucose ? (
          <Num>{r.lastGlucose}</Num>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </td>
      <td className="px-3.5">
        <span className="flex flex-wrap gap-1">
          {r.reviewDue.length ? (
            r.reviewDue.map((c) => (
              <span
                key={c}
                className="border-ink-200 text-ink-700 inline-flex h-6 items-center rounded-md border px-2 text-[12px]"
              >
                {REVIEW_LABELS[c as keyof typeof REVIEW_LABELS]} due
              </span>
            ))
          ) : (
            <span className="text-muted-foreground">–</span>
          )}
        </span>
      </td>
      <td className="px-3.5 text-right">
        {r.stage === "not_arrived" && date === today ? (
          <Button variant="secondary" size="md" onClick={arrive} disabled={pending}>
            Mark arrived
          </Button>
        ) : r.visitId ? (
          <Link
            href={`/ncd/visit/${r.visitId}`}
            className={buttonVariants({ variant: r.stage === "closed" ? "ghost" : "secondary" })}
          >
            {r.stage === "closed" ? "View visit" : "Open visit"}
          </Link>
        ) : null}
        {err ? (
          <p role="alert" className="text-ink-800 mt-1 text-[12px]">
            {err}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
