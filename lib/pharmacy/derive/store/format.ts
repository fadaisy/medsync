/** Numbers, money and dates as the store reads them (en-GB). Pure. */
export const num = (n: number) => Math.round(n).toLocaleString("en-GB");
export const units = (n: number, u: string) => `${num(n)} ${u}${Math.round(n) === 1 ? "" : "s"}`;
/** "UGX 8.9 m" from a million up, else "UGX 911,070". */
export const ugx = (n: number) =>
  n >= 1e6 ? `UGX ${Math.round(n / 1e5) / 10} m` : `UGX ${num(n)}`;
/** Axis labels: 2.5 m, 100k. */
export const compact = (n: number) => {
  const a = Math.abs(n);
  return a >= 1e6 ? `${Math.round(a / 1e5) / 10} m` : a >= 1e4 ? `${Math.round(a / 1e3)}k` : num(a);
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const monthOf = (iso: string) => MON[+iso.slice(5, 7) - 1]!;
export const fmtExp = (iso: string) => `${monthOf(iso)} ${iso.slice(0, 4)}`;
export const fmtDay = (iso: string) => `${+iso.slice(8, 10)} ${monthOf(iso)}`;
/** "Tue 3 Nov". */
export const fmtDow = (iso: string) => {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${fmtDay(iso)}`;
};
export const kampala = (instant: string) =>
  new Date(new Date(instant).getTime() + 3 * 3_600_000).toISOString();
/** "3 Nov, 08:30", Kampala. */
export const fmtAt = (instant: string) => {
  const k = kampala(instant);
  return `${fmtDay(k)}, ${k.slice(11, 16)}`;
};
export const dayOf = (instant: string) => kampala(instant).slice(0, 10);
export const addDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );
export const monthsTo = (iso: string, today: string) => daysBetween(today, iso) / 30.4;
/** "3 h 20 min". */
export const hrs = (h: number) => {
  let H = Math.floor(h);
  let M = Math.round((h - H) * 60);
  if (M === 60) {
    H++;
    M = 0;
  }
  return H ? `${H} h${M ? ` ${M} min` : ""}` : `${M} min`;
};
export const median = (xs: readonly number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
};
/** ISO weekday, 1 Monday … 7 Sunday. */
export const isoWeekday = (iso: string) =>
  ((new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
