/**
 * The new-admin guide (ADR 0522): the routes a walkthrough or demo step goes to. A route is a real admin URL with
 * the query its page already reads (`/hospital-admin/clinics?view=week`, `/hospital-admin/staff?tab=invites`). A
 * page that opens one record by id (a clinic, a department, a ward, a test) is reached through a pick:
 * `{pick:clinic}` means "the first record of that list on its page", read from the list's `data-guide-id`, so the
 * guide never invents an id. `{pick:ward-new|ward}` tries each list in turn. Pure: strings in, strings out.
 */

const PICK = /\{pick:([a-z|-]+)\}/;

/**
 * The window event the guide sends with each URL it opens, for a page that keeps its view in its own state rather
 * than in the URL (Clinics & schedule): it opens the same view at once. The URL stays the page's source of truth.
 */
export const GUIDE_NAV_EVENT = "medsync:admin-guide-nav";

export interface Where {
  pathname: string;
  search: string;
}

/** The lists a route's pick names, in order of preference; null when the route has no pick. */
export function pickLists(route: string): string[] | null {
  const m = PICK.exec(route);
  return m ? m[1]!.split("|").filter(Boolean) : null;
}

/**
 * The page that shows a pick's list: the route without the pick. A pick in a query value drops that parameter; a
 * pick in the path keeps the path up to it (`/departments/wards/{pick:ward}/layout` → `/departments/wards`).
 */
export function pickPage(route: string): string {
  if (!PICK.test(route)) return route;
  const [path = "", query = ""] = route.split("?");
  if (PICK.test(path)) return path.slice(0, path.search(PICK)).replace(/\/$/, "");
  const q = query
    .split("&")
    .filter((p) => p && !PICK.test(p))
    .join("&");
  return q ? `${path}?${q}` : path;
}

/** The route with its pick filled by a real id, or the pick's page when no id was found. */
export function fillPick(route: string, id: string | null): string {
  if (!PICK.test(route)) return route;
  if (!id) return pickPage(route);
  return route.replace(PICK, encodeURIComponent(id));
}

/** Whether the browser is at a route: the same path, and every parameter the route names with the same value. */
export function atRoute(route: string, here: Where): boolean {
  const [path = "", query = ""] = route.split("?");
  if (path !== here.pathname) return false;
  const want = new URLSearchParams(query);
  const have = new URLSearchParams(here.search);
  for (const [k, v] of want) if (have.get(k) !== v) return false;
  return true;
}

/** Whether the browser is exactly at a route: the same path and the same parameters, in any order. */
export function sameRoute(route: string, here: Where): boolean {
  const [path = "", query = ""] = route.split("?");
  if (path !== here.pathname) return false;
  const norm = (q: string) =>
    [...new URLSearchParams(q)]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join("&");
  return norm(query) === norm(here.search.replace(/^\?/, ""));
}

/** A link's page, for the guide's "Take me there": the route with any pick left out. */
export const routeHref = (route: string) => pickPage(route);
