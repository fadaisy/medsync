import type { SignedCopy } from "@/content/signed-copy";

/**
 * A per-hospital workspace flag (ADR 0229; the EMR_V1 form): "1" turns it on everywhere, a
 * comma-separated list of hospital ids turns it on there. In production it stays off while any of
 * the workspace's safety wording is unsigned (Lab CF-3, Pharmacy CS-5), whatever the variable says;
 * the refusal is logged once per workspace.
 */
export function workspaceLiveFor(
  value: string | undefined,
  hospitalId: string,
  notices: readonly SignedCopy[],
  tag: string,
): boolean {
  const v = value?.trim();
  if (!v) return false;
  if (v !== "1" && !v.split(",").some((id) => id.trim() === hospitalId)) return false;
  return !blockedUnsigned(notices, tag);
}

const warned = new Set<string>();
function blockedUnsigned(notices: readonly SignedCopy[], tag: string): boolean {
  if (process.env.VERCEL_ENV !== "production") return false;
  if (notices.every((n) => n.status === "signed")) return false;
  if (!warned.has(tag)) {
    warned.add(tag);
    console.warn(`${tag}.blocked_unsigned_notice`);
  }
  return true;
}
