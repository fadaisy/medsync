import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";

import { PageHeader } from "@/components/medsync/page-header";
import { LAB4 } from "@/content/lab-phase-4";
import { db } from "@/db";
import { hospitalDesignations, labSignedConfigs, staffAffiliations, users } from "@/db/schema";
import { governanceScope } from "@/lib/lab/governance-scope";
import { loadPartners, loadReferralSettings } from "@/lib/lab/referral-read";
import { kampalaToday } from "@/lib/lab/referral-words";
import {
  DesignateDialog,
  EndDesignation,
  FieldsDialog,
  LegalDialog,
  SignGovernance,
  WordingDialog,
} from "./_components/governance-forms";

export const metadata: Metadata = { title: "Referral governance · MedSync" };
export const dynamic = "force-dynamic";

const STATE = {
  signed: "Signed",
  draft: "Draft, waiting for a signature",
  missing: "Not entered",
} as const;
const card =
  "border-border bg-card shadow-card text-body-s flex flex-col gap-3 rounded-lg border p-4";

/**
 * The referral governance desk (Lab Phase 4 P8, A6): the data protection lead records each partner's legal basis,
 * agreement and field list under the DPPA 2019 (PT-2, PT-3), the IPC lead the high-risk wording (D-LAB4-07), and
 * the hospital admin names both. No patient is read here.
 */
export default async function ReferralGovernancePage() {
  const who = await governanceScope();
  const dp = who.roles.includes("data_protection_lead");
  const ipc = who.roles.includes("ipc_lead");
  const [partners, settings, designations, people, drafts] = await db.transaction(
    async (tx) =>
      [
        await loadPartners(tx, who.hospitalId),
        await loadReferralSettings(tx, who.hospitalId),
        await tx
          .select({
            id: hospitalDesignations.id,
            role: hospitalDesignations.role,
            name: users.fullName,
            startsOn: hospitalDesignations.startsOn,
            endsOn: hospitalDesignations.endsOn,
          })
          .from(hospitalDesignations)
          .innerJoin(users, eq(users.id, hospitalDesignations.userId))
          .where(eq(hospitalDesignations.hospitalId, who.hospitalId)),
        who.admin
          ? await tx
              .selectDistinct({ id: users.id, name: users.fullName })
              .from(staffAffiliations)
              .innerJoin(users, eq(users.id, staffAffiliations.userId))
              .where(
                and(
                  eq(staffAffiliations.hospitalId, who.hospitalId),
                  inArray(staffAffiliations.state, ["active", "approved"]),
                ),
              )
          : [],
        await tx
          .select({ id: labSignedConfigs.id, authoredBy: labSignedConfigs.authoredBy })
          .from(labSignedConfigs)
          .where(
            and(
              eq(labSignedConfigs.hospitalId, who.hospitalId),
              eq(labSignedConfigs.status, "draft"),
            ),
          ),
      ] as const,
  );
  const mine = new Set(drafts.filter((d) => d.authoredBy === who.userId).map((d) => d.id));
  const today = kampalaToday();
  const open = designations.filter((d) => d.startsOn <= today && (!d.endsOn || d.endsOn >= today));
  const wording = settings.wording.payload as { highRisk: string; procedureRef: string } | null;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
      <PageHeader place={who.hospitalName} title="Referral governance" />
      <section className={card}>
        <h2 className="text-heading-s">Who is named</h2>
        {(["data_protection_lead", "ipc_lead"] as const).map((role) => (
          <div key={role} className="flex flex-wrap items-center gap-3">
            <b>
              {role === "data_protection_lead"
                ? "Data protection lead"
                : "Infection prevention lead"}
              :
            </b>
            {open
              .filter((d) => d.role === role)
              .map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1">
                  {d.name}
                  {who.admin ? <EndDesignation id={d.id} name={d.name} /> : null}
                </span>
              ))}
            {open.every((d) => d.role !== role) ? (
              <span className="text-muted-foreground">Nobody named</span>
            ) : null}
            {who.admin ? <DesignateDialog role={role} people={people} /> : null}
          </div>
        ))}
      </section>
      {dp || who.admin ? (
        <section className={card}>
          <h2 className="text-heading-s">Partners: legal record and what we send</h2>
          {partners.length === 0 ? (
            <p className="text-muted-foreground">
              The laboratory lead has not added a partner yet.
            </p>
          ) : null}
          <ul className="divide-ink-150 flex flex-col divide-y">
            {partners.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3">
                <p>
                  <b>{p.name}</b> · legal record: {STATE[p.legal.state]} · field list:{" "}
                  {STATE[p.fields.state]}
                  {p.review && p.review !== "ok"
                    ? ` · ${p.review === "pdpo_expired" ? "PDPO registration expired" : "review date passed"}`
                    : ""}
                </p>
                {dp ? (
                  <div className="flex flex-wrap items-start gap-2">
                    <LegalDialog
                      partnerId={p.id}
                      partnerName={p.name}
                      abroad={p.kind === "abroad"}
                    />
                    <FieldsDialog
                      partnerId={p.id}
                      partnerName={p.name}
                      fields={(p.fields.payload as { fields: string[] } | null)?.fields ?? []}
                      clinicalQuestion={
                        (p.fields.payload as { clinicalQuestion?: boolean } | null)
                          ?.clinicalQuestion ?? false
                      }
                    />
                    {p.legal.state === "draft" && p.legal.draftId ? (
                      <SignGovernance
                        kind="partner_legal"
                        configId={p.legal.draftId}
                        authoredByMe={mine.has(p.legal.draftId)}
                        label="Sign the legal record"
                      />
                    ) : null}
                    {p.fields.state === "draft" && p.fields.draftId ? (
                      <SignGovernance
                        kind="partner_fields"
                        configId={p.fields.draftId}
                        authoredByMe={mine.has(p.fields.draftId)}
                        label="Sign the field list"
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {ipc || who.admin ? (
        <section className={card}>
          <h2 className="text-heading-s">High-risk referral wording</h2>
          <p>
            {STATE[settings.wording.state]}
            {settings.wording.state === "draft"
              ? ". After you sign it, the CSO countersigns it in the admin console."
              : ""}
          </p>
          <p className="text-muted-foreground">{wording?.highRisk ?? LAB4.highRiskReferral}</p>
          {ipc ? (
            <div className="flex flex-wrap items-start gap-2">
              <WordingDialog
                text={wording?.highRisk ?? LAB4.highRiskReferral}
                procedureRef={wording?.procedureRef ?? ""}
              />
              {settings.wording.state === "draft" && settings.wording.draftId ? (
                <SignGovernance
                  kind="referral_wording"
                  configId={settings.wording.draftId}
                  authoredByMe={mine.has(settings.wording.draftId)}
                  label="Sign the wording"
                />
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
