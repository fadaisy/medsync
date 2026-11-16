"use client";

import type {
  DirectoryAffiliationRow,
  DirectoryDepartmentOption,
  DirectoryRoleOption,
  HospitalAdminRow,
  InvitationRow,
  PendingAffiliationRow,
} from "../_lib/data";
import type { PeopleTab } from "../_lib/people";
import type { IssuedInvitation } from "../actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { k } from "@/components/clinics-schedule/shared";
import { PEOPLE } from "@/content/hospital-admin/people";
import { fill } from "@/content/lab-workspace-v2";
import { peopleHref } from "../_lib/people";
import { AdminsList } from "./admins";
import { DirectoryList, DirectoryPanel } from "./directory";
import { InvitationsList, InviteDialog } from "./invitations";
import { ReviewList, ReviewPanel } from "./review";

/**
 * People (ADR 0520 phase 2), in the Tether desk look: To review, Invitations, Directory and Admins. To review and
 * Directory open a person in a panel beside the list (the desk's detail panel, not a sheet: it never covers the
 * page); every confirmation is a centred dialog or happens in that panel.
 */
export function PeopleView({
  tab: initialTab,
  aff,
  pending,
  invitations,
  directory,
  departments,
  roles,
  admins,
  me,
}: {
  tab: PeopleTab;
  aff: string | null;
  pending: readonly PendingAffiliationRow[];
  invitations: readonly InvitationRow[];
  directory: readonly DirectoryAffiliationRow[];
  departments: readonly DirectoryDepartmentOption[];
  roles: readonly DirectoryRoleOption[];
  admins: readonly HospitalAdminRow[];
  me: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<PeopleTab>(initialTab);
  const [sel, setSel] = useState<string | null>(aff);
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<readonly IssuedInvitation[]>([]);
  const [said, setSaid] = useState("");

  const go = (t: PeopleTab, id: string | null = null) => {
    setTab(t);
    setSel(id);
    router.replace(peopleHref(t, id), { scroll: false });
  };
  const open = (id: string | null) => go(tab, id);
  const say = (text: string) => setSaid(text);

  // A person who left the list (approved, declined, or the link was stale) closes the panel.
  const reviewing = tab === "review" ? (pending.find((r) => r.id === sel) ?? null) : null;
  const member = tab === "directory" ? (directory.find((r) => r.id === sel) ?? null) : null;

  const lead =
    tab === "review"
      ? fill(PEOPLE.review.count, { n: pending.length })
      : tab === "invites"
        ? fill(PEOPLE.invites.count, { n: invitations.length })
        : tab === "directory"
          ? fill(PEOPLE.directory.count, { n: directory.length })
          : PEOPLE.admins.lead;

  const tabs: ReadonlyArray<[PeopleTab, string, number | null]> = [
    ["review", PEOPLE.tabs.review, pending.length],
    ["invites", PEOPLE.tabs.invites, invitations.filter((i) => i.status === "pending").length],
    ["directory", PEOPLE.tabs.directory, directory.length],
    ["admins", PEOPLE.tabs.admins, admins.length],
  ];

  return (
    <div className={k("su-wrap", (reviewing || member) && "su-split")}>
      <div className={k("su-page", "su-l")}>
        <div className={k("ahead")}>
          <div className={k("ahl")}>
            <h1>{PEOPLE.title}</h1>
            <span className={k("adate")}>{lead}</span>
          </div>
          <span className={k("grow")} />
          <button
            type="button"
            className={k("btn", "sm", tab === "invites" && "k")}
            onClick={() => setInviting(true)}
          >
            {PEOPLE.invite}
          </button>
        </div>
        <div className={k("su-ctb")}>
          <div className={k("su-cfs")} role="tablist" aria-label={PEOPLE.title}>
            {tabs.map(([t, label, n]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                className={k(tab === t && "on")}
                onClick={() => go(t)}
              >
                {label}
                {n != null ? <b>{n}</b> : null}
              </button>
            ))}
          </div>
          <span className={k("grow")} />
          <Link className={k("btn", "sm", "q")} href="/hospital-admin/clinics?view=people">
            {PEOPLE.team}
          </Link>
        </div>

        {tab === "review" ? (
          <ReviewList rows={pending} sel={reviewing?.id ?? null} onOpen={open} />
        ) : null}
        {tab === "invites" ? (
          <InvitationsList rows={invitations} issued={issued} say={say} />
        ) : null}
        {tab === "directory" ? (
          <DirectoryList
            rows={directory}
            departments={departments}
            sel={member?.id ?? null}
            onOpen={open}
          />
        ) : null}
        {tab === "admins" ? <AdminsList rows={admins} me={me} /> : null}

        <p className={k("su-note")} role="status" aria-live="polite">
          {said}
        </p>
      </div>

      {reviewing ? (
        <ReviewPanel
          key={reviewing.id}
          row={reviewing}
          onClose={() => open(null)}
          onDone={(text, keep) => {
            say(text);
            if (!keep) open(null);
            router.refresh();
          }}
        />
      ) : null}
      {member ? (
        <DirectoryPanel
          key={member.id}
          row={member}
          departments={departments}
          roles={roles}
          onClose={() => open(null)}
          onDone={(text) => {
            say(text);
            router.refresh();
          }}
        />
      ) : null}

      <InviteDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onSent={(list) => {
          setInviting(false);
          setIssued(list);
          say(fill(PEOPLE.invites.sentSay, { n: list.length }));
          go("invites");
          router.refresh();
        }}
      />
    </div>
  );
}
