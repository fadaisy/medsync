import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Card, Note, TextLink } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { ME_COPY as C } from "@/content/patient/me";
import { loadRecord } from "@/lib/patient-web/me-data";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { formatFullDate } from "@/lib/patient/booking-format";
import { requirePatientScope } from "@/lib/patient/scope";
import { SUMMARY_HEADINGS } from "@/lib/patient/visit-summary";
import { AddMedicine } from "../_components/add-medicine";

export const metadata: Metadata = { title: "Your visit · MedSync" };
export const dynamic = "force-dynamic";

/**
 * One shared visit summary (the phone's (app)/records/[id].tsx, ADR 0203): what the clinician chose to share,
 * in the web's own headings. A medicine shows its name and "As your clinician prescribed", never an amount
 * (L5): the shape drops the prescription as written before it reaches the page.
 */
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await requirePatientScope();
  const [v, unseen] = await Promise.all([
    loadRecord(scope.userId, id).catch(() => null),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);
  const back = { href: "/patient/me/records", label: C.recordsTitle };
  if (!v)
    return (
      <>
        <PageHeader
          back={back}
          area="me"
          overline={C.myHealth}
          title={C.recordTitle}
          unseen={unseen}
        />
        <Note>{C.recordGone}</Note>
      </>
    );
  return (
    <>
      <PageHeader
        back={back}
        area="me"
        overline={C.myHealth}
        title={C.recordTitle}
        subtitle={`${formatFullDate(v.startedAt)} · ${v.hospitalName}${v.clinician ? ` · ${v.clinician}` : ""}`}
        unseen={unseen}
      />
      <div className="flex max-w-2xl flex-col gap-3">
        <Card className="flex flex-col gap-1">
          <p className="text-[17px] leading-[22px] font-semibold">{v.outcome}</p>
          {v.outcomeNote ? <p className="text-pw-ink-2 text-[15px]">{v.outcomeNote}</p> : null}
        </Card>

        {v.found.length ? (
          <Section title={SUMMARY_HEADINGS.found}>
            {v.found.map((f) => (
              <Line key={f.id} text={f.text} sub={f.detail} />
            ))}
          </Section>
        ) : null}

        {v.medicines.length ? (
          <Section title={SUMMARY_HEADINGS.medicines}>
            {v.medicines.map((m) => (
              <div key={m.prescriptionId} className="flex flex-col gap-2">
                <Line text={m.name} sub={C.asPrescribed} />
                <AddMedicine
                  summaryId={v.id}
                  prescriptionId={m.prescriptionId}
                  name={m.name}
                  inMedicines={m.inMyMedicines}
                />
              </div>
            ))}
            <p className="text-pw-ink-2 text-[15px]">{C.noDoseTimes}</p>
            <TextLink href="/patient/care/medicines" className="self-start">
              {C.yourMedicines}
            </TextLink>
          </Section>
        ) : null}

        {v.stopped.length ? (
          <Section title={SUMMARY_HEADINGS.stopped}>
            {v.stopped.map((m) => (
              <Line key={m.id} text={m.name} />
            ))}
          </Section>
        ) : null}

        {v.tests.length ? (
          <Section title={SUMMARY_HEADINGS.tests}>
            {v.tests.map((x) => (
              <Line key={x.id} text={x.name} />
            ))}
            {v.testsNote ? <Note>{v.testsNote}</Note> : null}
          </Section>
        ) : null}

        {v.next ? (
          <Section title={SUMMARY_HEADINGS.next}>
            <p className="text-[17px]">{v.next}</p>
            <TextLink href="/patient/visits" className="self-start">
              {C.yourVisits}
            </TextLink>
          </Section>
        ) : null}

        {v.comeBackIf ? (
          <Section title={C.comeBackIf}>
            <p className="text-[17px]">{v.comeBackIf}</p>
          </Section>
        ) : null}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-xl leading-[26px] font-semibold tracking-[-0.015em]">{title}</h2>
      {children}
    </Card>
  );
}

function Line({ text, sub }: { text: string; sub?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[15px] font-semibold">{text}</p>
      {sub ? <p className="text-pw-ink-2 text-[15px]">{sub}</p> : null}
    </div>
  );
}
