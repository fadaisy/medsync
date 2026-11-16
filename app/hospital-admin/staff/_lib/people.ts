/**
 * People (ADR 0516 phase 2): the page's pure helpers, shared by the server page and the client view. No server
 * imports, no clock: every age is measured once on the server and passed in.
 */
import { PEOPLE } from "@/content/hospital-admin/people";
import { fill } from "@/content/lab-workspace-v2";

export type PeopleTab = "review" | "invites" | "directory" | "admins";
export const PEOPLE_TABS: readonly PeopleTab[] = ["review", "invites", "directory", "admins"];
export const PEOPLE_PATH = "/hospital-admin/staff";

/** `?tab=` to a tab. `pending` is the old name of To review and still opens it, so old links keep working. */
export function peopleTab(raw: string | undefined): PeopleTab {
  if (raw === "invites" || raw === "directory" || raw === "admins") return raw;
  return "review";
}

/** The URL for a tab (and an open person, `aff`). To review is the page's default and needs no `tab`. */
export function peopleHref(tab: PeopleTab, aff?: string | null): string {
  const q = new URLSearchParams();
  if (tab !== "review") q.set("tab", tab);
  if (aff) q.set("aff", aff);
  const s = q.toString();
  return s ? `${PEOPLE_PATH}?${s}` : PEOPLE_PATH;
}

/** A week waiting turns the age into a tag. The tag is neutral; its words carry it (never red, amber or green). */
export const STALE_DAYS = 7;

/** "Asked today", "Asked yesterday", "Asked 3 days ago". */
export function askedText(days: number): string {
  if (days <= 0) return PEOPLE.age.today;
  if (days === 1) return PEOPLE.age.one;
  return fill(PEOPLE.age.days, { n: days });
}

/** "Waiting 9 days" from a week on; null before. */
export function staleTag(days: number): string | null {
  return days >= STALE_DAYS ? fill(PEOPLE.age.stale, { n: days }) : null;
}

/** "full_time" → "Full time". */
export const employmentText = (t: string) => {
  const s = t.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const DAY = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});
/** An ISO instant as a Kampala date: "Thu 12 Nov 2026". The same on the server and in the browser. */
export const dayText = (iso: string) => DAY.format(new Date(iso));

/** Directory filter bucket: an approved affiliation is active. */
export type DirectoryBucket = "active" | "suspended" | "deactivated";
export const bucketOf = (state: string): DirectoryBucket =>
  state === "suspended" ? "suspended" : state === "deactivated" ? "deactivated" : "active";

/** What an admin may do to a directory row, by its state (the same set the old detail sheet offered). */
export type DirectoryAct = "assign_role" | "reset_mfa" | "suspend" | "deactivate" | "reactivate";
export function directoryActs(state: string): DirectoryAct[] {
  const b = bucketOf(state);
  if (b === "active") return ["assign_role", "reset_mfa", "suspend", "deactivate"];
  if (b === "suspended") return ["assign_role", "reset_mfa", "reactivate"];
  return ["reactivate"];
}

/** Admins: primary first, then backup, then those whose designation is not recorded; by name within each. */
export type Designation = "primary" | "backup" | null;
export function sortAdmins<T extends { designation: Designation; fullName: string }>(
  rows: readonly T[],
): T[] {
  const rank = (d: Designation) => (d === "primary" ? 0 : d === "backup" ? 1 : 2);
  return [...rows].sort(
    (a, b) => rank(a.designation) - rank(b.designation) || a.fullName.localeCompare(b.fullName),
  );
}
