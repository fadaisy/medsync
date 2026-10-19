import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { LAB } from "@/content/lab";
import { LAB2 } from "@/content/lab-phase-2";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import {
  labBedsideLiveFor,
  labHighRiskLiveFor,
  labPaymentLiveFor,
  labSettingsLiveFor,
} from "@/lib/lab/feature";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { loadBedsideRegister, loadLabSettingsPage } from "@/lib/lab/settings-read";
import { SetupHeader } from "../_components/setup-header";
import { AddDevice, DeviceActions, OperatorToggle } from "./_components/bedside-register";
import {
  EgfrSwitch,
  ElevationForm,
  HivEditor,
  PaymentModeForm,
  ProcedureForm,
  SignAsLead,
} from "./_components/settings-forms";
import { SETTINGS as C } from "./_lib/copy";

export const metadata: Metadata = { title: "Lab settings · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id={id} className="text-heading-s">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Lab settings (Lab Phase 2 §5.14, artboard 14): payment before the sample (labPayment) and the high-risk
 * specimen procedure (labHighRiskWarning), the hospital's elevation and HIV algorithm (each signed by
 * the laboratory lead and the CSO, DS-7) and eGFR reporting (EG-1). No field is pre-filled: a value shows
 * only when a saved draft or a signed version holds it.
 */
export default async function LabSettingsPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labSettingsLiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const bedsideLive = labBedsideLiveFor(scope.hospitalId);
  const [s, bedside] = await Promise.all([
    db.transaction((tx) => loadLabSettingsPage(tx as never, scope.hospitalId)),
    bedsideLive ? loadBedsideRegister(db as never, scope.hospitalId) : null,
  ]);
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: LAB_TIME_ZONE,
  });
  const when = (d: Date | null) => (d ? date.format(d) : "");
  const { elevation: el, hiv } = s;
  const hivSummary = (p: NonNullable<typeof hiv.signed>["payload"]) =>
    C.hiv.summary(
      p.assays.map((a) => `${a.step}. ${a.kit}`).join(", "),
      p.rules.length,
      p.retestDays,
      p.circular,
    );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6">
      <SetupHeader place={`${scope.hospitalName} · ${LAB.place}`} placeInTopBar title={C.title} />

      {labPaymentLiveFor(scope.hospitalId) ? (
        <Section id="payment-heading" title={C.payment.title}>
          <PaymentModeForm
            mode={s.paymentMode === "inform" || s.paymentMode === "hold" ? s.paymentMode : "off"}
          />
          <p className="text-body-s">{LAB2.payment.neverHeld}</p>
          <p className="text-body-s">
            <span className="text-muted-foreground">{C.payment.recordedBy}:</span>{" "}
            {C.payment.cashier}
          </p>
        </Section>
      ) : null}

      {labHighRiskLiveFor(scope.hospitalId) ? (
        <Section id="procedure-heading" title={C.procedure.title}>
          <ProcedureForm initial={s.highRiskProcedure} />
          <p className="text-body-s text-muted-foreground max-w-[75ch]">{C.procedure.line}</p>
        </Section>
      ) : null}

      {bedside ? (
        <Section id="bedside-heading" title={C.bedside.title}>
          <p className="text-body-s text-muted-foreground max-w-[75ch]">{C.bedside.line}</p>
          {bedside.devices.length === 0 ? (
            <p className="text-body-s">{C.bedside.none}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-body-s w-full border-collapse text-left">
                <thead>
                  <tr className="text-caption text-muted-foreground">
                    {C.bedside.columns.map((h) => (
                      <th key={h} scope="col" className="py-2 pr-4 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bedside.devices.map((d) => (
                    <tr key={d.id} className="border-border/60 border-t align-top">
                      <td className="py-2 pr-4">
                        <span className="flex flex-col">
                          <span>{d.model}</span>
                          <span className="text-caption text-muted-foreground">
                            {C.bedside.kinds[d.kind as keyof typeof C.bedside.kinds] ?? d.kind}
                            {d.serial ? ` · ${d.serial}` : ""}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 pr-4">{d.test ?? "—"}</td>
                      <td className="py-2 pr-4">{d.ward ?? C.bedside.hospitalWide}</td>
                      <td className="py-2 pr-4">
                        {d.lot
                          ? d.lot.useBy
                            ? C.bedside.lotUseBy(
                                d.lot.lot,
                                date.format(new Date(`${d.lot.useBy}T12:00:00Z`)),
                              )
                            : d.lot.lot
                          : C.bedside.noLot}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusWord tone={d.state === "not_verified" ? "caution" : "neutral"}>
                          {C.bedside.states[d.state as keyof typeof C.bedside.states] ?? d.state}
                        </StatusWord>
                      </td>
                      <td className="py-2">
                        <DeviceActions deviceId={d.id} model={d.model} state={d.state} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <AddDevice wards={bedside.wards} tests={bedside.tests} />
          <h3 className="text-heading-s mt-2">{C.bedside.operators}</h3>
          <p className="text-body-s text-muted-foreground max-w-[75ch]">
            {C.bedside.operatorsLine}
          </p>
          {bedside.operators.length === 0 ? (
            <p className="text-body-s">{C.bedside.noStaff}</p>
          ) : (
            <ul className="divide-border/60 flex flex-col divide-y">
              {bedside.operators.map((o) => (
                <li
                  key={o.userId}
                  className="flex flex-wrap items-start justify-between gap-3 py-2"
                >
                  <span className="text-body-s flex flex-col">
                    <span>{o.name}</span>
                    <span className="text-caption text-muted-foreground">
                      {o.cadre} · {o.granted ? C.bedside.grantedWord : C.bedside.notGrantedWord}
                    </span>
                  </span>
                  <OperatorToggle userId={o.userId} name={o.name} granted={o.granted} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      <Section id="elevation-heading" title={C.elevation.title}>
        <p className="text-body-s">
          {el.signed
            ? C.elevation.signed(
                el.signed.payload.metres,
                el.signed.payload.source,
                when(el.signed.inForceFrom),
              )
            : C.elevation.none}
        </p>
        {el.awaitingCso ? (
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <StatusWord tone="caution">{C.waiting}</StatusWord>
            {C.elevation.awaiting(el.awaitingCso.payload.metres)}
          </p>
        ) : null}
        {el.draft ? <StatusWord className="w-fit">{C.draftOpen}</StatusWord> : null}
        <ElevationForm
          key={el.draft?.id ?? el.awaitingCso?.id ?? "new"}
          initial={el.draft?.payload ?? el.awaitingCso?.payload ?? el.signed?.payload ?? null}
        />
        {el.draft ? (
          <SignAsLead configId={el.draft.id} authoredByMe={el.draft.authoredBy === scope.userId} />
        ) : null}
        <p className="text-body-s text-muted-foreground">{C.csoLine}</p>
      </Section>

      <Section id="egfr-heading" title={C.egfr.title}>
        <EgfrSwitch on={s.reportEgfr} />
        <p className="text-body-s text-muted-foreground max-w-[75ch]">{C.egfr.line}</p>
      </Section>

      <Section id="hiv-heading" title={C.hiv.title}>
        <p className="text-body-s">
          {hiv.signed ? (
            <>
              {hivSummary(hiv.signed.payload)}
              <span className="text-muted-foreground">
                {" "}
                · {C.hiv.signedOn(when(hiv.signed.inForceFrom))}
              </span>
            </>
          ) : (
            C.hiv.notSet
          )}
        </p>
        {hiv.awaitingCso ? (
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <StatusWord tone="caution">{C.waiting}</StatusWord>
            {hivSummary(hiv.awaitingCso.payload)}
          </p>
        ) : null}
        {hiv.draft ? (
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <StatusWord>{C.draftOpen}</StatusWord>
            {hiv.draft.payload ? hivSummary(hiv.draft.payload) : null}
          </p>
        ) : null}
        <HivEditor
          key={hiv.draft?.id ?? hiv.awaitingCso?.id ?? "new"}
          initial={hiv.draft?.payload ?? hiv.awaitingCso?.payload ?? hiv.signed?.payload ?? null}
        />
        {hiv.draft ? (
          <SignAsLead
            configId={hiv.draft.id}
            authoredByMe={hiv.draft.authoredBy === scope.userId}
          />
        ) : null}
        <p className="text-body-s text-muted-foreground max-w-[75ch]">{C.hiv.line}</p>
        <p className="text-body-s text-muted-foreground">{C.csoLine}</p>
      </Section>
    </div>
  );
}
