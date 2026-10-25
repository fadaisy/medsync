import type { EmergencySheetContact } from "@/lib/emergency/queries";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Building2Icon, PhoneIcon } from "lucide-react";

import { CallLink } from "@/app/emergency/_components/call-link";
import { FIRST_AID_CARDS } from "@/app/emergency/_components/emergency-sheet";
import { telHref } from "@/app/emergency/_lib/client";
import { loadEmergencyContext, splitContacts } from "@/app/emergency/_lib/sheet";
import { buttonClass, ButtonLink, Card, ICON, TextLink } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { HELP_COPY } from "@/content/patient/help";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { firstAidCardsLive, preAlertLive } from "@/lib/emergency/feature";
import { canDial } from "@/lib/patient-web/help-device";
import { cn } from "@/lib/utils";
import { CATALOG } from "@/supabase/functions/_shared/symptom-catalog/catalog.v0.1";
import { t } from "@/supabase/functions/_shared/symptom-catalog/classify";

export const metadata: Metadata = { title: "Emergency lines" };
export const dynamic = "force-dynamic";

const C = HELP_COPY.lines;

/**
 * Emergency lines (the phone's components/emergency/emergency-sheet.tsx, E1): the first verified number as the
 * primary call (the patient's own hospital rides first, ADR 0098 ruling 8), up to three more, and with
 * nothing verified "Go to the nearest emergency unit" with no number. Every number is data (W5); unverified
 * rows only outside production, under the watermark. The pre-alert door shows behind FEATURE_PRE_ALERT.
 */
export default async function LinesPage() {
  const [ctx, h] = await Promise.all([loadEmergencyContext(), headers()]);
  const dialler = canDial(h.get("user-agent"));
  const { primary, secondaries, drafts } = splitContacts(ctx.sheet.contacts);
  const shownDrafts = ctx.drafts ? drafts.slice(0, 3) : [];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <PageHeader
        back={{ href: "/emergency", label: C.back }}
        title={t(CATALOG, "tier.E")}
        hideHelp
      />
      <p className="-mt-2 text-[17px] leading-[25px] font-medium">{C.lead}</p>

      {primary ? (
        <div className="flex flex-col gap-2">
          <CallLink
            href={telHref(primary.number)}
            contactId={primary.id}
            className={cn(
              buttonClass("danger"),
              "rounded-pw-card h-auto min-h-16 justify-start gap-3 px-5 py-3",
            )}
          >
            <PhoneIcon className="size-6 shrink-0" {...ICON} />
            <span className="flex flex-col items-start gap-1 text-left">
              <span aria-hidden className="text-[17px]">
                {C.call(primary.label)}
              </span>
              <span aria-hidden className="font-pw-mono text-[20px] tracking-[0.04em]">
                {primary.number}
              </span>
              <span className="sr-only">{C.callLabel(primary.label, primary.number)}</span>
            </span>
          </CallLink>
          {dialler ? null : (
            <p className="text-[15px] leading-[21px] font-semibold">
              {PATIENT_WEB_COPY.desktopCall.replace("{number}", primary.number)}
            </p>
          )}
        </div>
      ) : (
        <div
          role="status"
          className="bg-pw-critical-tint rounded-pw-card flex items-start gap-3 p-5"
        >
          <Building2Icon className="text-pw-critical-text mt-0.5 size-5 shrink-0" {...ICON} />
          <div className="flex flex-col gap-1">
            <p className="text-pw-critical-text text-[17px] font-semibold">{C.noNumberTitle}</p>
            <p className="text-[15px] leading-[21px]">{C.noNumberBody}</p>
          </div>
        </div>
      )}

      {secondaries.length ? (
        <ul aria-label={C.other} className="flex flex-col gap-2">
          {secondaries.map((c) => (
            <li key={c.id}>
              <ContactRow c={c} />
            </li>
          ))}
        </ul>
      ) : null}

      {preAlertLive() ? (
        <ButtonLink href="/emergency/tell" tone="outline" className="self-start">
          {C.tell}
        </ButtonLink>
      ) : null}

      {shownDrafts.length ? (
        <section className="border-pw-line-strong rounded-pw-card flex flex-col gap-2 border border-dashed p-4">
          <p className="text-pw-ink-2 text-xs font-semibold tracking-[0.06em] uppercase">
            {PATIENT_WEB_COPY.unsignedCatalogue}
          </p>
          <p className="text-pw-ink-2 text-sm">{C.watermark}</p>
          <ul className="flex flex-col gap-2">
            {shownDrafts.map((c) => (
              <li key={c.id}>
                <ContactRow c={c} draft />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {firstAidCardsLive() ? (
        <section className="border-pw-line-strong rounded-pw-card flex flex-col gap-2 border border-dashed p-4">
          <p className="text-pw-ink-2 text-xs font-semibold tracking-[0.06em] uppercase">
            {PATIENT_WEB_COPY.unsignedCatalogue}
          </p>
          {FIRST_AID_CARDS.map((card) => (
            <Card key={card} className="text-[17px]">
              {card}
            </Card>
          ))}
        </section>
      ) : null}

      <nav aria-label={C.other} className="flex flex-col">
        <TextLink href="/emergency/crisis">{HELP_COPY.rows.crisis}</TextLink>
        <TextLink href="/emergency/sexual-violence">{HELP_COPY.rows.sv}</TextLink>
      </nav>
    </div>
  );
}

function ContactRow({ c, draft }: { c: EmergencySheetContact; draft?: boolean }) {
  const kind = C.kind[c.kind];
  return (
    <CallLink
      href={telHref(c.number)}
      contactId={c.id}
      className={cn(
        "bg-pw-surface shadow-pw-card rounded-pw-row flex min-h-14 items-center gap-3 px-4 py-2",
        "focus-visible:outline-pw-focus focus-visible:outline-2 focus-visible:outline-offset-2",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-pw-ink-2 text-xs font-semibold tracking-[0.04em] uppercase">
          {kind}
          {draft ? C.unverified : ""}
        </span>
        <span className="text-[15px]">{c.label}</span>
      </span>
      <span className="font-pw-mono text-[17px] font-semibold">{c.number}</span>
    </CallLink>
  );
}
