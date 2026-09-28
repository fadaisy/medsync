// @vitest-environment jsdom
import type { PregnancyWrite } from "@/components/clerking/conversion-dialog";
import type { History } from "@/lib/clerking/answers";
import type { NoteContent } from "@/lib/emr/note-rules";
import { act, createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConversionDialog } from "@/components/clerking/conversion-dialog";
import { convertV1Draft } from "@/lib/clerking/convert";
import { CLERKING_CATALOGUE as cat, CLERKING_LEGACY as table } from "@/lib/clerking/load";

/** The review list of a v1 draft continued in the new format: a pick goes through resolveChoice. */

const converted = (ros: [string, "present" | "absent"][]) =>
  convertV1Draft(
    cat,
    table,
    {
      sections: {
        s03: {
          items: [
            {
              kind: "ros_grid",
              items: ros.map(([token, presence]) => ({ token, label: token, presence })),
            },
          ],
        },
      },
    } as unknown as NoteContent,
    "female",
  ).history as unknown as History;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let latest: History;
const openChanges: boolean[] = [];
const writes: PregnancyWrite[] = [];
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  writes.length = 0;
  openChanges.length = 0;
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function Harness({ start }: { start: History }) {
  const [history, setHistory] = useState(start);
  const [isOpen, setOpen] = useState(true);
  return h(ConversionDialog, {
    cat,
    history,
    editable: true,
    act: true,
    open: isOpen,
    onOpenChange: (o) => {
      openChanges.push(o);
      setOpen(o);
    },
    onHistory: (fn) => setHistory((x) => (latest = fn(x))),
    on: {
      onRecordPregnancy: async (w) => {
        writes.push(w);
        return true;
      },
    },
  });
}

const button = (name: string) => {
  const b = [...document.querySelectorAll("button")].find(
    (x) => x.textContent?.trim() === name && !x.disabled,
  );
  if (!b) throw new Error(`No enabled button "${name}"`);
  return b;
};
const press = async (name: string) => {
  await act(async () => {
    button(name).click();
  });
};

describe("the conversion review", () => {
  it("lists every answer and what became of it", () => {
    act(() =>
      root.render(
        h(Harness, {
          start: converted([
            ["cough", "present"],
            ["pleuritic_chest_pain", "absent"],
            ["weakness", "present"],
          ]),
        }),
      ),
    );
    const words = document.body.textContent ?? "";
    expect(words).toContain("Every answer from the previous format (3)");
    expect(words).toContain("Recorded as Cough");
    expect(words).toContain("an absent narrow symptom does not rule out the broader one");
    expect(words).toContain("To finish (1)");
  });

  it("a pick records the chosen symptom; nothing is asserted before it", async () => {
    const start = converted([["weakness", "present"]]);
    expect(start.ros).toEqual({});
    act(() => root.render(h(Harness, { start })));
    expect(() => button("Use this")).toThrow();
    await press("Muscle weakness");
    await press("Use this");
    expect(latest.ros).toEqual({ "sym.muscle_weakness": "yes" });
    expect(latest.converted?.pending).toEqual([]);
  });

  it("the last period is written to the pregnancy record, then marked done", async () => {
    act(() => root.render(h(Harness, { start: converted([["lmp", "present"]]) })));
    const input = document.querySelector<HTMLInputElement>('input[type="date"]')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "2026-09-01");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await press("Sure");
    await press("Record the date");
    expect(writes).toEqual([
      { pregnancyState: "unknown", lnmp: "2026-09-01", lnmpCertainty: "sure" },
    ]);
    expect(latest.converted?.pending).toEqual([]);
  });

  it("closing marks the review done", async () => {
    act(() => root.render(h(Harness, { start: converted([["cough", "present"]]) })));
    await press("Done");
    expect(latest.converted?.reviewed).toBe(true);
    expect(openChanges).toEqual([false]);
  });
});
