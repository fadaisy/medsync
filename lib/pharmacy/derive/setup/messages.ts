/**
 * Set-up › Messages (SETUP-TABS §D, §F): the prototype's `parts`, `fill`, warnings, quiet hours, spend and the
 * Ugandan phone rules. Pure; the warnings' words are the caller's.
 */

/** GSM 03.38 basic set and extension (the prototype's `gsm`). Anything else switches the SMS to UCS-2. */
const GSM =
  /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** 160 per SMS, then 153 per part; one non-GSM character → 70, then 67. */
export function smsParts(text: string) {
  const gsm = GSM.test(text);
  const n = text.length;
  const one = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  return { n, gsm, parts: n === 0 ? 0 : n <= one ? 1 : Math.ceil(n / multi), one };
}

/** Holes filled from the sample (or real) details; unknown holes stay as typed. */
export const fillSample = (t: string, v: Readonly<Record<string, string>>) =>
  t.replace(/\{([^}]+)\}/g, (m, k: string) => v[k] ?? m);

export type TemplateWarning = "long" | "unicode" | "stop" | "noLuganda";
export function templateWarnings(
  text: string,
  filled: string,
  audience: "patients" | "staff",
  lang: "en" | "lg",
): TemplateWarning[] {
  const w: TemplateWarning[] = [];
  const p = smsParts(filled);
  if (text && p.parts > 2) w.push("long");
  if (text && !p.gsm) w.push("unicode");
  if (audience === "patients" && text && !/STOP/.test(text)) w.push("stop");
  if (lang === "lg" && !text) w.push("noLuganda");
  return w;
}

/** Quiet hours 20:00–07:00 (Rules › Messages › Quiet hours). */
export const isQuiet = (nowMin: number) => nowMin >= 1200 || nowMin < 420;

/** The month's spend: parts sent × the cost per SMS. */
export const spend = (msgs: readonly { parts: number; costUgx: number }[]) =>
  msgs.reduce((a, m) => a + m.parts * m.costUgx, 0);

/** Teal; amber at 80 %; red at the signed monthly cap ("sending stopped"). */
export const smsBudgetTone = (pct: number, cap: number) =>
  pct >= cap ? "bad" : pct >= Math.min(80, cap) ? "warn" : "ok";

/** `+256 7xx xxx xxx` or `07xxxxxxxx`. */
export const validPhoneUG = (v: string) =>
  /^\+?256\s?7\d{2}\s?\d{3}\s?\d{3}$/.test(v.trim()) || /^07\d{8}$/.test(v.replace(/\s/g, ""));

/** `+256 772 418 093`, or null when it is not a Ugandan mobile. */
export function normalisePhoneUG(v: string) {
  if (!validPhoneUG(v)) return null;
  let d = v.replace(/\D/g, "");
  if (d.startsWith("0")) d = `256${d.slice(1)}`;
  return `+${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
}
/** E.164 for the provider: `+256772418093`. */
export const e164UG = (pretty: string) => `+${pretty.replace(/\D/g, "")}`;

/** `+256 7•• ••• 093`. */
export function maskPhone(v: string) {
  const d = v.replace(/\D/g, "");
  return d.length < 9 ? v : `+256 7•• ••• ${d.slice(-3)}`;
}

/** Luganda goes out only once a native speaker has checked it; until then the English one is sent. */
export const canSendLuganda = (t: { lg: string | null; lgCheckedAt: string | null }) =>
  !!t.lg && !!t.lgCheckedAt;

/** Sender ID: upper case, A–Z, 0–9 and space, at most 11. */
export const senderId = (v: string) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, 11);
