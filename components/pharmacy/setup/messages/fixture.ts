import type { MessagesView, OutboxRow } from "@/lib/pharmacy/setup/types";

import { SMS_TEMPLATES } from "@/content/pharmacy-setup";

/**
 * Synthetic Messages view for previews and tests: masked numbers only, no Luganda text (lg is always null),
 * budget at about 60 %, one failed and one held-by-quiet-hours row, two opt-outs. Never real data.
 */
const SENT: Record<string, number> = {
  refill_due: 412,
  refill_missed: 96,
  course: 58,
  epi_tomorrow: 233,
  epi_defaulter: 41,
  staff_eve: 168,
  staff_change: 12,
  staff_unpub: 3,
  staff_licence: 1,
};
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (day: number, hm: string) => new Date(`2026-11-0${day}T${hm}:00+03:00`).toISOString();
const row = (
  n: number,
  when: string,
  rule: OutboxRow["rule"],
  last3: string,
  status: OutboxRow["status"],
  note: string | null = null,
  day = 3,
): OutboxRow => ({
  id: id(n),
  at: at(day, when),
  rule,
  phoneMasked: `+256 7•• ••• ${last3}`,
  lang: "en",
  note,
  status,
});

export function messagesFixture(): MessagesView {
  return {
    nowMin: 14 * 60 + 55,
    provider: {
      name: "Sample SMS provider",
      senderId: "MEDSYNC",
      costUgx: 35,
      facility: "Test Hospital",
      connected: true,
    },
    budgetUgx: 60_000,
    spentUgx: 35_840,
    rules: { capPct: 100, perPatient: 3 },
    stats: {
      sent: 1024,
      delivered: 963,
      failed: 31,
      queued: 1,
      optedOut: 2,
      consented: 3412,
      patients: 4020,
    },
    templates: SMS_TEMPLATES.map((t) => ({
      key: t.key,
      on: t.on,
      timing: t.timing,
      en: t.en,
      lg: null,
      lgCheckedAt: null,
      sentThisMonth: SENT[t.key] ?? 0,
    })),
    outbox: [
      row(1, "14:52", "refill_due", "093", "delivered"),
      row(2, "14:52", "refill_due", "210", "delivered"),
      row(3, "14:51", "refill_due", "117", "failed", "Phone switched off"),
      row(4, "13:30", "staff_change", "855", "delivered"),
      row(5, "11:05", "course", "482", "sent"),
      row(6, "09:00", "epi_tomorrow", "914", "delivered"),
      row(7, "07:00", "refill_missed", "361", "delivered", "Held overnight by quiet hours"),
      row(8, "20:15", "refill_due", "029", "queued", "Quiet hours: goes at 07:00", 2),
    ],
    optOuts: [
      {
        hmac: "fixture-hmac-0001",
        phoneMasked: "+256 7•• ••• 118",
        reason: null,
        source: "reply_stop",
        at: at(1, "10:12"),
      },
      {
        hmac: "fixture-hmac-0002",
        phoneMasked: "+256 7•• ••• 650",
        reason: "Wrong number",
        source: "staff",
        at: "2026-10-29T08:40:00.000Z",
      },
    ],
    can: { manage: true },
  };
}
