import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { addComplaint, gridState } from "@/components/emr/desk/model";
import { standardVisitMidway } from "../emr/ui/desk-fixtures";

/**
 * Clerking v2, Phase 0 baseline (PROMPT-CLERKING-DESK-V2 §3). Each test states the requirement and
 * is marked `it.fails` because the v1 desk breaks it today. When the defect is fixed the test
 * starts passing, `it.fails` then reports it, and the marker comes off.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));
const { ContextRailView } = await import("@/components/emr/desk/context-rail");
const { formatters } = await import("@/components/emr/format");
const text = (el: ReactElement) =>
  renderToStaticMarkup(el)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("clerking v1 baseline defects", () => {
  it.fails(
    "C2: the review-of-systems screen can leave out items that do not apply to the patient's sex",
    () => {
      // loadRosScreen(systems, database) takes no patient: every ros_screen row is shown to everyone,
      // including last menstrual period and menstrual cycle for a 76-year-old man.
      const src = readFileSync("lib/emr/read/terms.ts", "utf8");
      const sig = src.slice(
        src.indexOf("export async function loadRosScreen"),
        src.indexOf("): Promise<RosSystem[]>"),
      );
      expect(sig).toMatch(/sex/);
    },
  );

  it.fails("C3: a complaint recorded in Complaint reads as a yes in the review of systems", () => {
    const token = {
      token: "polyuria_polydipsia",
      label: "Polyuria/polydipsia",
      system: "endocrine",
    };
    const c = addComplaint({ sections: {} }, "s01", token, 21);
    expect(gridState(c, "s03", "ros_grid", token.token)).toBe("present");
  });

  it.fails("C6: a vital sign scoring 3 in NEWS2 is marked where it is shown", () => {
    const p = standardVisitMidway();
    p.context.vitals = [
      { ...p.context.vitals[0]!, value: "32.5" }, // temperature 32.5 °C scores 3
    ];
    expect(text(h(ContextRailView, { p, fmt: formatters(p.timeZone) }))).toMatch(/scores 3/);
  });
});
