import type { TideGroup } from "@/lib/design/tide";
import type { ReactNode } from "react";

import { tideOn } from "@/lib/design/tide";

/** Turns its page Tide when the group is switched on: globals.css re-pins the tokens under `data-ds="tide"`. */
export function TideScope({
  group,
  light,
  children,
}: {
  group: TideGroup;
  light?: boolean;
  children: ReactNode;
}) {
  if (!tideOn(group)) return <>{children}</>;
  return (
    <div data-ds="tide" data-ds-light={light ? "" : undefined} className="contents">
      {children}
    </div>
  );
}
