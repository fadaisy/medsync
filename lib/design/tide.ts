/**
 * Which surface groups render in MedSync Tide (D-TW-10, D-TW-15). `TIDE_SURFACES` is "1" for every group, or a
 * comma-separated list of group names; unset, nothing changes. Step 10 deletes this file with Chroma.
 */
export const TIDE_GROUPS = [
  "pharmacy",
  "doctor",
  "resus",
  "nurse",
  "reception",
  "ncd",
  "staff-other",
  "hospital-admin",
  "superadmin",
  "public",
  "patient-web",
] as const;
export type TideGroup = (typeof TIDE_GROUPS)[number];

export function tideOn(group: TideGroup, env: string | undefined = process.env.TIDE_SURFACES): boolean {
  if (!env) return false;
  const list = env.split(",").map((s) => s.trim());
  return list.includes("1") || list.includes(group);
}
