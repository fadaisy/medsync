import "server-only";

import { logger } from "@/lib/logger";

/**
 * A read that has not answered in `ms` rejects, logged with its name, so a page never waits on one source for ever
 * (Today timed out at 300 s in production with no other log line). The query itself is not cancelled.
 */
export function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      logger.warn("pharmacy.read_timed_out", { what, ms });
      reject(new Error(`${what} timed out after ${ms} ms`));
    }, ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** One source of a list or flow step (Needs you, Today's medicines flow): it shows as "No data" past this. */
export const SOURCE_MS = 25_000;
/** A page's own rows: past this the page shows its error screen with Try again, not an endless skeleton. */
export const PAGE_MS = 60_000;
