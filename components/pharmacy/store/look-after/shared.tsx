import type { ReactNode } from "react";

import { sectionTitle } from "@/components/pharmacy/medicines/shared";

/** How every Look after section reads: a card, its heading and note, a table that scrolls inside the card. */
export const card = "bg-card shadow-card flex min-w-0 flex-col gap-3 rounded-2xl p-4";
export const rowLine = "border-ink-200 border-t";

export function Head({
  title,
  note,
  action,
}: {
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex max-w-[64ch] min-w-0 flex-col gap-1">
        <h3 className="text-foreground m-0 text-[17px] leading-6 font-semibold">{title}</h3>
        {note ? <p className="text-ink-600 m-0 text-[13px] leading-[18px]">{note}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Table({
  cols,
  min,
  children,
}: {
  cols: readonly string[];
  min: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse text-[13px] ${min}`}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} scope="col" className={`${sectionTitle} py-1.5 pr-3 text-left`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => (
  <p className="text-ink-600 m-0 py-2 text-[13px]">{children}</p>
);
