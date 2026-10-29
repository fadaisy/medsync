/**
 * A correction to one medicine's form and routes (owner item 10): proposed from Set-up › Catalogue at a hospital,
 * applied after two catalogue curators confirm it (0251's two-person rule). The payload keeps what the medicine
 * said when the change was proposed, so a change made since is refused rather than overwritten. Pure.
 */
export interface CorrectionFacts {
  formCode: string | null;
  /** Route codes, sorted. */
  routes: string[];
}

export interface CorrectionPayload {
  medicineId: string;
  before: CorrectionFacts;
  after: CorrectionFacts;
}

export const sortedRoutes = (routes: readonly string[]) => [...new Set(routes)].sort();

export const sameFacts = (a: CorrectionFacts, b: CorrectionFacts) =>
  a.formCode === b.formCode && sortedRoutes(a.routes).join() === sortedRoutes(b.routes).join();

/** Each field the correction changes, in words: the labels come from the signed lists. */
export function correctionChanges(
  p: Pick<CorrectionPayload, "before" | "after">,
  labels: { forms: ReadonlyMap<string, string>; routes: ReadonlyMap<string, string> },
  none: string,
): { field: "form" | "routes"; from: string; to: string }[] {
  const form = (c: string | null) => (c ? (labels.forms.get(c) ?? c) : none);
  const routes = (r: readonly string[]) =>
    r.length
      ? sortedRoutes(r)
          .map((c) => labels.routes.get(c) ?? c)
          .join(", ")
      : none;
  const out: { field: "form" | "routes"; from: string; to: string }[] = [];
  if (p.before.formCode !== p.after.formCode)
    out.push({ field: "form", from: form(p.before.formCode), to: form(p.after.formCode) });
  if (sortedRoutes(p.before.routes).join() !== sortedRoutes(p.after.routes).join())
    out.push({ field: "routes", from: routes(p.before.routes), to: routes(p.after.routes) });
  return out;
}
