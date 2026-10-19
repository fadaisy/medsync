import type { identitiesFor } from "@/lib/emr/read/results";
import type { repeatTasks } from "@/lib/lab/qc-store";
import Link from "next/link";

import { analyteName } from "@/lib/lab/qc-store";
import { dateWords, timeWords } from "../_lib/days";
import { RepeatDone } from "./repeat-done";

/** LB-3: "Repeat when QC passes" decisions whose QC now passes, each with two identifiers (Law 12). */
export function RepeatTasks({
  tasks,
  ids,
  base,
}: {
  /** Where "Open the result" goes: the old result page or the bench. */
  base: string;
  tasks: Awaited<ReturnType<typeof repeatTasks>>;
  ids: Awaited<ReturnType<typeof identitiesFor>>;
}) {
  return (
    <section
      aria-labelledby="repeats"
      className="border-border bg-card text-body-s mx-4 mt-4 flex flex-col gap-2 rounded-lg border p-4 sm:mx-6"
    >
      <h2 id="repeats" className="text-heading-s font-medium">
        Repeat when QC passes ({tasks.length})
      </h2>
      <ul className="flex flex-col gap-3">
        {tasks.map((t) => {
          const who = ids.get(t.patientUserId);
          const label = `${who?.name ?? "Name withheld"}, ${analyteName(t.conceptId ?? "")}`;
          return (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-3">
              <span className="flex flex-col">
                <span>{who?.name ?? "Name withheld"}</span>
                <span className="text-caption text-muted-foreground font-mono">
                  {who?.mrn ?? "MRN not found"}
                </span>
              </span>
              <span className="flex flex-col">
                <span>
                  {analyteName(t.conceptId ?? "")} {t.value} · {t.number}
                </span>
                <span className="text-caption text-muted-foreground">
                  Released {dateWords(t.releasedAt)} {timeWords(t.releasedAt)}
                </span>
              </span>
              {t.orderId ? (
                <Link
                  href={`${base}/${t.orderId}`}
                  className="font-medium text-teal-700 underline-offset-4 hover:underline"
                >
                  Open the result<span className="sr-only">: {label}</span>
                </Link>
              ) : null}
              <RepeatDone itemId={t.id} label={label} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
