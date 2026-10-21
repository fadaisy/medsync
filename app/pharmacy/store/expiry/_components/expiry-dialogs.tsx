"use client";

import type { Person } from "../../_components/supply-kit";
import { useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { EXPIRY, RECALL, SUPPLY_COMMON } from "@/content/pharmacy-stores-supply";
import { AttestBox } from "../../_components/supply-kit";
import {
  ActButton,
  Field,
  num,
  PrintButton,
  SELECT,
  StoreDialog,
  str,
  TARGET,
} from "../../places/_components/store-kit";
import * as actions from "../actions";

/**
 * Expiry and recall dialogs (5.6, 5.7): centred dialogs (ADR 0161). A witness confirms with their own password and
 * code where the rule needs one (write-off always; a controlled product always). Dates are typed as text
 * (YYYY-MM-DD), never a native date input.
 */

export interface Option {
  value: string;
  label: string;
}

function Select({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: readonly Option[];
}) {
  const id = useId();
  return (
    <Field label={label} id={id}>
      <select id={id} name={name} required className={SELECT} defaultValue="">
        <option value="" disabled>
          {SUPPLY_COMMON.choose}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Text({
  name,
  label,
  hint,
  required,
  inputMode,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  inputMode?: "numeric";
}) {
  const id = useId();
  return (
    <Field label={label} id={id} hint={hint}>
      <Input id={id} name={name} required={required} inputMode={inputMode} className={TARGET} />
    </Field>
  );
}

function useWitness() {
  const [w, setW] = useState<{ id: string; who: string } | null>(null);
  return [w, setW] as const;
}

export function QuarantineDialog(p: {
  locationId: string;
  batchId: string;
  what: string;
  max: number;
  reasons: readonly Option[];
  controlled: boolean;
  people: readonly Person[];
}) {
  const [w, setW] = useWitness();
  return (
    <StoreDialog
      label={EXPIRY.moveToQuarantine}
      title={EXPIRY.moveTitle(p.what)}
      submit={EXPIRY.moveToQuarantine}
      onOpen={() => setW(null)}
      onSave={(clientKey, d) =>
        actions.moveToQuarantine({
          clientKey,
          locationId: p.locationId,
          batchId: p.batchId,
          quantity: num(d, "quantity"),
          reasonCode: str(d, "reason"),
          note: str(d, "note") || null,
          witnessAttestationId: w?.id ?? null,
        })
      }
    >
      <Text name="quantity" label={SUPPLY_COMMON.upTo(p.max)} required inputMode="numeric" />
      <Select name="reason" label={EXPIRY.why} options={p.reasons} />
      <Text name="note" label={SUPPLY_COMMON.note} />
      {p.controlled ? (
        <AttestBox
          people={p.people}
          action="quarantine"
          attest={actions.attestWitness}
          done={w}
          onDone={setW}
          label={SUPPLY_COMMON.witness}
        />
      ) : null}
    </StoreDialog>
  );
}

export function WriteOffDialog(p: {
  batchId: string;
  what: string;
  max: number;
  reasons: readonly Option[];
  people: readonly Person[];
}) {
  const [w, setW] = useWitness();
  return (
    <StoreDialog
      label={EXPIRY.writeOff}
      title={EXPIRY.writeOffTitle(p.what)}
      submit={EXPIRY.writeOff}
      onOpen={() => setW(null)}
      onSave={(clientKey, d) =>
        actions.writeOff({
          clientKey,
          batchId: p.batchId,
          quantity: num(d, "quantity"),
          reasonCode: str(d, "reason"),
          registerNumber: str(d, "register"),
          note: str(d, "note") || null,
          witnessAttestationId: w?.id,
        })
      }
    >
      <Text name="quantity" label={SUPPLY_COMMON.upTo(p.max)} required inputMode="numeric" />
      <Select name="reason" label={EXPIRY.writeOffReason} options={p.reasons} />
      <Text name="register" label={EXPIRY.registerNumber} required />
      <Text name="note" label={SUPPLY_COMMON.note} />
      <AttestBox
        people={p.people}
        action="write_off"
        attest={actions.attestWitness}
        done={w}
        onDone={setW}
        label={SUPPLY_COMMON.witness}
      />
      <p className="text-caption text-muted-foreground">{EXPIRY.disposalNote}</p>
    </StoreDialog>
  );
}

export function DisposalDialog({ writeOffId }: { writeOffId: string }) {
  return (
    <StoreDialog
      label={EXPIRY.disposal}
      title={EXPIRY.disposalTitle}
      description={EXPIRY.disposalNote}
      submit={SUPPLY_COMMON.save}
      onSave={(clientKey, d) =>
        actions.recordDisposalReference({
          clientKey,
          writeOffId,
          reference: str(d, "ref"),
          disposalOn: str(d, "on"),
        })
      }
    >
      <Text name="ref" label={EXPIRY.disposalRef} required />
      <Text name="on" label={EXPIRY.disposalOn} hint={SUPPLY_COMMON.dateHint} required />
    </StoreDialog>
  );
}

export function SupplierReturnDialog(p: {
  batchId: string;
  what: string;
  max: number;
  suppliers: readonly Option[];
  controlled: boolean;
  people: readonly Person[];
}) {
  const [w, setW] = useWitness();
  if (!p.suppliers.length) return null;
  return (
    <StoreDialog
      label={EXPIRY.returnToSupplier}
      title={EXPIRY.returnTitle(p.what)}
      submit={EXPIRY.returnToSupplier}
      onOpen={() => setW(null)}
      onSave={(clientKey, d) =>
        actions.returnToSupplier({
          clientKey,
          batchId: p.batchId,
          quantity: num(d, "quantity"),
          counterpartyId: str(d, "supplier"),
          note: str(d, "note") || null,
          witnessAttestationId: w?.id ?? null,
        })
      }
    >
      <Text name="quantity" label={SUPPLY_COMMON.upTo(p.max)} required inputMode="numeric" />
      <Select name="supplier" label={EXPIRY.supplier} options={p.suppliers} />
      <Text name="note" label={SUPPLY_COMMON.note} />
      {p.controlled ? (
        <AttestBox
          people={p.people}
          action="supplier_return"
          attest={actions.attestWitness}
          done={w}
          onDone={setW}
          label={SUPPLY_COMMON.witness}
        />
      ) : null}
    </StoreDialog>
  );
}

/* ─── Recall ─────────────────────────────────────────────────────────── */

const opts = (o: Record<string, string>): Option[] =>
  Object.entries(o).map(([value, label]) => ({ value, label }));

export function StartRecallDialog({ products }: { products: readonly Option[] }) {
  return (
    <StoreDialog
      label={RECALL.start}
      title={RECALL.startTitle}
      description={RECALL.blockedNow}
      submit={RECALL.start}
      variant="primary"
      width="wide"
      onSave={(clientKey, d) =>
        actions.startRecall({
          clientKey,
          productId: str(d, "product"),
          batchNumber: str(d, "batch") || null,
          source: str(d, "source"),
          noticeRef: str(d, "ref"),
          noticeDate: str(d, "date"),
          statedClass: str(d, "class"),
          level: str(d, "level"),
          instructions: str(d, "instructions"),
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select name="product" label={RECALL.product} options={products} />
        <Text name="batch" label={RECALL.batch} />
        <Select name="source" label={RECALL.source} options={opts(RECALL.sources)} />
        <Text name="ref" label={RECALL.noticeRef} required />
        <Text name="date" label={RECALL.noticeDate} hint={SUPPLY_COMMON.dateHint} required />
        <div className="flex flex-col gap-1">
          <Select name="class" label={RECALL.statedClass} options={opts(RECALL.classes)} />
          <p className="text-caption text-muted-foreground">{RECALL.classNote}</p>
        </div>
        <Text name="level" label={RECALL.level} required />
        <Text name="instructions" label={RECALL.instructions} required />
      </div>
    </StoreDialog>
  );
}

export function QuarantineAllDialog({
  recallId,
  controlled,
  people,
}: {
  recallId: string;
  controlled: boolean;
  people: readonly Person[];
}) {
  const [w, setW] = useWitness();
  return (
    <StoreDialog
      label={RECALL.quarantineAll}
      title={RECALL.quarantineAll}
      description={RECALL.quarantineAllNote}
      submit={RECALL.quarantineAll}
      variant="primary"
      onOpen={() => setW(null)}
      onSave={(clientKey) =>
        actions.quarantineRecall({ clientKey, recallId, witnessAttestationId: w?.id ?? null })
      }
    >
      {controlled ? (
        <AttestBox
          people={people}
          action="recall_quarantine"
          attest={actions.attestWitness}
          done={w}
          onDone={setW}
          label={SUPPLY_COMMON.witness}
        />
      ) : (
        <p className="text-body-s">{RECALL.quarantineAllNote}</p>
      )}
    </StoreDialog>
  );
}

export function ContactDialog({
  recallId,
  patientUserId,
  list,
}: {
  recallId: string;
  patientUserId: string;
  list: "exact" | "may_have";
}) {
  const outcomes = Object.fromEntries(
    Object.entries(RECALL.status).filter(([k]) => k !== "not_yet_contacted"),
  );
  return (
    <StoreDialog
      label={RECALL.record}
      title={RECALL.recordTitle}
      submit={SUPPLY_COMMON.save}
      onSave={(clientKey, d) =>
        actions.recordRecallContact({
          clientKey,
          recallId,
          patientUserId,
          list,
          outcome: str(d, "outcome"),
          note: str(d, "note") || null,
        })
      }
    >
      <Select name="outcome" label={RECALL.outcome} options={opts(outcomes)} />
      <Text name="note" label={SUPPLY_COMMON.note} />
    </StoreDialog>
  );
}

export function SendDialog({
  recallId,
  patientUserIds,
  list,
  disabled,
}: {
  recallId: string;
  patientUserIds: readonly string[];
  list: "exact" | "may_have";
  disabled?: boolean;
}) {
  return (
    <StoreDialog
      label={RECALL.tellPatients}
      title={RECALL.tellPatients}
      description={RECALL.tellNote}
      submit={RECALL.send}
      disabled={disabled || !patientUserIds.length}
      onSave={(clientKey) =>
        actions.sendRecallMessage({ clientKey, recallId, patientUserIds, list })
      }
    >
      <p className="text-body-s">{RECALL.ncdNote}</p>
    </StoreDialog>
  );
}

export function CloseRecallDialog({ recallId }: { recallId: string }) {
  return (
    <StoreDialog
      label={RECALL.close}
      title={RECALL.closeTitle}
      submit={RECALL.close}
      onSave={(clientKey, d) =>
        actions.closeRecall({
          clientKey,
          recallId,
          returnedQuantity: num(d, "returned"),
          destroyedQuantity: num(d, "destroyed"),
          note: str(d, "note") || null,
        })
      }
    >
      <Text name="returned" label={RECALL.returnedQty} required inputMode="numeric" />
      <Text name="destroyed" label={RECALL.destroyedQty} required inputMode="numeric" />
      <Text name="note" label={RECALL.closeNote} />
    </StoreDialog>
  );
}

/* ─── Prints and one-press actions ──────────────────────────────────── */

export function ExpiryPrint({
  kind,
  refId,
  label,
  section,
}: {
  kind: "register" | "list" | "reconciliation";
  refId: string;
  label: string;
  section: string;
}) {
  const log = {
    register: actions.printRegisterEntry,
    list: actions.printRecallList,
    reconciliation: actions.printRecallReconciliation,
  }[kind];
  return (
    <PrintButton label={label} section={section} log={(clientKey) => log({ clientKey, refId })} />
  );
}

export function ApproveMayHave({ recallId }: { recallId: string }) {
  return (
    <ActButton
      label={RECALL.approveMayHave}
      variant="secondary"
      run={() => actions.approveMayHaveMessages({ clientKey: crypto.randomUUID(), recallId })}
    />
  );
}

export function PostNotice({ recallId, locationId }: { recallId: string; locationId: string }) {
  return (
    <ActButton
      label={RECALL.tellWards}
      variant="secondary"
      run={() =>
        actions.postWardRecallNotice({ clientKey: crypto.randomUUID(), recallId, locationId })
      }
    />
  );
}
