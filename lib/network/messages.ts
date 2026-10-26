import type { MessageChannel, RenderResult, ScanExtras } from "@/lib/pharmacy/messages";

import { NETWORK_MESSAGES } from "@/content/pharmacy-network";
import { bannedTermsScan, gsm7Length, SMS_LIMIT } from "@/lib/pharmacy/messages";

/**
 * Messages and reports (Pharmacy Phase 4, 6.7: NM-1 to NM-3; Law 12, D-PH4-16). Pure. Rendered as Phase 1's MS-1
 * renders: given only the kind, the hospital's message name, the partner's trading name where the kind needs it, a
 * date where it needs one, and the pharmacy's phone.
 */

export type NetworkMessageKind = keyof typeof NETWORK_MESSAGES;

const NEEDS: Readonly<Record<NetworkMessageKind, readonly ("pharmacy" | "date" | "phone")[]>> = {
  refill_due: [],
  refill_ready: ["date"],
  sent_to_clinic: [],
  renewal_answered: ["phone"],
  partner_accepted: ["pharmacy"],
  partner_declined: ["pharmacy", "phone"],
  not_collected: ["date"],
};

/** NM-1. `template` is the approved body from the template store; without one, the 5.10 wording. */
export function renderNetworkMessage(
  kind: NetworkMessageKind,
  v: { messageName: string; pharmacy?: string; date?: string; phone?: string | null },
  channel: MessageChannel = "sms",
  template?: string,
): RenderResult | { ok: false; reason: "missing_value" } {
  const hospital = v.messageName.trim();
  if (!hospital) return { ok: false, reason: "no_message_name" };
  const values: Record<string, string> = {
    hospital,
    pharmacy: v.pharmacy?.trim() ?? "",
    date: v.date ?? "",
    phone: v.phone?.trim() ?? "",
  };
  for (const need of NEEDS[kind])
    if (!values[need])
      return need === "phone"
        ? { ok: false, reason: "no_point_phone" }
        : { ok: false, reason: "missing_value" };
  const text = (template ?? NETWORK_MESSAGES[kind]).replace(
    /\{(\w+)\}/g,
    (m, k: string) => values[k] ?? m,
  );
  const len = gsm7Length(text);
  return { ok: true, text, fitsOneSms: channel === "sms" && len !== null && len <= SMS_LIMIT };
}

/**
 * NM-2: MS-2's scan, with every partner's trading name added for each kind that does not name a partner (a partner
 * name in a message that should not carry one could point at a condition).
 */
export const scanNetworkTemplate = (
  kind: NetworkMessageKind,
  text: string,
  partnerNames: readonly string[],
  extras: ScanExtras = {},
) =>
  bannedTermsScan(text, {
    ...extras,
    places: [...(extras.places ?? []), ...(NEEDS[kind].includes("pharmacy") ? [] : partnerNames)],
  });

/** NM-3: a report figure carries its definition; no figure is an identifier. */
export interface Figure {
  value: number | null;
  definition: string;
}

export const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** 5.11: counts of `key` per group, each with the definition the report prints beside it. */
export function countFigures<R>(
  rows: readonly R[],
  group: (r: R) => string,
  definition: string,
): Map<string, Figure> {
  const out = new Map<string, Figure>();
  for (const r of rows) {
    const g = group(r);
    out.set(g, { value: (out.get(g)?.value ?? 0) + 1, definition });
  }
  return out;
}
