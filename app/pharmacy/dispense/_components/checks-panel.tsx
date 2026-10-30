"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { LabButton } from "@/components/tide/work/button";
import { RX_CHECKS } from "@/content/pharmacy-rework-daily";
import { cn } from "@/lib/utils";
import { answerCheck } from "../../review-actions";

const T = RX_CHECKS;

export interface PanelLine {
  id: string;
  name: string;
  checks: { code: string; title: string; level: "stop" | "check"; answer: string | null }[];
}
type Answer = { answer: "checked" | "prescriber_confirmed" | "query"; reason: string | null };

/**
 * The checks panel (rework PRD §6.2): each check the prescriber was warned about, answered by the pharmacist before
 * the line is handed over. A stop takes only "Prescriber confirmed"; "Talk to the prescriber" holds the line.
 */
export function ChecksPanel({ lines, answers }: { lines: PanelLine[]; answers: Record<string, Answer> }) {
  const flagged = lines.filter((l) => l.checks.length);
  const open = flagged.flatMap((l) => l.checks.filter((c) => !gives(c.level, answers[`${l.id}:${c.code}`])));
  return (
    <section aria-labelledby="rx-checks" className="bg-card shadow-tide-card flex flex-col gap-3 rounded-[18px] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rx-checks" className="text-heading-s">
          {T.title}
        </h2>
        {open.length ? (
          <span className="text-body-s text-ink-700">{T.blocked.replace("{n}", String(open.length))}</span>
        ) : null}
      </div>
      {flagged.length ? (
        <>
          <p className="text-body-s text-ink-600">{T.lead}</p>
          <ul className="flex flex-col gap-2">
            {flagged.flatMap((l) =>
              l.checks.map((c) => (
                <Flag key={`${l.id}:${c.code}`} line={l} check={c} answer={answers[`${l.id}:${c.code}`]} />
              )),
            )}
          </ul>
        </>
      ) : (
        <p className="text-body-s text-ink-600">{T.none}</p>
      )}
    </section>
  );
}

const gives = (level: "stop" | "check", a: Answer | undefined) =>
  !!a && a.answer !== "query" && (level !== "stop" || a.answer === "prescriber_confirmed");

function Flag({ line, check, answer }: { line: PanelLine; check: PanelLine["checks"][number]; answer?: Answer }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const send = (a: Answer) =>
    start(async () => {
      setError(null);
      const r = await answerCheck({ lineId: line.id, code: check.code, ...a });
      if (!r.ok) return setError(r.error);
      setChoosing(false);
      router.refresh();
    });
  const stop = check.level === "stop";
  return (
    <li className="bg-tide-sunken flex flex-col gap-2 rounded-[14px] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-[6px] px-1.5 text-[12px] leading-5 font-semibold",
            stop ? "bg-status-critical-bg text-red-800" : "bg-card text-ink-800",
          )}
        >
          {T.level[check.level]}
        </span>
        <span className="font-semibold">
          {line.name}: {check.title}
        </span>
      </div>
      {check.answer ? (
        <p className="text-body-s text-ink-600">{T.prescriberSaid.replace("{answer}", check.answer)}</p>
      ) : null}
      {answer ? (
        <p className="text-body-s text-ink-700">
          {answer.answer === "checked"
            ? T.answered.checked.replace("{reason}", answer.reason ?? "")
            : T.answered[answer.answer]}
          {answer.answer === "query" ? ` ${T.queryNext}` : null}
        </p>
      ) : null}
      {choosing ? (
        <div role="group" aria-label={T.answers.checked} className="flex flex-wrap gap-2">
          {T.reasons.map((r) => (
            <LabButton key={r} variant="secondary" busy={pending} onClick={() => send({ answer: "checked", reason: r })}>
              {r}
            </LabButton>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {stop ? null : (
            <LabButton variant="secondary" busy={pending} onClick={() => setChoosing(true)}>
              {T.answers.checked}
            </LabButton>
          )}
          <LabButton
            variant="secondary"
            busy={pending}
            onClick={() => send({ answer: "prescriber_confirmed", reason: null })}
          >
            {T.answers.prescriber_confirmed}
          </LabButton>
          <LabButton variant="quiet" busy={pending} onClick={() => send({ answer: "query", reason: null })}>
            {T.answers.query}
          </LabButton>
        </div>
      )}
      {stop && !answer ? <p className="text-body-s text-ink-600">{T.stopOnly}</p> : null}
      {error ? (
        <p role="alert" className="text-body-s text-foreground font-semibold">
          {error}
        </p>
      ) : null}
    </li>
  );
}
