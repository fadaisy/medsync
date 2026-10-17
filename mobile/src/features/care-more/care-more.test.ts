import type { LabBound } from "@/data/labs";

import { tapGlass } from "@/data/activity";
import { chatRepo } from "@/data/chat";
import { labStatus, PANELS, panelStatus } from "@/data/labs";
import { readOutbox } from "@/offline/outbox";

describe("labStatus", () => {
  const target: LabBound = { dir: "below", limit: 2.6, kind: "target" };
  const best: LabBound = { dir: "above", limit: 1.2, kind: "best" };
  const normal: LabBound = { dir: "below", limit: 3, kind: "normal" };

  it.each([
    [2.5, target, "stable", "Good"],
    [2.6, target, "caution", "Above target"],
    [3.1, target, "caution", "Above target"],
    [1.3, best, "stable", "Good"],
    [1.2, best, "caution", "A little low"],
    [2.1, normal, "stable", "Normal"],
    [3.4, normal, "caution", "A little high"],
    [1.0, { dir: "above", limit: 1.2, kind: "target" } as LabBound, "caution", "Below target"],
  ])("%s against %o is %s, %s", (value, bound, tone, word) => {
    expect(labStatus(value, bound)).toEqual({ tone, word });
  });

  it("gives the boards' panel words", () => {
    expect(PANELS.map((p) => panelStatus(p.items).word)).toEqual(["Needs attention", "All normal"]);
  });
});

describe("tapGlass", () => {
  it("empties down to a full glass and fills up to an empty one", () => {
    expect(tapGlass(5, 2)).toBe(2); // full glass 3 tapped: glasses 3–5 empty
    expect(tapGlass(5, 4)).toBe(4); // the last full glass empties
    expect(tapGlass(5, 5)).toBe(6); // the first empty glass fills
    expect(tapGlass(5, 7)).toBe(8); // the last glass fills all
    expect(tapGlass(0, 0)).toBe(1);
    expect(tapGlass(1, 0)).toBe(0);
  });
});

describe("chatRepo.send", () => {
  it("adds the message as waiting and queues it in the outbox", async () => {
    const at = new Date(2026, 9, 17, 14, 5);
    const before = (await readOutbox()).length;
    await chatRepo.send("  I have a question  ", at);

    const list = chatRepo.list();
    const last = list[list.length - 1];
    expect(last).toMatchObject({
      from: "me",
      time: "14:05",
      status: "waiting",
      body: { kind: "text", text: "I have a question" },
    });

    const out = await readOutbox();
    expect(out).toHaveLength(before + 1);
    expect(out[out.length - 1]).toMatchObject({
      kind: "message",
      payload: { id: last.id, text: "I have a question" },
    });
  });

  it("ignores an empty message", () => {
    expect(chatRepo.send("   ", new Date())).toBeNull();
  });
});
