"use client";

import type { WitnessResult } from "@/app/pharmacy/_components/witness";
import type { LineInfo, ReceiveDelivery, ReceiveLine } from "@/lib/pharmacy/derive/receive";
import { useCallback, useState } from "react";

import { WitnessDialog } from "@/app/pharmacy/_components/witness";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { LabButton } from "@/components/tide/work/button";
import { DialogTitle } from "@/components/ui/dialog";
import { RCT } from "@/content/pharmacy-receive-count";
import { STORE_SAYS } from "@/content/pharmacy-store";
import { useReceive } from "../provider";
import { Said } from "./parts";

const F = RCT.finish;
type Done = { attestationId: string; name: string };

/**
 * Adding to stock (RECEIVE §D4 step 1), the one dialog: a witness for each controlled line and, above the second-check
 * limit, a second person who checked the count. Each is confirmed on their own device (single-use attestations).
 */
export function FinishDialog({
  d,
  lines,
  needSecond,
  value,
  addLabel,
  onConfirm,
  onClose,
}: {
  d: ReceiveDelivery;
  lines: { l: ReceiveLine; i: LineInfo }[];
  needSecond: boolean;
  value: number;
  addLabel: string;
  /** Resolves to the refusal's words, or null when it went through. */
  onConfirm: (
    witnesses: { lineId: string; attestationId: string }[],
    second: string | null,
  ) => Promise<string | null>;
  onClose: () => void;
}) {
  const { world } = useReceive();
  const [picks, setPicks] = useState<Record<string, Done>>({});
  const [second, setSecond] = useState<Done | null>(null);
  /** A line id, or `second`. */
  const [asking, setAsking] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);

  const missing = lines.some((x) => !picks[x.l.id])
    ? F.needWitness
    : needSecond && !second
      ? F.needSecond
      : null;
  const what = (() => {
    if (asking === "second") return F.secondWhat(d.note, value);
    const x = lines.find((y) => y.l.id === asking);
    return x ? F.witnessWhat(x.l.no, x.i.m.name, x.l.batch, x.i.unitsText, d.note) : "";
  })();

  const done = useCallback(
    (r: WitnessResult) => {
      if (r.how !== "phone") {
        // A paper name cannot come into stock: the witness has to confirm here, now.
        setErr(STORE_SAYS.witnessOnline);
        return setAsking(null);
      }
      const got = { attestationId: r.attestationId, name: r.name };
      if (asking === "second") setSecond(got);
      else if (asking) setPicks((p) => ({ ...p, [asking]: got }));
      setErr("");
      setAsking(null);
    },
    [asking],
  );

  const submit = async () => {
    setPending(true);
    setErr("");
    const e = await onConfirm(
      lines.map((x) => ({ lineId: x.l.id, attestationId: picks[x.l.id]!.attestationId })),
      second?.attestationId ?? null,
    );
    setPending(false);
    if (e) setErr(e);
  };

  const row = (label: string, ask: string, got: Done | null | undefined, choose: string) => (
    <div
      key={ask}
      className="border-ink-200 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t py-3 first:border-t-0"
    >
      <span className="text-foreground min-w-0 text-[14px] leading-5 font-semibold">{label}</span>
      <span className="flex flex-wrap items-center gap-2">
        {got ? <Said tone="ok">{F.confirmedBy(got.name)}</Said> : null}
        <LabButton className="h-11 sm:h-9" onClick={() => setAsking(ask)}>
          {got ? F.change : choose}
        </LabButton>
      </span>
    </div>
  );

  return (
    <>
      <EditorDialog open onOpenChange={(o) => !o && !pending && onClose()} width="medium">
        <div className="flex flex-col gap-1 px-6 pt-5">
          <DialogTitle>
            {needSecond && lines.length ? F.titleBoth : needSecond ? F.titleSecond : F.titleWitness}
          </DialogTitle>
          <p className="text-body-s text-ink-600 m-0">
            {needSecond ? F.leadSecond(value, world.rules.secondCheck) : F.leadWitness}
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-3">
          {needSecond ? row(F.second, "second", second, F.chooseSecond) : null}
          {lines.map((x) =>
            row(F.line(x.l.no, x.i.m.name, x.l.batch), x.l.id, picks[x.l.id], F.chooseWitness),
          )}
          {err ? (
            <p role="alert" className="text-status-critical-fg-aa m-0 pt-2 text-[13px] leading-5">
              {err}
            </p>
          ) : null}
        </div>
        <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3">
          <LabButton variant="quiet" onClick={onClose} busy={pending}>
            {F.cancel}
          </LabButton>
          <LabButton
            variant="primary"
            className="h-11 sm:h-9"
            busy={pending}
            disabledReason={missing}
            onClick={() => void submit()}
          >
            {addLabel}
          </LabButton>
        </div>
      </EditorDialog>
      <WitnessDialog
        open={asking !== null}
        onOpenChange={(o) => !o && setAsking(null)}
        what={what}
        purpose="witness"
        locationId={d.place}
        onDone={done}
      />
    </>
  );
}
