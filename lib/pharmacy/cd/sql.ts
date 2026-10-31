import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

/** Raw reads for Controls: postgres-js returns rows, PGlite `{ rows }`. */
export type Reader = EmrDb | EmrTx;
export const rowsOf = <T>(r: unknown): T[] => (Array.isArray(r) ? (r as T[]) : ((r as { rows: T[] }).rows ?? []));
export const q = async <T>(d: Reader, query: SQL) => rowsOf<T>(await d.execute(query));
export const d8 = (v: unknown) => new Date(v as string);
export const d8n = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string));
/** A person's name from a joined `public.users` alias. */
export const name = (u: string) => sql.raw(`coalesce(${u}.full_name, ${u}.email)`);

const K = { timeZone: "Africa/Kampala", hourCycle: "h23" } as const;
const dayTime = new Intl.DateTimeFormat("en-GB", { ...K, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const time = new Intl.DateTimeFormat("en-GB", { ...K, hour: "2-digit", minute: "2-digit" });
/** "30 Oct, 08:00" and "08:00", hospital-local (Africa/Kampala). */
export const when = (d: Date | number) => dayTime.format(d);
export const hm = (d: Date | number) => time.format(d);
