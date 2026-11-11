import { RC } from "@/content/pharmacy-receive";
import { NO_EXPIRY_WORD } from "@/content/pharmacy-supplies";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const num = (x: number) => Number(x).toLocaleString("en-GB");
export const plural = (n: number, one: string, many?: string) =>
  `${num(n)} ${n === 1 ? one : (many ?? `${one}s`)}`;
export const money = (x: number) => `UGX ${num(Math.round(x))}`;
export const hm = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
};
/** `2026-11-04 12:40` → `4 Nov 2026, 12:40`; a date alone stays a date. */
export const atText = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?/.exec(s || "");
  if (!m) return s || RC.dash;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}${m[4] ? `, ${m[4]}` : ""}`;
};
/** `2028-06` → `Jun 2028`, `2028-06-30` → `30 Jun 2028`. */
export const expText = (norm: string | null, raw: string) => {
  if (!norm) return raw || RC.dash;
  if (norm.startsWith("2099")) return NO_EXPIRY_WORD;
  const [y, m, d] = norm.split("-");
  return `${d ? `${Number(d)} ` : ""}${MONTHS[Number(m) - 1]} ${y}`;
};
export const addDaysIso = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
};
export const daysBetween = (from: string, to: string) => {
  const f = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((f(to) - f(from)) / 86_400_000);
};
/** Minutes between two `YYYY-MM-DD HH:MM`, never below zero; null if either is missing. */
export const minsBetween = (a: string, b: string) => {
  const f = (x: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(x || "");
    return m ? Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!) : null;
  };
  const x = f(a);
  const y = f(b);
  return x === null || y === null ? null : Math.max(0, Math.round((y - x) / 60_000));
};
