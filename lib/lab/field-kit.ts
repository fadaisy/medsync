/**
 * Lab Workspace v2 field kit (prompt 5.12): the pure parts of the date-time field. Values keep the exact string
 * forms the native inputs produced ("YYYY-MM-DD" and "YYYY-MM-DDTHH:mm", wall-clock), so every form and action
 * that read a native input reads the field kit unchanged (Law 1).
 */

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** "0810", "810", "8.10", "8:10", "08:10", "8" → { h, m }; anything else (or out of range) → null. */
export function parseTime(text: string): { h: number; m: number } | null {
  const t = text.trim();
  let h: number;
  let m: number;
  const sep = /^(\d{1,2})[.:h ](\d{2})$/.exec(t);
  if (sep) {
    h = Number(sep[1]);
    m = Number(sep[2]);
  } else if (/^\d{3,4}$/.test(t)) {
    h = Number(t.slice(0, t.length - 2));
    m = Number(t.slice(-2));
  } else if (/^\d{1,2}$/.test(t)) {
    h = Number(t);
    m = 0;
  } else return null;
  if (h > 23 || m > 59) return null;
  return { h, m };
}

export const formatTime = ({ h, m }: { h: number; m: number }) => `${pad(h)}:${pad(m)}`;

/** A date key "YYYY-MM-DD" from a Date's wall-clock parts in the browser's zone (as a native input would). */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localValue(d: Date): string {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" → its two parts; "" → empty parts. */
export function splitValue(v: string): { day: string; time: string } {
  const [day = "", time = ""] = v.split("T");
  return { day, time: time.slice(0, 5) };
}

function keyParts(key: string) {
  const [y, mo, d] = key.split("-").map(Number);
  return { y: y!, mo: mo!, d: d! };
}

function addDays(key: string, n: number): string {
  const { y, mo, d } = keyParts(key);
  const dt = new Date(Date.UTC(y, mo - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** en-GB day words for fields and headers: "Today, Mon 19 Oct", "Yesterday, Sun 18 Oct", "Fri 16 Oct", "Fri 16 Oct 2025". */
export function dayWords(
  key: string,
  todayKey: string,
  words = { today: "Today", yesterday: "Yesterday" },
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  const { y, mo, d } = keyParts(key);
  const wd = WEEKDAY[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]!;
  const base = `${wd} ${d} ${MONTH[mo - 1]}`;
  if (key === todayKey) return `${words.today}, ${base}`;
  if (key === addDays(todayKey, -1)) return `${words.yesterday}, ${base}`;
  return y === keyParts(todayKey).y ? base : `${base} ${y}`;
}

/** "19 OCT 2026": the table form (Law 13). */
export function tableDate(key: string): string {
  const { y, mo, d } = keyParts(key);
  return `${d} ${MONTH[mo - 1]!.toUpperCase()} ${y}`;
}

export const monthTitle = (y: number, mo: number) => `${MONTH_LONG[mo - 1]} ${y}`;
export const WEEK_HEAD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

/** The month as Monday-first weeks of date keys; days outside the month are null. */
export function monthGrid(y: number, mo: number): (string | null)[][] {
  const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  const lead = (first + 6) % 7;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(`${y}-${pad(mo)}-${pad(d)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(y: number, mo: number, by: number): { y: number; mo: number } {
  const t = y * 12 + (mo - 1) + by;
  return { y: Math.floor(t / 12), mo: (t % 12) + 1 };
}
