import type { Metadata } from "next";
import { initials } from "@patient-core/me-health";
import { HOUSEHOLD_RELATIONSHIPS } from "@patient-core/me-profile";

import { Avatar, EmptyState } from "@/components/tide/kit";
import { PageHeader } from "@/components/tide/shell";
import { ME_COPY as C } from "@/content/patient/me";
import { countUnseenNotifications } from "@/lib/patient-web/notifications";
import { fetchHousehold } from "@/lib/patient/household";
import { requirePatientScope } from "@/lib/patient/scope";
import { RetryButton } from "../../_components/home-bits";
import { HouseholdForm } from "./_components/household-form";

export const metadata: Metadata = { title: "People I book for · MedSync" };
export const dynamic = "force-dynamic";

/**
 * People I book for (the phone's (app)/household.tsx, rebuilt in Tide; PRD §2.9, ADR 0089): the account's
 * live `booking_agents` rows, never a member's encrypted name or phone. Adding someone is one call to
 * `pt-add-household-member`; adults only, with the required switch (S19). Removal has no writer yet.
 */
export default async function HouseholdPage() {
  const scope = await requirePatientScope();
  const [members, unseen] = await Promise.all([
    fetchHousehold(scope.userId).catch(() => null),
    countUnseenNotifications(scope.userId).catch(() => 0),
  ]);
  return (
    <>
      <PageHeader
        back={{ href: "/patient/me", label: C.backToMe }}
        overline={C.people}
        area="me"
        title={C.householdTitle}
        subtitle={C.householdIntro}
        unseen={unseen}
      />
      <div className="flex max-w-2xl flex-col gap-4">
        {members === null ? (
          <EmptyState
            title={C.householdFailed}
            body={C.householdFailedHint}
            action={<RetryButton />}
          />
        ) : (
          <>
            {members.length === 0 ? (
              <p className="text-pw-ink-2 text-[17px]">{C.nobody}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {members.map((m) => (
                  <li
                    key={m.bookingAgentId}
                    className="rounded-pw-card bg-pw-surface shadow-pw-card flex items-center gap-3 p-4"
                  >
                    <Avatar
                      initials={initials(m.memberLabel)}
                      label={m.memberLabel}
                      className="bg-pw-place-tint text-pw-place-text"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[17px] font-semibold">{m.memberLabel}</span>
                      <span className="text-pw-ink-2 text-[15px]">
                        {HOUSEHOLD_RELATIONSHIPS.find((r) => r.value === m.relationship)?.label ??
                          m.relationship}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <HouseholdForm />
          </>
        )}
      </div>
    </>
  );
}
