"use client";

import { useState } from "react";

import { creditClaimAction, sendClaimAction } from "@/app/pharmacy/stock/store/receive-actions";
import { Tag } from "@/components/medsync/tag";
import { Chip } from "@/components/pharmacy/charts/chip";
import { Card, rowCls, rowSub, rowTitle } from "@/components/pharmacy/store/places/parts";
import { LabButton } from "@/components/tide/work/button";
import { RA } from "@/content/pharmacy-receive-after";
import { money } from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { useReceive } from "../provider";
import { Field, inputCls } from "../shared";
import { Frame } from "./frame";

/** RECEIVE §A4 and §E2: every claim to a supplier, followed until its credit note arrives. */
export function ClaimsCard() {
  const { world, open } = useReceive();
  if (!world.claims.length) return null;
  const name = (id: string) => world.meds.find((m) => m.id === id)?.name ?? "";
  return (
    <Card title={RA.claim.title} note={RA.claim.note} aside={<Chip>{world.claims.length}</Chip>}>
      <ul className="m-0 list-none p-0">
        {world.claims.map((c) => (
          <li key={c.id} className={rowCls}>
            <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
              <span className={cn(rowTitle, "flex flex-wrap items-center gap-x-1.5 gap-y-1")}>
                <span className="font-mono">{c.ref}</span> · {c.supplier}
                <Tag>{RA.claim.state[c.state]}</Tag>
              </span>
              <span className={rowSub}>
                {RA.claim.row(
                  c.note,
                  c.lines.map((x) => ({ med: name(x.medId), kind: x.kind, packs: x.packs })),
                  c.creditNote,
                )}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <b className="text-foreground text-[14px] tabular-nums">{money(c.total)}</b>
              {c.state !== "credit" ? (
                <LabButton
                  size="sm"
                  onClick={() =>
                    open({
                      kind: "claim",
                      claimId: c.id,
                      step: c.state === "draft" ? "send" : "credit",
                    })
                  }
                >
                  {c.state === "draft" ? RA.claim.send : RA.claim.receive}
                </LabButton>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * Draft, then **Send the claim** (an editable message, copied and marked as sent), then Sent, then **Credit received**
 * with the credit note number. The message is drafted and copied only: MedSync never sends it.
 */
export function ClaimDialog({
  claimId,
  onClose,
}: {
  claimId: string;
  step?: "send" | "credit";
  onClose: () => void;
}) {
  const { world, run, busy, say } = useReceive();
  const c = world.claims.find((x) => x.id === claimId);
  const [text, setText] = useState(() =>
    c
      ? RA.claim.draft({
          supplier: c.supplier,
          ref: c.ref,
          note: c.note,
          grn: c.grn,
          lines: c.lines.map((x) => ({
            ...x,
            med: world.meds.find((m) => m.id === x.medId)?.name ?? "",
          })),
          total: c.total,
          place: world.places.find((p) => p.id === world.placeId)?.name ?? "",
        })
      : "",
  );
  const [credit, setCredit] = useState("");
  const [error, setError] = useState("");
  if (!c) return null;

  const copy = () =>
    (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("no clipboard"))).then(
      () => say(RA.claim.copied),
      () => say(RA.claim.blocked),
    );
  const markSent = () =>
    run(
      () => sendClaimAction({ claimId: c.id }),
      () => {
        onClose();
        return RA.claim.sent(c.ref, c.supplier);
      },
    );
  const received = () => {
    const note = credit.trim();
    if (!note) return setError(RA.claim.needCredit);
    run(
      () => creditClaimAction({ claimId: c.id, creditNote: note }),
      () => {
        onClose();
        return RA.claim.credited(note, c.ref);
      },
    );
  };

  return (
    <Frame
      title={RA.claim.dialogTitle(c.ref, c.supplier)}
      lead={RA.claim.total(c.total)}
      onClose={onClose}
      foot={
        <>
          <LabButton onClick={onClose}>{RA.claim.close}</LabButton>
          {c.state === "draft" ? (
            <>
              <LabButton onClick={copy}>{RA.claim.copy}</LabButton>
              <LabButton variant="primary" busy={busy} onClick={markSent}>
                {RA.claim.markSent}
              </LabButton>
            </>
          ) : c.state === "sent" ? (
            <LabButton variant="primary" busy={busy} onClick={received}>
              {RA.claim.receive}
            </LabButton>
          ) : null}
        </>
      }
    >
      <ul className="m-0 list-none p-0">
        {c.lines.map((x, i) => (
          <li
            key={i}
            className="border-ink-200 flex items-center justify-between gap-3 border-t py-2.5"
          >
            <span className="flex min-w-0 flex-col">
              <span className={rowTitle}>
                {world.meds.find((m) => m.id === x.medId)?.name ?? ""}
              </span>
              <span className={rowSub}>{RA.claim.line(x.kind, x.packs)}</span>
            </span>
            <b className="text-foreground text-[14px] tabular-nums">{money(x.value)}</b>
          </li>
        ))}
      </ul>
      {c.state === "draft" ? (
        <Field label={RA.claim.message}>
          {(a) => (
            <textarea
              {...a}
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={cn(inputCls(), "h-auto py-2.5 leading-5")}
            />
          )}
        </Field>
      ) : null}
      {c.state === "sent" ? (
        <Field label={RA.claim.creditNote} error={error} className="max-w-[280px]">
          {(a) => (
            <input
              {...a}
              value={credit}
              autoComplete="off"
              maxLength={80}
              onChange={(e) => {
                setCredit(e.target.value);
                setError("");
              }}
              className={cn(inputCls(!!error), "font-mono")}
            />
          )}
        </Field>
      ) : null}
    </Frame>
  );
}
