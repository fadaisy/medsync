import type { TideGroup } from "@/lib/design/tide";
import type { ReactNode } from "react";

import { tideOn } from "@/lib/design/tide";

/** Turns its page Tide when the group is switched on: globals.css re-pins the tokens under `data-ds="tide"`. */
export function TideScope({
  group,
  light,
  force,
  children,
}: {
  group: TideGroup;
  light?: boolean;
  /** Tide whatever TIDE_SURFACES says (the Tether domain, ADR 0510). */
  force?: boolean;
  children: ReactNode;
}) {
  if (!force && !tideOn(group)) return <>{children}</>;
  return (
    <div data-ds="tide" data-ds-light={light ? "" : undefined} className="contents">
      {children}
    </div>
  );
}
