"use client";

import type { Person } from "../../_components/supply-kit";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { MONTH_END, SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import { AttestBox } from "../../_components/supply-kit";
import {
  Field,
  PrintButton,
  SELECT,
  StoreDialog,
  str,
  TARGET,
} from "../../places/_components/store-kit";
import * as actions from "../actions";

/**
 * Month-end dialogs (5.8): the blind count (no expected figure is shown before it is saved, Law 5), a difference's
 * reason or Unexplained, and the close with a second approver's own password and code (D-PH2-23).
 */

export function MonthCountDialog({
  locationId,
  where,
  batches,
  controlled,
  people,
}: {
  locationId: string;
  where: string;
  batches: readonly { id: string; label: string }[];
  controlled: boolean;
  people: readonly Person[];
}) {
  const [w, setW] = useState<{ id: string; who: string } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const base = useId();
  return (
    <StoreDialog
      label={MONTH_END.count}
      title={MONTH_END.countTitle(where)}
      description={MONTH_END.countIntro}
      submit={SUPPLY_COMMON.save}
      width="wide"
      done={said !== null}
      onOpen={() => {
        setW(null);
        setSaid(null);
      }}
      onSave={async (clientKey, d) => {
        const r = await actions.recordMonthEndCount({
          clientKey,
          locationId,
          witnessAttestationId: w?.id ?? null,
          lines: batches.map((b) => ({ batchId: b.id, counted: Number(str(d, b.id)) })),
        });
        if (!r.ok) return r;
        setSaid(MONTH_END.countSaved("differences" in r ? r.differences : 0));
        return "stay";
      }}
    >
      {said ? (
        <p role="status" className="text-body-s">
          {said}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {batches.map((b, i) => (
              <Field key={b.id} label={b.label} id={`${base}-${i}`}>
                <Input
                  id={`${base}-${i}`}
                  name={b.id}
                  inputMode="numeric"
                  required
                  className={`${TARGET} tabular-nums`}
                />
              </Field>
            ))}
          </div>
          {controlled ? (
            <AttestBox
              people={people}
              action="month_end_count"
              attest={actions.attestApprover}
              done={w}
              onDone={setW}
              label={SUPPLY_COMMON.witness}
            />
          ) : null}
        </>
      )}
    </StoreDialog>
  );
}

export function ExplainDialog({
  locationId,
  month,
  productId,
  name,
  kind,
  reasons,
}: {
  locationId: string;
  month: string;
  productId: string;
  name: string;
  kind: "difference" | "not_counted";
  reasons: readonly { code: string; words: string }[];
}) {
  const id = useId();
  return (
    <StoreDialog
      label={MONTH_END.explain}
      title={MONTH_END.explainTitle(name)}
      description={reasons.length ? undefined : MONTH_END.noReasonList}
      submit={SUPPLY_COMMON.save}
      onSave={(clientKey, d) => {
        const reason = str(d, "reason");
        return actions.recordDifferenceReason({
          clientKey,
          locationId,
          month,
          productId,
          kind,
          reasonCode: reason && reason !== "unexplained" ? reason : null,
          unexplained: reason === "unexplained",
          note: str(d, "note") || null,
        });
      }}
    >
      <Field
        label={kind === "difference" ? SUPPLY_COMMON.reason : MONTH_END.notCountedReason}
        id={id}
      >
        <select id={id} name="reason" required className={SELECT} defaultValue="">
          <option value="" disabled>
            {SUPPLY_COMMON.choose}
          </option>
          {reasons.map((r) => (
            <option key={r.code} value={r.code}>
              {r.words}
            </option>
          ))}
          {kind === "difference" ? (
            <option value="unexplained">{MONTH_END.leaveUnexplained}</option>
          ) : null}
        </select>
      </Field>
      <Field label={SUPPLY_COMMON.note} id={`${id}-n`}>
        <Input id={`${id}-n`} name="note" className={TARGET} />
      </Field>
    </StoreDialog>
  );
}

export function CloseMonthDialog({
  locationId,
  month,
  label,
  people,
}: {
  locationId: string | null;
  month: string;
  label: string;
  people: readonly Person[];
}) {
  const [w, setW] = useState<{ id: string; who: string } | null>(null);
  return (
    <StoreDialog
      label={MONTH_END.close}
      title={MONTH_END.closeTitle(label)}
      description={MONTH_END.closeIntro}
      submit={MONTH_END.close}
      variant="primary"
      width="wide"
      onOpen={() => setW(null)}
      onSave={(clientKey) =>
        actions.closeMonth({ clientKey, locationId, month, approvalAttestationId: w?.id })
      }
    >
      <AttestBox
        people={people}
        action="month_close"
        attest={actions.attestApprover}
        done={w}
        onDone={setW}
        label={MONTH_END.approver}
      />
    </StoreDialog>
  );
}

export function MonthPrint({
  kind,
  label,
  section,
}: {
  kind: "stock_status" | "tracer_audit";
  label: string;
  section: string;
}) {
  const log = kind === "stock_status" ? actions.printStockStatus : actions.printTracerAudit;
  return <PrintButton label={label} section={section} log={(clientKey) => log({ clientKey })} />;
}
