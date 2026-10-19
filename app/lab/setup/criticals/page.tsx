import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StatusWord } from "@/components/emr/status-word";
import { LAB } from "@/content/lab";
import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { requireLabTechScope } from "@/lib/lab-tech/scope";
import { loadCriticalsSetup } from "@/lib/lab/criticals/setup";
import { labCriticalsLiveFor } from "@/lib/lab/feature";
import { LAB_TIME_ZONE } from "@/lib/lab/page-data";
import { SetupHeader } from "../_components/setup-header";
import { Caution } from "../../criticals/_components/alert-bits";
import {
  ContactsEditor,
  ResponseDraftForm,
  SeedTemplates,
  SettingsForm,
  SignAsLead,
  TemplateEditor,
} from "./_components/setup-forms";

export const metadata: Metadata = { title: "Critical results set-up · Laboratory · MedSync" };
export const dynamic = "force-dynamic";

/**
 * Critical-results set-up (Lab Phase 1 §5.8, the response-times and contacts half of artboard 11):
 * the lab's number and settings, response times (drafted here, signed by the laboratory lead here and
 * by the CSO from the super-admin surface), who receives escalations, and the SMS wording with two
 * approvers. The banner says the truth for this hospital. No value ships (D-LAB1-08).
 */
export default async function CriticalsSetupPage() {
  const scope = await requireLabTechScope();
  if (
    !scope.workspaceLive ||
    !emrV1LiveFor(scope.hospitalId) ||
    !labCriticalsLiveFor(scope.hospitalId)
  )
    notFound();
  if (!scope.access.permissions.has("lab.manage")) notFound();
  const s = await db.transaction((tx) => loadCriticalsSetup(tx as never, scope.hospitalId));
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: LAB_TIME_ZONE,
  });
  const signed = s.versions.find((v) => v.status === "signed");
  const draft = s.versions.find((v) => v.status === "draft" && !v.leadSignedBy);
  const awaitingCso = s.versions.find((v) => v.status === "draft" && v.leadSignedBy);
  const name = new Map(s.clinicians.map((c) => [c.userId, `${c.name}, ${c.cadre}`]));
  const options = [
    ...new Map(
      s.clinicians.map((c) => [c.userId, { userId: c.userId, label: `${c.name}, ${c.cadre}` }]),
    ).values(),
  ];
  // Clinical departments: everything but the laboratory's own tree.
  const labTree = new Set(s.departments.filter((d) => /laborator/i.test(d.name)).map((d) => d.id));
  const departments = s.departments.filter(
    (d) => !labTree.has(d.id) && !(d.parentId && labTree.has(d.parentId)),
  );
  const contactsFor = (departmentId: string | null, level: 1 | 2) =>
    s.contacts
      .filter((c) => c.level === level && c.departmentId === departmentId)
      .map((c) => ({ userId: c.userId, name: name.get(c.userId) ?? "Staff" }));
  const tpl = (kind: "level0" | "escalation") => {
    const rows = s.templates.filter((t) => t.kind === kind);
    const one = (status: string) => rows.find((t) => t.status === status) ?? null;
    return { current: one("approved"), pendingReview: one("pending_review"), draft: one("draft") };
  };
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-6 sm:px-6">
      <SetupHeader
        place={`${scope.hospitalName} · ${LAB.place}`}
        placeInTopBar
        title="Critical results set-up"
      />

      {signed ? (
        <p className="text-body-s flex flex-wrap items-center gap-2">
          <StatusWord>Signed</StatusWord>
          Response times version {signed.version}, in force since{" "}
          {signed.csoSignedAt ? date.format(signed.csoSignedAt) : "signing"}: acknowledge within{" "}
          {signed.ackWithinMin} min
          {signed.level1AfterMin
            ? `; level 1 waits ${signed.level1AfterMin} min`
            : "; level 1 does not escalate by itself"}
          .
        </p>
      ) : (
        <Caution>
          No response times are signed for this hospital, so alerts send but nothing escalates by
          itself. Phone the ward for every critical.
        </Caution>
      )}

      <section aria-labelledby="settings" className="flex flex-col gap-3">
        <h2 id="settings" className="text-heading-s">
          The lab
        </h2>
        <SettingsForm
          initial={{
            labPhone: s.settings?.labPhone ?? null,
            secondCheck: s.settings?.secondCheck ?? false,
            smsLive: s.settings?.smsLive ?? false,
          }}
        />
      </section>

      <section aria-labelledby="times" className="flex flex-col gap-3">
        <h2 id="times" className="text-heading-s">
          Response times
        </h2>
        <p className="text-body-s text-muted-foreground">
          Typed by the hospital and signed by the laboratory lead and then the CSO. Consult RCPath
          G158 and the lab&apos;s own critical-call procedure. A new draft leaves the signed set in
          force until it is signed.
        </p>
        {awaitingCso ? (
          <p className="text-body-s flex flex-wrap items-center gap-2">
            <StatusWord tone="caution">Waiting for the CSO</StatusWord>
            Version {awaitingCso.version}: acknowledge within {awaitingCso.ackWithinMin} min, signed
            by the laboratory lead.
          </p>
        ) : null}
        <ResponseDraftForm draft={draft ?? null} />
        {draft ? (
          <div className="flex flex-col gap-1">
            <p className="text-body-s">
              Draft version {draft.version}: acknowledge within {draft.ackWithinMin} min
              {draft.level1AfterMin ? `, level 1 ${draft.level1AfterMin} min` : ""}
              {draft.level2AfterMin ? `, level 2 ${draft.level2AfterMin} min` : ""}.
            </p>
            <SignAsLead versionId={draft.id} author={draft.authoredBy === scope.userId} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="contacts" className="flex flex-col gap-4">
        <h2 id="contacts" className="text-heading-s">
          Who receives escalations
        </h2>
        <p className="text-body-s text-muted-foreground">
          Level 1: each department&apos;s critical-results contacts, in order. Level 2: the
          hospital&apos;s. MedSync has no on-call roster, so these lists stand in for one.
        </p>
        {departments.map((d) => {
          const list = contactsFor(d.id, 1);
          return (
            <div key={d.id} className="border-border flex flex-col gap-2 border-t pt-3">
              <p className="text-body-s font-medium">{d.name}</p>
              {list.length === 0 ? (
                <Caution>Nobody will receive escalations for {d.name}.</Caution>
              ) : null}
              <ContactsEditor departmentId={d.id} level={1} chosen={list} options={options} />
            </div>
          );
        })}
        <div className="border-border flex flex-col gap-2 border-t pt-3">
          <p className="text-body-s font-medium">The hospital (level 2)</p>
          {contactsFor(null, 2).length === 0 ? (
            <Caution>Nobody will receive escalations at the last level.</Caution>
          ) : null}
          <ContactsEditor
            departmentId={null}
            level={2}
            chosen={contactsFor(null, 2)}
            options={options}
          />
        </div>
      </section>

      <section aria-labelledby="sms" className="flex flex-col gap-4">
        <h2 id="sms" className="text-heading-s">
          SMS wording
        </h2>
        <p className="text-body-s text-muted-foreground">
          Two different people approve each message before it can send. A message never names the
          patient, the test or the value.
        </p>
        {s.templates.length === 0 ? (
          <SeedTemplates />
        ) : (
          <>
            <TemplateEditor
              kind="level0"
              label="First message"
              {...tpl("level0")}
              me={scope.userId}
            />
            <TemplateEditor
              kind="escalation"
              label="Escalation message"
              {...tpl("escalation")}
              me={scope.userId}
            />
          </>
        )}
      </section>
    </div>
  );
}
