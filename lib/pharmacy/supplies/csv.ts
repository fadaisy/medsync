import type { SupplyRow } from "./defaults";

/** The committed CSV's rows: comma-separated, double-quoted where needed. */
export function parseCsv(text: string): SupplyRow[] {
  const table: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      table.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  return table.slice(1).map(([section, category, name, specification, unit, level, ven]) => ({
    section: section as SupplyRow["section"],
    category: category!,
    name: name!,
    specification: specification!,
    unit: unit!,
    level: level!,
    ven: ven!,
  }));
}
