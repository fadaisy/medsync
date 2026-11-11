"use client";

import type { Ctx } from "./index";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";

import { signGoLiveAction } from "@/app/pharmacy/setup/setup-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { Pill } from "@/components/tide/work/kit";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CHECKLIST } from "@/content/pharmacy-setup";
import { GL } from "@/content/pharmacy-setup-going-live";
import { itemStatus } from "@/lib/pharmacy/derive/setup/golive";
import { cn } from "@/lib/utils";

const G = GL.go;

/** §A1 Go live: the checks, then two signatures. The second one switches it on (the server's trigger). */
export function GoDialog({ ctx, open, onClose }: { ctx: Ctx; open: boolean; onClose: () => void }) {
  const { view, st, blockers, doneN, run, pending } = ctx;
  const train = CHECKLIST.find((c) => c.key === "train")!;
  const checks: [string, boolean][] = [
    [G.nothingBlocks, blockers.length === 0],
    [G.practiceDone, view.phase === "practice" || itemStatus(train, st("train")) === "done"],
    [G.left(CHECKLIST.length - doneN), CHECKLIST.length === doneN],
  ];
  const sig = (role: "in_charge" | "ms") => view.signatures.find((s) => s.role === role);
  const sign = (role: "in_charge" | "ms") =>
    void run(
      () => signGoLiveAction({ role }),
      (d: { live: boolean }) => {
        if (d.live) onClose();
        return d.live ? GL.toast.live : GL.toast.signed;
      },
    );

  return (
    <EditorDialog open={open} onOpenChange={(o) => !o && onClose()} width="medium">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>{G.title(view.target)}</DialogTitle>
        <DialogDescription>{G.lead}</DialogDescription>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {checks.map(([label, ok]) => (
            <li key={label} className="text-body-s text-foreground flex items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "grid size-[22px] shrink-0 place-items-center rounded-full",
                  ok ? "bg-ink-700 text-ink-0" : "bg-status-caution-bg text-status-caution-fg-aa",
                )}
              >
                {ok ? <CheckIcon className="size-3" /> : <TriangleAlertIcon className="size-3" />}
              </span>
              <span className="sr-only">{ok ? G.ok : G.notYet}: </span>
              {label}
            </li>
          ))}
        </ul>
        <div className="bg-tide-sunken rounded-tide-tile flex flex-col gap-3 p-3.5">
          <span className="text-label text-foreground">{G.sigTitle}</span>
          <span className="flex flex-col gap-2">
            {(["in_charge", "ms"] as const).map((role) => {
              const s = sig(role);
              if (s)
                return (
                  <Pill key={role} tone="passed">
                    {G.signed(role, s.byName)}
                  </Pill>
                );
              const can = role === "in_charge" ? view.can.signInCharge : view.can.signMs;
              return (
                <LabButton
                  key={role}
                  busy={can ? pending : undefined}
                  disabledReason={can ? null : role === "in_charge" ? G.cantInCharge : G.cantMs}
                  reasonPlacement="below"
                  onClick={() => sign(role)}
                  className="w-fit"
                >
                  {G.sign(role)}
                </LabButton>
              );
            })}
          </span>
        </div>
      </div>
      <div className="border-border flex justify-end gap-2 border-t px-6 py-3.5">
        <LabButton type="button" onClick={onClose}>
          {G.close}
        </LabButton>
      </div>
    </EditorDialog>
  );
}
