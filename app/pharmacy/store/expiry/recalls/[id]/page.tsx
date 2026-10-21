import type { EmrDb } from "@/lib/emr/db";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { CautionNotice } from "@/components/medsync/caution-notice";
import { PageHeader } from "@/components/medsync/page-header";
import { PHARMACY } from "@/content/pharmacy";
import { STORES_B } from "@/content/pharmacy-stores";
import { SUPPLY_COMMON as C, RECALL } from "@/content/pharmacy-stores-supply";
import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { isControlledMedicine } from "@/lib/pharmacy/controlled-read";
import { managesPharmacy } from "@/lib/pharmacy/downtime-store";
import { pharmacyRecallLiveFor } from "@/lib/pharmacy/feature";
import { peopleAt, signedPack } from "@/lib/pharmacy/stores/packs";
import { reconciliationFigures } from "@/lib/pharmacy/stores/recall";
import { getRecallTrace } from "@/lib/pharmacy/stores/recall-read";
import {
  ApproveMayHave,
  CloseRecallDialog,
  ContactDialog,
  ExpiryPrint,
  PostNotice,
  QuarantineAllDialog,
  SendDialog,
} from "../../_components/expiry-dialogs";

export const metadata: Metadata = { title: "Recall · Pharmacy" };
export const dynamic = "force-dynamic";

const day = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});

const box = "border-border overflow-x-auto rounded-lg border";
const cell = "px-3 py-2";
const Table = ({ cols, children }: { cols: string[]; children: ReactNode }) => (
  <div className={box} tabIndex={0}>
    <table className="text-body-s w-full">
      <thead className="bg-ink-50 text-left">
        <tr>
          {cols.map((c, i) => (
            <th key={i} scope="col" className={cell}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-border divide-y">{children}</tbody>
    </table>
  </div>
);
const Section = ({
  title,
  children,
  print,
}: {
  title: string;
  children: ReactNode;
  print?: string;
}) => (
  <section className="flex flex-col gap-2" aria-label={title} data-print-section={print}>
    <h2 className="text-heading-s">{title}</h2>
    {children}
  </section>
);

/**
 * One recall's trace (5.7, RC-1 to RC-6; Law 8): the seven sections, patients first. List 2 is exact; list 4 is
 * separate, in words, and never merged. The patient lists are pharmacy-only; showing them logs the reveal, and
 * printing them is logged. Behind `pharmacyRecall`.
 */
export default async function RecallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePharmacyActor();
  if (!pharmacyRecallLiveFor(actor.hospitalId) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const owner = db as unknown as EmrDb;
  const t = await getRecallTrace(actor, id, owner);
  if (!t) notFound();
  const [manages, people, template, controlled, ids] = await Promise.all([
    managesPharmacy(actor.userId, actor.hospitalId),
    peopleAt(owner, actor.hospitalId),
    signedPack(owner, actor.hospitalId, "recall_template"),
    isControlledMedicine(owner, actor.hospitalId, t.medicineId),
    identitiesFor(
      actor,
      [...t.exact.map((p) => p.patientId), ...t.mayHave.map((p) => p.patientId)],
      "pharmacy_recall",
    ),
  ]);
  const canContact = actor.access.permissions.has("pharmacy.stock");
  const open = !t.recall.closedAt;
  const place = (l: string) => t.locations.get(l)?.name ?? l;
  const who = (p: string) => {
    const i = ids.get(p);
    return i ? `${i.name} · ${i.mrn}` : p;
  };
  const r = t.recall;
  const figures = reconciliationFigures(t.accounted);
  const others = people.filter((p) => p.userId !== actor.userId);
  const none = <p className="text-body-s text-muted-foreground">{C.none}</p>;
  const mayHaveApproved = !!r.mayHaveMessageApprovedBy;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
      <PageHeader
        place={PHARMACY.place}
        placeInTopBar
        title={`${RECALL.title}: ${t.productName} · ${r.batchNumber ?? RECALL.allBatches}`}
        subline={
          <span className="text-body-s text-muted-foreground">
            {`${RECALL.sources[r.source]} · ${r.noticeRef} · ${r.noticeDate} · ${RECALL.classes[r.statedClass]} · ${r.level}`}
          </span>
        }
        right={
          open ? (
            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
              {`${RECALL.open}: ${day.format(r.startedAt)}`}
            </StatusWord>
          ) : (
            <StatusWord>{`${RECALL.closed}: ${day.format(r.closedAt!)}`}</StatusWord>
          )
        }
      />
      <p className="text-body-s">{r.instructions}</p>
      {open ? <CautionNotice lead={RECALL.blockedNow} /> : null}

      <Section title={RECALL.trace.received}>
        {t.received.length === 0 ? (
          none
        ) : (
          <Table cols={[C.location, C.date, C.quantity, RECALL.source]}>
            {t.received.map((x) => (
              <tr key={x.movementId}>
                <td className={cell}>{place(x.locationId)}</td>
                <td className={cell}>{day.format(x.at)}</td>
                <td className={`${cell} tabular-nums`}>{x.quantity}</td>
                <td className={cell}>{x.from ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <div data-print-section="recall-list" className="flex flex-col gap-6">
        <p className="text-caption hidden print:block">{RECALL.listPrintNote}</p>
        <Section title={RECALL.trace.supplied}>
          <p className="text-caption text-muted-foreground">{RECALL.exactNote}</p>
          {t.exact.length === 0 ? (
            none
          ) : (
            <Table cols={[C.patient, C.date, C.quantity, C.location, C.contact, C.status, ""]}>
              {t.exact.map((p) => (
                <tr key={p.patientId} className="align-top">
                  <th scope="row" className={`${cell} text-left font-normal`}>
                    {who(p.patientId)}
                  </th>
                  <td className={cell}>{p.supplies.map((s) => day.format(s.at)).join(", ")}</td>
                  <td className={`${cell} tabular-nums`}>{p.quantity}</td>
                  <td className={cell}>
                    {[...new Set(p.supplies.map((s) => place(s.locationId)))].join(", ")}
                  </td>
                  <td className={cell}>{RECALL.contact[p.contact]}</td>
                  <td className={cell}>{RECALL.status[p.status as keyof typeof RECALL.status]}</td>
                  <td className={`${cell} print:hidden`}>
                    {open && canContact ? (
                      <ContactDialog recallId={r.id} patientUserId={p.patientId} list="exact" />
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title={RECALL.trace.mayHave}>
          <p className="text-body-s">
            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
              {STORES_B.mayHaveReceived}
            </StatusWord>
          </p>
          {t.mayHave.length === 0 ? (
            none
          ) : (
            <Table cols={[C.patient, RECALL.source, C.location, C.date, C.contact, C.status, ""]}>
              {t.mayHave.map((p) => (
                <tr key={`${p.patientId}-${p.locationId}`} className="align-top">
                  <th scope="row" className={`${cell} text-left font-normal`}>
                    {who(p.patientId)}
                  </th>
                  <td className={cell}>
                    {p.source === "cart" ? RECALL.fromCart : RECALL.fromWard}
                    {p.allocated ? <p className="text-caption">{RECALL.allocated}</p> : null}
                  </td>
                  <td className={cell}>{place(p.locationId)}</td>
                  <td className={cell}>{day.format(p.firstAt)}</td>
                  <td className={cell}>{RECALL.contact[p.contact]}</td>
                  <td className={cell}>{RECALL.status[p.status as keyof typeof RECALL.status]}</td>
                  <td className={`${cell} print:hidden`}>
                    {open && canContact ? (
                      <ContactDialog recallId={r.id} patientUserId={p.patientId} list="may_have" />
                    ) : null}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      </div>

      <Section title={RECALL.trace.issued}>
        {t.issued.length === 0 ? (
          none
        ) : (
          <Table cols={[C.location, C.date, C.quantity, ""]}>
            {t.issued.map((x, i) => (
              <tr key={i} className="align-top">
                <td className={cell}>
                  {place(x.locationId)}
                  {x.allocated ? <p className="text-caption">{STORES_B.batchesMixed}</p> : null}
                </td>
                <td className={cell}>{day.format(x.at)}</td>
                <td className={`${cell} tabular-nums`}>{x.quantity}</td>
                <td className={cell}>
                  {t.wardsNotified.has(x.locationId) ? (
                    RECALL.wardTold(day.format(t.wardsNotified.get(x.locationId)!))
                  ) : open && manages ? (
                    <PostNotice recallId={r.id} locationId={x.locationId} />
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={RECALL.trace.shelves}>
        {t.shelves.length === 0 ? (
          none
        ) : (
          <Table cols={[C.location, C.batch, C.quantity]}>
            {t.shelves.map((s) => (
              <tr key={s.batchId}>
                <td className={cell}>{place(s.locationId)}</td>
                <td className={cell}>{t.batches.find((b) => b.id === s.batchId)?.batchNumber}</td>
                <td className={`${cell} tabular-nums`}>{s.quantity}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={RECALL.trace.lent}>
        {t.lent.length === 0 ? (
          none
        ) : (
          <Table cols={[C.location, C.quantity, ""]}>
            {t.lent.map((l, i) => (
              <tr key={i}>
                <td className={cell}>{l.counterparty}</td>
                <td className={`${cell} tabular-nums`}>{l.quantity}</td>
                <td className={cell}>{RECALL.lentTell}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title={RECALL.trace.accounted} print="recall-reconciliation">
        <h3 className="text-body-s hidden print:block">{RECALL.reconciliationTitle}</h3>
        <dl className="text-body-s grid gap-x-4 gap-y-1 sm:grid-cols-3">
          {(
            [
              ["received", t.accounted.externalIn.received],
              ["borrowed", t.accounted.externalIn.borrowed],
              ["loanReturnedIn", t.accounted.externalIn.loanReturnedIn],
              ...Object.entries(t.accounted.out).filter(([k]) => k !== "total"),
              ["balance", t.accounted.balance],
            ] as [keyof typeof RECALL.terms, number][]
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted-foreground">{RECALL.terms[k]}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-body-s">
          {t.accounted.gap === 0 ? (
            <StatusWord>{RECALL.gap(0)}</StatusWord>
          ) : (
            <StatusWord tone="caution" glyph={TriangleAlertIcon}>
              {RECALL.gap(t.accounted.gap)}
            </StatusWord>
          )}
        </p>
        <dl className="text-body-s hidden gap-x-4 print:grid print:grid-cols-3">
          {Object.entries(figures).map(([k, v]) => (
            <div key={k}>
              <dt>{RECALL.figures[k as keyof typeof RECALL.figures]}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        {r.closedAt ? (
          <p className="text-body-s">{`${RECALL.returnedQty}: ${r.returnedQuantity} · ${RECALL.destroyedQty}: ${r.destroyedQuantity}${r.closeNote ? ` · ${r.closeNote}` : ""}`}</p>
        ) : null}
        <p className="text-caption text-muted-foreground">{RECALL.reconciliationNote}</p>
      </Section>

      <section aria-label={RECALL.tellPatients} className="flex flex-col gap-2 print:hidden">
        {!template ? <CautionNotice lead={RECALL.noTemplate} /> : null}
        {mayHaveApproved ? (
          <p className="text-body-s">
            {RECALL.mayHaveApproved(day.format(r.mayHaveMessageApprovedAt!))}
          </p>
        ) : (
          <p className="text-body-s text-muted-foreground">{RECALL.mayHaveNotApproved}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {open && manages ? (
            <>
              <QuarantineAllDialog recallId={r.id} controlled={controlled} people={others} />
              <SendDialog
                recallId={r.id}
                list="exact"
                patientUserIds={t.exact.map((p) => p.patientId)}
                disabled={!template}
              />
              {mayHaveApproved ? (
                <SendDialog
                  recallId={r.id}
                  list="may_have"
                  patientUserIds={t.mayHave.map((p) => p.patientId)}
                  disabled={!template}
                />
              ) : (
                <ApproveMayHave recallId={r.id} />
              )}
              <CloseRecallDialog recallId={r.id} />
            </>
          ) : null}
          <ExpiryPrint kind="list" refId={r.id} label={RECALL.printList} section="recall-list" />
          <ExpiryPrint
            kind="reconciliation"
            refId={r.id}
            label={RECALL.printReconciliation}
            section="recall-reconciliation"
          />
        </div>
      </section>
    </div>
  );
}
