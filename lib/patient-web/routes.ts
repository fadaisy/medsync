/**
 * The cutover (D-PW-10): with PATIENT_WEB_TIDE on, these old URLs serve the new Tide pages from `app/pw/`
 * through a rewrite in proxy.ts; off, the old pages serve and `/pw` answers 404. A path joins this list
 * when its new page is built. Step 9 moves `app/pw/` to its real URLs and deletes the list and the flag.
 * Pure: proxy.ts runs it on every request.
 */
export const PW_ROUTES: readonly RegExp[] = [
  /^\/patient\/?$/,
  /^\/patient\/mood\/?$/,
  /^\/patient\/notifications\/?$/,
  /^\/patient\/care(\/(readings|medicines|trends|labs|move|messages))?\/?$/,
  /^\/patient\/visits(\/[0-9a-f-]{36})?\/?$/,
  /^\/patient\/book(\/(wrong|today|day))?\/?$/,
  /^\/patient\/me(\/(conditions|allergies|family|places|profile|household))?\/?$/,
  /^\/patient\/me\/records(\/[0-9a-f-]{36})?\/?$/,
];

export function patientWebTideOn(env: string | undefined = process.env.PATIENT_WEB_TIDE): boolean {
  return env === "1";
}

/** The `/pw` path that serves `pathname`, or null when the old page still serves it. */
export function pwRewrite(pathname: string, on = patientWebTideOn()): string | null {
  if (!on || pathname.startsWith("/pw")) return null;
  return PW_ROUTES.some((r) => r.test(pathname)) ? `/pw${pathname}` : null;
}
