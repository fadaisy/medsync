"use client";

import type { DeliveryKind, OrderCard, ReceiveDelivery } from "@/lib/pharmacy/derive/receive";
import type { ReactNode } from "react";
import { useState } from "react";

import { DateField } from "@/app/lab/_components/v2/fields";
import { editDeliveryAction, syncCountingAction } from "@/app/pharmacy/stock/store/receive-actions";
import { EditorDialog } from "@/components/medsync/editor-dialog";
import { Chip } from "@/components/pharmacy/charts/chip";
import { newKey } from "@/components/pharmacy/store/shared";
import { LabButton } from "@/components/tide/work/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { RB } from "@/content/pharmacy-receive-board";
import { blankLine, hm, minsBetween, stages } from "@/lib/pharmacy/derive/receive";
import { cn } from "@/lib/utils";
import { headOf, useReceive } from "../provider";
import { Field, inputCls, OptionCards, selectCls, Switch } from "../shared";

const T = RB.start;
type FieldName = "supplier" | "from" | "note" | "arrived" | "";
interface Err {
  field: FieldName;
  text: string;
  dupId: string | null;
}

/** `YYYY-MM-DD HH:MM`, Kampala, now. */
const nowText = () =>
  new Date().toLocaleString("sv-SE", { timeZone: "Africa/Kampala" }).slice(0, 16);
const asMs = (s: string) => Date.parse(`${s.replace(" ", "T")}:00Z`);

const ICON: Record<DeliveryKind, string> = {
  supplier:
    "M3 7h11v9H3zM14 10h4l3 3v3h-7zM5.5 17.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0M15.5 17.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0",
  donation: "M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0",
  facility: "M4 21V5l8-3 8 3v16M9 21v-5h6v5M9 9h.01M15 9h.01M9 13h.01M15 13h.01",
  ward: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
};
const KINDS: DeliveryKind[] = ["supplier", "donation", "facility", "ward"];

const Sec = ({
  no,
  title,
  aside,
  children,
}: {
  no: number;
  title: string;
  aside?: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-2.5">
    <h3 className="text-foreground m-0 flex items-center gap-2 text-[15px] leading-[22px] font-semibold">
      <span
        aria-hidden
        className="bg-ink-100 text-ink-700 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold"
      >
        {no}
      </span>
      {title}
      {aside ? <span className="text-ink-600 text-[12.5px] font-medium">{aside}</span> : null}
    </h3>
    {children}
  </section>
);

/** RECEIVE §B: every door opens this one dialog; with `edit` it changes a delivery still being counted. */
export function StartDialog({
  orderId,
  seedMedId,
  edit,
  onClose,
}: {
  orderId?: string;
  seedMedId?: string;
  edit?: ReceiveDelivery;
  onClose: () => void;
}) {
  const { world: w, online, keep, go, refresh } = useReceive();
  const place = w.places.find((p) => p.id === w.placeId);
  const locked = !!orderId && !edit;
  const open = (stages(w, w.placeId).stages.find((s) => s.key === "expected")?.cards ??
    []) as OrderCard[];
  const fromOrder = orderId ? w.orders.find((o) => o.id === orderId) : null;

  const [kind, setKind] = useState<DeliveryKind>(edit?.kind ?? "supplier");
  const [supplierId, setSupplierId] = useState(edit?.supplierId ?? fromOrder?.supplierId ?? "");
  const [pickedOrder, setPickedOrder] = useState(edit?.orderId ?? orderId ?? "");
  const [from, setFrom] = useState(edit && edit.kind !== "ward" ? edit.from : "");
  const [fromPlace, setFromPlace] = useState(edit?.fromPlace ?? "");
  const [note, setNote] = useState(edit?.note ?? "");
  const [at] = useState(() => edit?.arrived ?? nowText());
  const [date, setDate] = useState(at.slice(0, 10));
  const [time, setTime] = useState(at.slice(11, 16));
  const [deliverer, setDeliverer] = useState(edit?.deliverer ?? "");
  const [vehicle, setVehicle] = useState(edit?.vehicle ?? "");
  const [blind, setBlind] = useState(edit?.blind ?? false);
  const [err, setErr] = useState<Err | null>(null);
  const [pending, setPending] = useState(false);

  const arrived = `${date} ${time}`;
  const clear = () => setErr(null);
  const mins = minsBetween(arrived, nowText());
  const fieldErr = (f: FieldName) => (err && err.field === f ? err.text : null);
  const dupOf = err?.dupId ?? null;
  const noteKey = kind === "supplier" ? "supplier" : "other";

  const supplierOrders = (id: string) => open.filter((c) => c.order.supplierId === id);
  const pickSupplier = (id: string) => {
    setSupplierId(id);
    if (!edit) setPickedOrder(supplierOrders(id)[0]?.order.id ?? "");
    clear();
  };

  const submit = async () => {
    const n = note.trim();
    const fail = (field: FieldName, text: string, dupId: string | null = null) =>
      setErr({ field, text, dupId });
    if (kind === "supplier" && !supplierId) return fail("supplier", T.say.supplier);
    if (kind === "ward" && !fromPlace) return fail("from", T.say.ward);
    if ((kind === "donation" || kind === "facility") && !from.trim())
      return fail("from", kind === "donation" ? T.say.donor : T.say.facility);
    if (!n) return fail("note", kind === "supplier" ? T.say.noteSupplier : T.say.noteOther);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(arrived)) return fail("arrived", T.say.arrival);
    if (asMs(arrived) - asMs(nowText()) > 60_000) return fail("arrived", T.say.future);

    const supplier = w.suppliers.find((s) => s.id === supplierId);
    const wardName = w.places.find((p) => p.id === fromPlace)?.name ?? "";
    const text = kind === "ward" ? wardName : kind === "supplier" ? "" : from.trim();
    const base = edit ?? {
      id: newKey(),
      invoice: "",
      invoiceTotal: "",
      state: "counting" as const,
      grn: "",
      finished: "",
      shelvedAt: "",
      abandonReason: "",
      secondCheck: "",
      claimRef: "",
      lines: [],
      put: [],
      photos: [],
      conflict: "",
    };
    const doc: ReceiveDelivery = {
      ...base,
      kind,
      supplierId: kind === "supplier" ? supplierId : null,
      source: kind === "supplier" ? (supplier?.name ?? "") : text,
      from: text,
      fromPlace: kind === "ward" ? fromPlace : null,
      orderId: edit ? edit.orderId : kind === "supplier" ? pickedOrder || null : null,
      note: n,
      place: edit?.place ?? w.placeId,
      arrived,
      deliverer: deliverer.trim(),
      vehicle: vehicle.trim().toUpperCase(),
      blind,
    };

    // The same supplier or source, the same reference, unless abandoned: the stock cannot come in twice.
    const key = (d: Pick<ReceiveDelivery, "supplierId" | "fromPlace" | "from">) =>
      d.supplierId ?? d.fromPlace ?? d.from.toLowerCase();
    const dup = w.deliveries.find(
      (d) =>
        d.id !== doc.id &&
        d.kind === doc.kind &&
        d.state !== "abandoned" &&
        key(d) === key(doc) &&
        d.note.toLowerCase() === n.toLowerCase(),
    );
    if (dup) return fail("note", T.say.duplicate, dup.id);

    if (!edit) {
      const order = doc.orderId ? w.orders.find((o) => o.id === doc.orderId) : null;
      for (const ol of order?.lines ?? []) {
        const med = w.meds.find((m) => m.id === ol.medId);
        if (!med || ol.packs - ol.received <= 0) continue;
        doc.lines.push(
          blankLine(newKey(), doc, med, "order", {
            orderLineId: ol.id,
            per: String(med.per),
            ...(ol.price ? { cost: String(ol.price) } : {}),
          }),
        );
      }
      const seed = seedMedId ? w.meds.find((m) => m.id === seedMedId) : null;
      if (seed && !doc.lines.some((l) => l.medId === seed.id))
        doc.lines.push(blankLine(newKey(), doc, seed, "catalogue"));
    }

    setPending(true);
    try {
      if (online) {
        // A refusal shows here; a dropped connection falls through to the device's copy, as offline does.
        const r = await (
          edit
            ? editDeliveryAction(headOf(doc))
            : syncCountingAction({ head: headOf(doc), lines: doc.lines })
        ).catch(() => null);
        if (r && !r.ok)
          return fail(
            r.error === T.say.future || r.error === T.say.arrival ? "arrived" : "",
            r.error,
          );
        const dupId = r?.ok
          ? (r.data as { duplicateOf?: string } | undefined)?.duplicateOf
          : undefined;
        if (dupId) return fail("note", T.say.duplicate, dupId);
      }
      await keep(doc);
      if (!edit) go(doc.id);
      refresh();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <EditorDialog open onOpenChange={(o) => !o && onClose()} width="medium">
      <div className="flex flex-col gap-1 px-6 pt-5">
        <DialogTitle>{edit ? T.editTitle : T.title}</DialogTitle>
        <DialogDescription>{T.lead(place?.name ?? "")}</DialogDescription>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-4">
        {edit ? null : (
          <Sec no={1} title={T.what}>
            <OptionCards
              label={T.what}
              value={kind}
              disabled={locked}
              onChange={(k) => {
                setKind(k);
                if (k !== "supplier") setPickedOrder("");
                clear();
              }}
              options={KINDS.map((k) => ({
                value: k,
                title: T.kinds[k].title,
                line: T.kinds[k].line,
                icon: (
                  <svg
                    aria-hidden
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={ICON[k]} />
                  </svg>
                ),
              }))}
            />
          </Sec>
        )}

        <Sec no={edit ? 1 : 2} title={T.from[kind]}>
          {kind === "supplier" ? (
            <>
              <OptionCards
                label={T.supplier}
                value={supplierId}
                disabled={locked}
                error={fieldErr("supplier")}
                onChange={pickSupplier}
                className="min-[640px]:grid-cols-3"
                options={w.suppliers.map((s) => {
                  const n = supplierOrders(s.id).length;
                  return {
                    value: s.id,
                    title: s.name,
                    aside: n ? <Chip tone="info">{T.open(n)}</Chip> : undefined,
                    line: n ? T.pickOrder : T.noOrderOpen,
                  };
                })}
              />
              {supplierId && supplierOrders(supplierId).length ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-foreground text-[13px] leading-[18px] font-semibold">
                    {T.against}
                  </span>
                  <OptionCards
                    label={T.orderLabel}
                    value={pickedOrder || "none"}
                    disabled={locked || !!edit}
                    onChange={(v) => {
                      setPickedOrder(v === "none" ? "" : v);
                      clear();
                    }}
                    options={[
                      ...supplierOrders(supplierId).map((c) => ({
                        value: c.order.id,
                        title: c.order.ref,
                        aside: <Chip tone={c.due.tone}>{c.due.text}</Chip>,
                        line: c.sub,
                      })),
                      { value: "none", title: T.noOrder, line: T.noOrderLine },
                    ]}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-ink-600 m-0 text-[13px] leading-5">{T.kindLead[kind]}</p>
              {kind === "ward" ? (
                <Field label={T.wardLabel} error={fieldErr("from")}>
                  {(p) => (
                    <select
                      {...p}
                      className={selectCls(!!p["aria-invalid"])}
                      value={fromPlace}
                      onChange={(e) => {
                        setFromPlace(e.target.value);
                        clear();
                      }}
                    >
                      <option value="">{T.wardChoose}</option>
                      {w.places
                        .filter((x) => x.id !== w.placeId)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  )}
                </Field>
              ) : (
                <Field label={T.fromLabel[kind]} error={fieldErr("from")}>
                  {(p) => (
                    <input
                      {...p}
                      autoComplete="off"
                      className={inputCls(!!p["aria-invalid"])}
                      placeholder={T.fromPh[kind]}
                      value={from}
                      onChange={(e) => {
                        setFrom(e.target.value);
                        clear();
                      }}
                    />
                  )}
                </Field>
              )}
            </>
          )}
        </Sec>

        <Sec no={edit ? 2 : 3} title={T.paper}>
          <div className="grid gap-3 min-[640px]:grid-cols-2">
            <Field label={T.noteLabel[kind]} error={fieldErr("note")} hint={T.noteHint[noteKey]}>
              {(p) => (
                <input
                  {...p}
                  autoComplete="off"
                  className={cn(inputCls(!!p["aria-invalid"]), "font-mono")}
                  placeholder={T.notePh[kind]}
                  value={note}
                  onChange={(e) => {
                    setNote(e.target.value);
                    clear();
                  }}
                />
              )}
            </Field>
            <Field
              label={T.arrived}
              error={fieldErr("arrived")}
              hint={
                <>
                  {mins === null ? "" : mins < 2 ? T.justNow : T.ago(hm(mins))}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      const n = nowText();
                      setDate(n.slice(0, 10));
                      setTime(n.slice(11, 16));
                      clear();
                    }}
                    className="bg-ink-100 text-ink-700 hover:bg-ink-200 focus-visible:ring-primary/30 inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold outline-none focus-visible:ring-2"
                  >
                    {T.now}
                  </button>
                </>
              }
            >
              {(p) => (
                <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2">
                  <DateField
                    hideLabel
                    label={T.date}
                    value={date}
                    onChange={(v) => {
                      setDate(v);
                      clear();
                    }}
                  />
                  <input
                    {...p}
                    type="time"
                    aria-label={T.time}
                    className={inputCls(!!p["aria-invalid"])}
                    value={time}
                    onChange={(e) => {
                      setTime(e.target.value);
                      clear();
                    }}
                  />
                </div>
              )}
            </Field>
          </div>
        </Sec>

        <Sec no={edit ? 3 : 4} title={T.who} aside={T.optional}>
          <div className="grid gap-3 min-[640px]:grid-cols-2">
            <Field label={T.deliverer}>
              {(p) => (
                <input
                  {...p}
                  autoComplete="off"
                  className={inputCls()}
                  placeholder={T.delivererPh}
                  value={deliverer}
                  onChange={(e) => setDeliverer(e.target.value)}
                />
              )}
            </Field>
            <Field label={T.vehicle}>
              {(p) => (
                <input
                  {...p}
                  autoComplete="off"
                  className={cn(inputCls(), "font-mono uppercase")}
                  placeholder={T.vehiclePh}
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value)}
                />
              )}
            </Field>
          </div>
        </Sec>

        {edit ? null : (
          <div className="flex items-start gap-3">
            <Switch checked={blind} onChange={setBlind} label={T.blind} />
            <span className="min-w-0">
              <b className="text-foreground block text-[14px] leading-5 font-semibold">{T.blind}</b>
              <span className="text-ink-600 block text-[12.5px] leading-[18px]">{T.blindLine}</span>
            </span>
          </div>
        )}

        {err && !err.field ? (
          <p
            role="alert"
            className="text-status-critical-fg-aa m-0 text-[13px] leading-5 font-semibold"
          >
            {err.text}
          </p>
        ) : null}
        {dupOf ? (
          <div>
            <LabButton
              onClick={() => {
                go(dupOf);
                onClose();
              }}
            >
              {T.openDup}
            </LabButton>
          </div>
        ) : null}
      </div>
      <div className="border-border flex flex-wrap items-center justify-end gap-2 border-t px-6 py-3.5">
        {edit ? null : (
          <span className="text-ink-600 mr-auto text-[12.5px] leading-[18px]">
            {kind === "supplier" && pickedOrder ? T.foot.order : T.foot.none}
          </span>
        )}
        <LabButton onClick={onClose}>{T.cancel}</LabButton>
        <LabButton variant="primary" busy={pending} onClick={submit}>
          {edit ? T.save : T.go}
        </LabButton>
      </div>
    </EditorDialog>
  );
}
