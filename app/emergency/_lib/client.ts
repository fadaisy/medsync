/**
 * Client-safe helpers the Emergency Pathway's islands share (no server
 * imports — `_lib/sheet.ts` is the server side).
 */

/** `tel:` keeps digits and a leading plus — the number itself is shown as the hospital verified it. */
export const telHref = (number: string) => `tel:${number.replace(/[^\d+]/g, "")}`;

/** `sms:` with a pre-filled body — `?&body=` is the form both iOS and Android honour. */
export const smsHref = (number: string, body: string) =>
  `sms:${number.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`;

/**
 * What E2 stores on this device on success and E3 reads back: the reporter
 * token (returned once, the capability to read/cancel), when it was sent
 * (the ACK timeout counts from here) and the SMS fallback body.
 * sessionStorage: this tab, gone with it — a token is not for keeping.
 */
export interface StoredPreArrival {
  token: string;
  sentAt: number;
  smsBody: string | null;
}
const KEY = "medsync:pre-arrival:";

export function readStoredPreArrival(id: string): StoredPreArrival | null {
  try {
    const raw = window.sessionStorage.getItem(KEY + id);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<StoredPreArrival>;
    if (typeof d.token !== "string") return null;
    return {
      token: d.token,
      sentAt: typeof d.sentAt === "number" ? d.sentAt : Date.now(),
      smsBody: typeof d.smsBody === "string" ? d.smsBody : null,
    };
  } catch {
    return null;
  }
}

export function writeStoredPreArrival(id: string, value: StoredPreArrival): void {
  try {
    window.sessionStorage.setItem(KEY + id, JSON.stringify(value));
  } catch {
    // E3 then polls without the token: a signed-in reporter still reads their own row.
  }
}
