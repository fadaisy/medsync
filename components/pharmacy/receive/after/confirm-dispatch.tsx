"use client";

import { useState } from "react";

import { confirmDispatchAction } from "@/app/pharmacy/stock/store/store-actions";
import { LabButton } from "@/components/tide/work/button";
import { RA } from "@/content/pharmacy-receive-after";
import { num } from "@/lib/pharmacy/derive/receive";
import { useReceive } from "../provider";
import { Field, inputCls } from "../shared";
import { Frame } from "./frame";

/** RECEIVE §F: the same confirmation as STORE.md §C3. A difference is stored with the voucher and opens a case. */
export function ConfirmDispatchDialog({
  dispatchId,
  onClose,
}: {
  dispatchId: string;
  onClose: () => void;
}) {
  const { world, run, busy } = useReceive();
  const [note, setNote] = useState("");
  const d = world.dispatches.find((x) => x.id === dispatchId);
  if (!d) return null;
  const here = world.places.find((p) => p.id === world.placeId)?.name ?? "";
  const from = world.places.find((p) => p.direct)?.name ?? "Main store";
  const diff = note.trim();

  const submit = () =>
    run(
      () => confirmDispatchAction({ issueId: d.id, note: diff || null }),
      () => {
        onClose();
        return diff ? RA.confirm.diff : RA.confirm.ok(here);
      },
    );

  return (
    <Frame
      title={
        <>
          {RA.confirm.title} · <span className="font-mono">{d.voucher}</span>
        </>
      }
      lead={RA.confirm.lead(d.kindText, from, here)}
      onClose={onClose}
      foot={
        <>
          <LabButton onClick={onClose}>{RA.confirm.cancel}</LabButton>
          <LabButton variant="primary" busy={busy} onClick={submit}>
            {RA.confirm.submit}
          </LabButton>
        </>
      }
    >
      <ul className="m-0 list-none p-0">
        {d.lines.map((l, i) => (
          <li
            key={i}
            className="border-ink-200 flex items-center justify-between gap-3 border-t py-2.5"
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-foreground text-[14px] leading-5 font-semibold">{l.name}</span>
              <span className="text-ink-600 font-mono text-[12px] leading-4">{l.batch}</span>
            </span>
            <span className="text-foreground text-[14px] font-semibold tabular-nums">
              {num(l.qty)}
            </span>
          </li>
        ))}
      </ul>
      <Field label={RA.confirm.note} hint={RA.confirm.hint}>
        {(a) => (
          <input
            {...a}
            value={note}
            maxLength={300}
            autoComplete="off"
            onChange={(e) => setNote(e.target.value)}
            className={inputCls()}
          />
        )}
      </Field>
    </Frame>
  );
}
