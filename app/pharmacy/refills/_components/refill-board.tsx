"use client";

import type { PatientIdentity } from "@/components/emr/orders/model";
import type { RefillRow, RefillTab } from "@/lib/pharmacy/refill-read";
import { useId, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { PageHeader } from "@/components/medsync/page-header";
import { Tag } from "@/components/medsync/tag";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NETWORK_UI } from "@/content/pharmacy-network";
import { guard } from "@/lib/pharmacy/network-demo";
import { cn } from "@/lib/utils";
import { ReviewDialog, SELECT, TARGET, TEXTAREA } from "../../_components/review-dialogs";
import {
  askClinicToRenew,
  handOverPrepared,
  holdPreparedLonger,
  releasePrepared,
  setAsideRefill,
} from "../../refill-actions";
import { checkSecondIdentifier } from "../../supply-actions";

const W = NETWORK_UI.refills;
const TABS = Object.keys(W.tabs) as RefillTab[];
const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();

/**
 * 5.5 (board 4.2): six tabs, each with its count; one action per row. Early and late are words, never a block; late
 * (the patient may have run out) carries the caution glyph, early a plain tag.
 */
export function RefillBoard({
  place,
  rows,
  identities,
  canDispense,
  pointId,
  demo = false,
}: {
  place: string;
  rows: RefillRow[];
  identities: Record<string, PatientIdentity>;
  canDispense: boolean;
  pointId: string | null;
  /** The fixture catalogue (/styleguide/pharmacy-network): every save answers in words, nothing is sent. */
  demo?: boolean;
}) {
  const [tab, setTab] = useState<RefillTab>("to_prepare");
  const panel = useId();
  const shown = rows.filter((r) => r.tab === tab);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader place={place} title={W.title} subline={W.lead} placeInTopBar />
      <div
        role="tablist"
        aria-label={W.title}
        className="bg-muted flex flex-wrap gap-0.5 rounded-md p-0.5"
      >
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={panel}
            onClick={() => setTab(t)}
            className={cn(
              "text-label focus-visible:shadow-focus inline-flex min-h-11 items-center gap-1.5 rounded-[5px] px-2.5 outline-none",
              tab === t
                ? "bg-card text-foreground shadow-xs"
                : "text-ink-600 hover:text-foreground",
            )}
          >
            {W.tabs[t]}{" "}
            <span className="tabular-nums">{rows.filter((r) => r.tab === t).length}</span>
          </button>
        ))}
      </div>
      <div id={panel} role="tabpanel" className="flex flex-col gap-3">
        {shown.length === 0 ? (
          <p className="text-body-s text-muted-foreground">{W.empty}</p>
        ) : (
          shown.map((r) => {
            const who = identities[r.patientUserId];
            return (
              <article
                key={r.lineId}
                className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-body-m text-foreground">
                    {who?.name ?? ""}{" "}
                    <span className="text-muted-foreground font-mono">{who?.mrn ?? ""}</span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {r.timing.late ? (
                      <StatusWord tone="caution" glyph={TriangleAlertIcon}>
                        {W.late}
                      </StatusWord>
                    ) : null}
                    {r.timing.early ? <Tag>{r.timing.early}</Tag> : null}
                    {r.heldUntil && r.tab !== "collected" ? (
                      <Tag>{W.heldUntil(r.heldUntil)}</Tag>
                    ) : null}
                  </span>
                </div>
                <dl className="text-body-s grid gap-x-6 gap-y-1 sm:grid-cols-3">
                  <Item k="Medicine" v={r.medicine} />
                  <Item k="What the prescription allows" v={r.allows} />
                  <Item k="Last supply" v={r.lastSupply ?? "Not recorded"} />
                  <Item k="Collect at" v={r.collectAt} />
                  <Item k="Collector" v={r.collector} />
                  {r.note ? <Item k="Note" v={r.note} /> : null}
                </dl>
                {canDispense ? <Action row={r} pointId={pointId} demo={demo} /> : null}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-caption text-muted-foreground">{k}</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

/** The row's one action (5.5), plus Ask the clinic where the line waits on it. */
function Action({ row, pointId, demo }: { row: RefillRow; pointId: string | null; demo: boolean }) {
  const ids = {
    product: useId(),
    qty: useId(),
    reason: useId(),
    until: useId(),
    kind: useId(),
    typed: useId(),
    pay: useId(),
  };
  const atThisPoint = !!pointId;
  const askClinic = (
    <ReviewDialog
      label={W.actions.askClinic}
      title={W.actions.askClinic}
      description="A renewal request goes to the clinic with your note. The patient is told."
      submit={W.actions.askClinic}
      onSave={guard(demo, (clientKey, d) =>
        askClinicToRenew({ clientKey, lineId: row.prescriptionId, note: str(d, "note") }),
      )}
    >
      <Field id={ids.reason} label="Note for the clinic (optional)">
        <textarea id={ids.reason} name="note" maxLength={500} className={TEXTAREA} />
      </Field>
    </ReviewDialog>
  );
  if (row.tab === "needs_clinic") return <div className="flex flex-wrap gap-2">{askClinic}</div>;
  if (!atThisPoint) return null;
  if (row.tab === "to_prepare")
    return (
      <div className="flex flex-wrap gap-2">
        <ReviewDialog
          label={W.actions.setAside}
          title={`${W.actions.setAside}: ${row.medicine}`}
          description="The quantity moves to this point's held refills, first expiry first. Nothing is handed over."
          submit={W.actions.setAside}
          variant="primary"
          onSave={guard(demo, (clientKey, d) =>
            setAsideRefill({
              clientKey,
              lineId: row.lineId,
              productId: str(d, "product"),
              quantity: Number(str(d, "quantity")),
            }),
          )}
        >
          <Field id={ids.product} label="Product">
            <select id={ids.product} name="product" required className={SELECT}>
              {row.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id={ids.qty} label="Quantity, as written">
            <Input id={ids.qty} name="quantity" inputMode="numeric" required className={TARGET} />
          </Field>
        </ReviewDialog>
        {askClinic}
      </div>
    );
  if (row.tab === "prepared" || row.tab === "not_collected")
    return (
      <div className="flex flex-wrap gap-2">
        <ReviewDialog
          label={W.actions.handOver}
          title={`${W.actions.handOver}: ${row.medicine}`}
          description={`Collector: ${row.collector}. Ask for the date of birth or phone number; MedSync checks it without showing it.`}
          submit={W.actions.handOver}
          variant="primary"
          onSave={guard(demo, async (clientKey, d) => {
            const check = await checkSecondIdentifier({
              clientKey,
              lineId: row.prescriptionId,
              kind: str(d, "kind"),
              typed: str(d, "typed"),
            });
            if (!check.ok) return check;
            if (check.result !== "match")
              return {
                ok: false,
                code: "conflict",
                error:
                  check.result === "closed"
                    ? "The typed check is closed for today."
                    : `That does not match. ${check.attemptsLeft ?? 0} tries left today.`,
              };
            return handOverPrepared({
              clientKey,
              lineIds: [row.lineId],
              identity: { route: "two_identifiers", nameAttested: true },
              payment: { status: str(d, "payment") },
            });
          })}
        >
          <Field id={ids.kind} label="Second identifier">
            <select id={ids.kind} name="kind" className={SELECT}>
              <option value="date_of_birth">Date of birth</option>
              <option value="phone">Phone number</option>
            </select>
          </Field>
          <Field id={ids.typed} label="As the collector says it">
            <Input id={ids.typed} name="typed" autoComplete="off" required className={TARGET} />
          </Field>
          <Field id={ids.pay} label="Payment">
            <select id={ids.pay} name="payment" className={SELECT}>
              <option value="paid">Paid</option>
              <option value="insured">Insured</option>
              <option value="emergency">Emergency</option>
              <option value="not_recorded">Not recorded</option>
            </select>
          </Field>
        </ReviewDialog>
        <ReviewDialog
          label={W.actions.release}
          title={`${W.actions.release}: ${row.medicine}`}
          description="Every held unit goes back to this point's shelf. The patient may ask again."
          submit={W.actions.release}
          onSave={guard(demo, (clientKey, d) =>
            releasePrepared({ clientKey, lineId: row.lineId, reasonCode: str(d, "reason") }),
          )}
        >
          <Field id={ids.reason} label="Why">
            <select id={ids.reason} name="reason" className={SELECT}>
              <option value="not_collected">Not collected in time</option>
              <option value="patient_asked">The patient asked</option>
              <option value="line_changed">The prescription changed</option>
              <option value="stock_problem">A problem with the stock</option>
            </select>
          </Field>
        </ReviewDialog>
        <ReviewDialog
          label={W.actions.holdLonger}
          title={`${W.actions.holdLonger}: ${row.medicine}`}
          description="Up to the signed number of extensions and the signed longest hold."
          submit={W.actions.holdLonger}
          onSave={guard(demo, (clientKey, d) =>
            holdPreparedLonger({
              clientKey,
              lineId: row.lineId,
              until: str(d, "until"),
              reasonCode: str(d, "reason"),
            }),
          )}
        >
          <Field id={ids.until} label="Hold until (YYYY-MM-DD)">
            <Input
              id={ids.until}
              name="until"
              inputMode="numeric"
              pattern="\d{4}-\d{2}-\d{2}"
              required
              className={TARGET}
            />
          </Field>
          <Field id={`${ids.reason}-h`} label="Why">
            <select id={`${ids.reason}-h`} name="reason" className={SELECT}>
              <option value="patient_called">The patient called</option>
              <option value="collector_delayed">The collector is delayed</option>
            </select>
          </Field>
        </ReviewDialog>
      </div>
    );
  return null;
}
