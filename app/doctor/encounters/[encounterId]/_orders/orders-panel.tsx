"use client";

import type { CollectDraft, CollectTarget, OrderDraft } from "@/components/emr/orders/model";
import type { EncounterOrdersLoad } from "@/lib/emr/read/orders";
import { useRouter } from "next/navigation";
import { useReducer, useState, useTransition } from "react";

import { EmrDialog } from "@/components/emr/emr-dialog";
import { CollectView, HighRiskBlock } from "@/components/emr/orders/collect-view";
import { EncounterOrdersView } from "@/components/emr/orders/encounter-orders-view";
import {
  defaultReasonIds,
  draftReducer,
  EMPTY_COLLECT,
  EMPTY_DRAFT,
  toCollectInput,
  toOrderLines,
} from "@/components/emr/orders/model";
import { OrderSheetView } from "@/components/emr/orders/order-sheet-view";
import { useCollectLab } from "@/components/emr/orders/use-collect-lab";
import { ResultEntry } from "@/components/emr/results/result-entry";
import { StatusWord } from "@/components/emr/status-word";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { collectSpecimen, placeOrders, setHighRisk } from "@/lib/emr/actions/orders";

type Msg = { ok: boolean; text: string } | null;

/**
 * The desk's orders island: the visit's order list, the order sheet (gate-a E.7), the bedside
 * collection sheet (E.8) and the transcription sheet for a paper or imaging report (E.9, as a
 * transcription). Each opens as a centred dialog (EmrDialog, ADR 0161); nothing inside
 * animates. Every write carries a fresh client key.
 */
export function OrdersPanel({ load }: { load: EncounterOrdersLoad }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // The collection target is kept as opened: after saving, the refreshed list no longer offers
  // collection, and the sheet must still show the label link.
  const [sheet, setSheet] = useState<
    | { kind: "order" }
    | { kind: "collect"; target: CollectTarget }
    | { kind: "transcribe"; orderId: string }
    | { kind: "risk"; clear: boolean }
    | null
  >(null);
  const [draft, dispatch] = useReducer(draftReducer, EMPTY_DRAFT as OrderDraft);
  const [query, setQuery] = useState("");
  const [collect, setCollect] = useState<CollectDraft>(EMPTY_COLLECT);
  const [labelHref, setLabelHref] = useState<string | null>(null);
  const [message, setMessage] = useState<Msg>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [riskReason, setRiskReason] = useState("");

  const base = { surface: "doctor" as const, patientUserId: load.patientUserId };
  const close = () => {
    setSheet(null);
    setMessage(null);
  };

  const place = () =>
    start(async () => {
      const r = await placeOrders({
        ...base,
        encounterId: load.encounterId,
        orders: toOrderLines(draft),
      });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      const n = draft.lines.length;
      dispatch({ type: "clear" });
      setQuery("");
      setSaid([n > 1 ? `${n} orders placed.` : "Order placed.", ...(r.warnings ?? [])].join(" "));
      close();
      router.refresh();
    });

  const target = sheet?.kind === "collect" ? sheet.target : null;
  const lab = useCollectLab({
    surface: "doctor",
    patientUserId: load.patientUserId,
    target,
    draft: collect,
    setDraft: setCollect,
    setTarget: (t) => setSheet({ kind: "collect", target: t }),
    setMessage,
    start,
  });
  const labelFor = (id: string) => `/doctor/encounters/${load.encounterId}/print/label/${id}`;
  const saveCollect = () =>
    start(async () => {
      if (!target) return;
      const r = await collectSpecimen({
        ...base,
        ...toCollectInput(target, collect, crypto.randomUUID()),
      });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setMessage({ ok: true, text: "Specimen collected." });
      setLabelHref(labelFor(r.id));
      router.refresh();
    });

  // HR-1, HR-2 (D-LAB2-06): a clinician flags a suspected high-risk infection, or clears the
  // warning, with a reason. The doctor's desk is clinicians only.
  const risk = load.highRisk ?? null;
  const riskSheet = sheet?.kind === "risk" ? sheet : null;
  const saveRisk = () =>
    start(async () => {
      if (!riskSheet) return;
      const r = await setHighRisk({
        ...base,
        encounterId: load.encounterId,
        kind: riskSheet.clear ? "clear" : "flag",
        source: "manual",
        reason: riskReason.trim(),
        clientKey: crypto.randomUUID(),
      });
      if (!r.ok) return setMessage({ ok: false, text: r.error });
      setSaid(riskSheet.clear ? "High-risk warning cleared." : "High-risk warning added.");
      close();
      router.refresh();
    });
  const openRisk = (clear: boolean) => {
    setRiskReason("");
    setMessage(null);
    setSheet({ kind: "risk", clear });
  };

  const entry = sheet?.kind === "transcribe" ? load.transcribe[sheet.orderId] : null;

  return (
    <>
      {risk ? (
        <div className="mb-3 flex flex-col">
          {risk.on ? (
            <HighRiskBlock manual={risk.manual} procedure={risk.procedure ?? null}>
              {risk.reason ? <p>Reason: {risk.reason}</p> : null}
              <Button
                type="button"
                variant="secondary"
                onClick={() => openRisk(true)}
                className="min-h-11 self-start sm:min-h-9"
              >
                Clear the warning
              </Button>
            </HighRiskBlock>
          ) : (
            <Button
              type="button"
              variant="secondary"
              onClick={() => openRisk(false)}
              className="min-h-11 self-start sm:min-h-9"
            >
              Suspected high-risk infection
            </Button>
          )}
        </div>
      ) : null}
      <EncounterOrdersView
        identity={load.identity}
        orders={load.orders}
        timeZone={load.timeZone}
        labelHref={labelFor}
        onOrder={() => setSheet({ kind: "order" })}
        onCollect={(orderId) => {
          const t = load.orders.find((o) => o.id === orderId)?.collect;
          if (!t) return;
          setCollect(EMPTY_COLLECT);
          setLabelHref(null);
          setMessage(null);
          lab.reset();
          setSheet({ kind: "collect", target: t });
        }}
        onTranscribe={(orderId) => setSheet({ kind: "transcribe", orderId })}
      />
      <p role="status" aria-live="polite" className="text-body-s sr-only">
        {said}
      </p>

      <EmrDialog
        open={sheet !== null}
        onOpenChange={(open) => (open ? null : close())}
        title={
          sheet?.kind === "collect"
            ? "Collect specimen"
            : sheet?.kind === "transcribe"
              ? "Enter result"
              : riskSheet
                ? riskSheet.clear
                  ? "Clear the warning"
                  : "Suspected high-risk infection"
                : "Order"
        }
        description={`${load.identity.name}, ${load.identity.mrn}`}
      >
        {sheet?.kind === "order" ? (
          <OrderSheetView
            identity={load.identity}
            menu={load.menu}
            reasons={load.reasons}
            draft={draft}
            query={query}
            pending={pending}
            message={message}
            onQuery={setQuery}
            onToggle={(testId) =>
              dispatch({
                type: "toggle",
                testId,
                clientKey: crypto.randomUUID(),
                defaultReasonIds: defaultReasonIds(load.reasons),
                needsPurpose: load.menu.find((t) => t.id === testId)?.needsPurpose,
              })
            }
            onPriority={(testId, priority) => dispatch({ type: "priority", testId, priority })}
            onReason={(testId, reasonId) => dispatch({ type: "reason", testId, reasonId })}
            onReasonText={(testId, text) => dispatch({ type: "reasonText", testId, text })}
            onPurpose={(testId, purpose) => dispatch({ type: "purpose", testId, purpose })}
            onPlace={place}
          />
        ) : null}
        {target ? (
          <CollectView
            identity={load.identity}
            target={target}
            draft={collect}
            collectorName={load.collectorName}
            pending={pending}
            message={message}
            labelHref={labelHref}
            onConfirm={(identifiersConfirmed) =>
              setCollect((d) => ({ ...d, identifiersConfirmed }))
            }
            onFasting={(fastingState) => setCollect((d) => ({ ...d, fastingState }))}
            onFastingHours={(fastingHours) => setCollect((d) => ({ ...d, fastingHours }))}
            onCollectedAt={(collectedAt) => setCollect((d) => ({ ...d, collectedAt }))}
            onSpecimen={(specimenType) => setCollect((d) => ({ ...d, specimenType }))}
            onContainer={(container) => setCollect((d) => ({ ...d, container }))}
            onSave={saveCollect}
            printHref={labelFor(target.orderId)}
            {...lab.props}
          />
        ) : null}
        {riskSheet ? (
          <div className="flex flex-col gap-4">
            <label className="text-body-s flex flex-col gap-1">
              {riskSheet.clear
                ? "Why is the warning no longer needed? (required)"
                : "Why do you suspect a high-risk infection? (required)"}
              <Input
                required
                value={riskReason}
                onChange={(e) => setRiskReason(e.target.value)}
                className="min-h-11 sm:min-h-9"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={saveRisk}
                disabled={pending || riskReason.trim().length < 3}
                className="min-h-11 sm:min-h-9"
              >
                {pending ? "Saving…" : riskSheet.clear ? "Clear the warning" : "Flag high-risk"}
              </Button>
              <span role="status" aria-live="polite" className="text-body-s">
                {message && !message.ok ? (
                  <StatusWord tone="caution">{message.text}</StatusWord>
                ) : null}
              </span>
            </div>
          </div>
        ) : null}
        {entry ? (
          <ResultEntry
            data={entry}
            surface="doctor"
            onDone={() => {
              setSaid("Result saved.");
              close();
              router.refresh();
            }}
          />
        ) : null}
      </EmrDialog>
    </>
  );
}
