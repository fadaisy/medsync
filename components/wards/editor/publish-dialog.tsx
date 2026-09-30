"use client";

import type { LayoutCheck } from "@/lib/wards/checks";
import type { ReconcileOutcome } from "@/lib/wards/reconcile";
import type { ReactNode } from "react";
import { AlertTriangleIcon, XIcon } from "lucide-react";

import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Button } from "@/components/ui/button";
import {
  SheetBody,
  SheetClose,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { blockingFailures, warningTexts } from "@/lib/wards/checks";
import { planSummary } from "@/lib/wards/reconcile";
import { nameList } from "@/supabase/functions/_shared/ward-layout";
import { CautionNote } from "../ui";

function Fact({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="text-body-s flex items-baseline gap-2">
      <span className="text-foreground w-8 text-right font-mono tabular-nums">{n}</span>
      <span className="text-ink-700">{children}</span>
    </li>
  );
}

/**
 * Publish, with its consequence first (ADR 0192): what happens to the bed register, the warnings that
 * will be recorded with it, and what blocks it. The server recomputes all of this and refuses if it
 * changed meanwhile.
 */
export function PublishDialog({
  open,
  onClose,
  wardName,
  bedCountNow,
  checks,
  outcome,
  pending,
  error,
  onPublish,
}: {
  open: boolean;
  onClose: () => void;
  wardName: string;
  /** The ward's registered bed count today (hospital_wards.bed_count). */
  bedCountNow: number;
  checks: LayoutCheck[];
  outcome: ReconcileOutcome;
  pending: boolean;
  error: string | null;
  onPublish: (warnings: string[]) => void;
}) {
  const blocking = blockingFailures(checks);
  const warnings = warningTexts(checks);
  const refusal = outcome.ok ? null : outcome.refusal;
  const s = outcome.ok ? planSummary(outcome.plan) : null;
  const can = !blocking.length && !refusal && !pending;
  return (
    <EditorDialog open={open} onOpenChange={(o) => !o && onClose()} width="medium">
      <SheetHeader className="relative pr-14">
        <SheetTitle>Publish the layout of {wardName}</SheetTitle>
        <SheetDescription>
          Its beds become the ward&rsquo;s bed register, and the live bed board shows this plan.
        </SheetDescription>
        <SheetClose
          render={
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Close"
              className="absolute top-4 right-4"
            />
          }
        >
          <XIcon className="size-4" />
        </SheetClose>
      </SheetHeader>
      <SheetBody className="flex flex-col gap-5">
        {blocking.length || refusal ? (
          <section className="flex flex-col gap-2" aria-labelledby="publish-blocked">
            <h3 id="publish-blocked" className="text-heading-s text-foreground">
              This can&rsquo;t be published yet
            </h3>
            {blocking.map((c) => (
              <CautionNote key={c.code}>{c.text}</CautionNote>
            ))}
            {refusal ? <CautionNote>{refusal}</CautionNote> : null}
          </section>
        ) : null}
        {s ? (
          <section className="flex flex-col gap-2" aria-labelledby="publish-register">
            <h3 id="publish-register" className="text-heading-s text-foreground">
              The bed register
            </h3>
            <ul className="flex flex-col gap-1">
              {s.added ? (
                <Fact n={s.added}>{s.added === 1 ? "bed is added" : "beds are added"}</Fact>
              ) : null}
              {s.restored ? (
                <Fact n={s.restored}>
                  {s.restored === 1
                    ? "bed comes back from the archive"
                    : "beds come back from the archive"}
                </Fact>
              ) : null}
              {s.changed ? (
                <Fact n={s.changed}>
                  {s.changed === 1 ? "bed changes" : "beds change"} (number, place, type, services
                  or status)
                </Fact>
              ) : null}
              {s.unchanged ? (
                <Fact n={s.unchanged}>
                  {s.unchanged === 1 ? "bed stays as it is" : "beds stay as they are"}
                </Fact>
              ) : null}
              {s.archived ? (
                <Fact n={s.archived}>
                  {s.archived === 1 ? "bed is archived" : "beds are archived"}:{" "}
                  {nameList(s.archivedLabels)}. Their history is kept.
                </Fact>
              ) : null}
            </ul>
            <p className="text-body-s text-ink-700">
              The ward&rsquo;s bed count goes from{" "}
              <span className="text-foreground font-mono tabular-nums">{bedCountNow}</span> to{" "}
              <span className="text-foreground font-mono tabular-nums">{s.bedCount}</span>
              {bedCountNow === s.bedCount ? " (no change)" : ""}. Emergency capacity reads this
              count.
            </p>
          </section>
        ) : null}
        <section className="flex flex-col gap-2" aria-labelledby="publish-warnings">
          <h3 id="publish-warnings" className="text-heading-s text-foreground">
            {warnings.length ? "Recorded with it" : "Checks"}
          </h3>
          {warnings.length ? (
            <>
              <ul className="flex flex-col gap-1.5">
                {warnings.map((w) => (
                  <li key={w} className="text-body-s flex items-start gap-2">
                    <AlertTriangleIcon
                      className="text-status-caution-fg-aa mt-0.5 size-3.5 shrink-0"
                      aria-label="Warning:"
                    />
                    <span className="text-foreground">{w}</span>
                  </li>
                ))}
              </ul>
              <p className="text-caption text-muted-foreground font-normal">
                Proposed checks, not signed standards: publishing goes ahead and these are recorded
                with this version.
              </p>
            </>
          ) : (
            <p className="text-body-s text-ink-700">Every proposed check passes.</p>
          )}
        </section>
        {error ? <CautionNote alert>{error}</CautionNote> : null}
      </SheetBody>
      <SheetFooter>
        <Button variant="ghost" onClick={onClose}>
          Not now
        </Button>
        <Button disabled={!can} onClick={() => onPublish(warnings)}>
          {pending
            ? "Publishing…"
            : warnings.length
              ? "Publish with these warnings"
              : "Publish layout"}
        </Button>
      </SheetFooter>
    </EditorDialog>
  );
}
