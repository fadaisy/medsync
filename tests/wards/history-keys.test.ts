import { describe, expect, it } from "vitest";

import {
  canRedo,
  canUndo,
  commit,
  HISTORY_LIMIT,
  historyInit,
  redo,
  replace,
  settle,
  undo,
} from "@/lib/wards/history";
import {
  isMacPlatform,
  isTextTarget,
  planKeyAction,
  rootKeyAction,
  shortcutWords,
} from "@/lib/wards/keys";

/* ADR 0195: undo and redo over document snapshots; keys scoped to the editor. */

describe("the undo and redo reducer", () => {
  it("undo steps back, redo steps forward, and each ends where it should", () => {
    let h = historyInit("a");
    h = commit(h, "b");
    h = commit(h, "c");
    expect(h.present).toBe("c");
    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(h.present).toBe("c");
    expect(canRedo(h)).toBe(false);
    expect(redo(h)).toBe(h);
  });

  it("a new edit clears redo", () => {
    let h = commit(commit(historyInit("a"), "b"), "c");
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = commit(h, "d");
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(["a", "b"]);
  });

  it(`keeps at most ${HISTORY_LIMIT} steps back`, () => {
    let h = historyInit(0);
    for (let i = 1; i <= 80; i++) h = commit(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(80 - HISTORY_LIMIT);
    for (let i = 0; i < 100; i++) h = undo(h);
    expect(h.present).toBe(80 - HISTORY_LIMIT);
  });

  it("a drag is one step: moves in between don't count, and a drag that moved nothing adds none", () => {
    let h = historyInit("start");
    h = replace(h, "moving 1");
    h = replace(h, "moving 2");
    expect(h.past).toEqual([]);
    h = settle(h, "start");
    expect(h.past).toEqual(["start"]);
    expect(undo(h).present).toBe("start");
    const same = historyInit("x");
    expect(settle(same, "x")).toBe(same);
  });

  it("the same document again is not a step", () => {
    const h = historyInit("a");
    expect(commit(h, "a")).toBe(h);
  });

  it("switching wards starts afresh: a new history has nothing to undo", () => {
    expect(canUndo(historyInit("ward 2"))).toBe(false);
  });
});

const key = (
  k: string,
  mods: Partial<Record<"meta" | "ctrl" | "shift" | "alt", boolean>> = {},
  target: unknown = { tagName: "DIV" },
) => ({
  key: k,
  metaKey: !!mods.meta,
  ctrlKey: !!mods.ctrl,
  shiftKey: !!mods.shift,
  altKey: !!mods.alt,
  target,
});

describe("the root's keys", () => {
  it("Cmd+Z and Ctrl+Z undo; Shift+Cmd+Z, Shift+Ctrl+Z and Ctrl+Y redo", () => {
    expect(rootKeyAction(key("z", { meta: true }), { live: false })).toBe("undo");
    expect(rootKeyAction(key("z", { ctrl: true }), { live: false })).toBe("undo");
    expect(rootKeyAction(key("Z", { meta: true, shift: true }), { live: false })).toBe("redo");
    expect(rootKeyAction(key("z", { ctrl: true, shift: true }), { live: false })).toBe("redo");
    expect(rootKeyAction(key("y", { ctrl: true }), { live: false })).toBe("redo");
  });

  it("nothing without a modifier, with Alt, or for other letters", () => {
    expect(rootKeyAction(key("z"), { live: false })).toBeNull();
    expect(rootKeyAction(key("z", { ctrl: true, alt: true }), { live: false })).toBeNull();
    expect(rootKeyAction(key("s", { ctrl: true }), { live: false })).toBeNull();
  });

  it("nothing in an input, a textarea, a select or contenteditable: they keep their own undo", () => {
    for (const target of [
      { tagName: "INPUT" },
      { tagName: "textarea" },
      { tagName: "SELECT" },
      { tagName: "DIV", isContentEditable: true },
    ]) {
      expect(isTextTarget(target)).toBe(true);
      expect(rootKeyAction(key("z", { ctrl: true }, target), { live: false })).toBeNull();
    }
    expect(isTextTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTextTarget(null)).toBe(false);
  });

  it("nothing in live mode", () => {
    expect(rootKeyAction(key("z", { ctrl: true }), { live: true })).toBeNull();
    expect(rootKeyAction(key("y", { ctrl: true }), { live: true })).toBeNull();
  });
});

describe("the plan's keys", () => {
  const sel = { live: false, selected: true, armed: false };
  it("R rotates, Delete and Backspace remove, the arrows nudge, Escape clears", () => {
    expect(planKeyAction(key("r"), sel)).toEqual({ type: "rotate" });
    expect(planKeyAction(key("R"), sel)).toEqual({ type: "rotate" });
    expect(planKeyAction(key("Delete"), sel)).toEqual({ type: "remove" });
    expect(planKeyAction(key("Backspace"), sel)).toEqual({ type: "remove" });
    expect(planKeyAction(key("ArrowLeft"), sel)).toEqual({ type: "nudge", dx: -1, dy: 0 });
    expect(planKeyAction(key("ArrowDown"), sel)).toEqual({ type: "nudge", dx: 0, dy: 1 });
    expect(planKeyAction(key("Escape"), sel)).toEqual({ type: "escape" });
  });

  it("Enter places the armed palette item; with nothing armed it does nothing", () => {
    expect(planKeyAction(key("Enter"), { live: false, selected: false, armed: true })).toEqual({
      type: "place",
    });
    expect(planKeyAction(key("Enter"), { live: false, selected: true, armed: false })).toBeNull();
  });

  it("with nothing selected, R and Delete mean nothing and the arrows move the view", () => {
    const none = { live: false, selected: false, armed: false };
    expect(planKeyAction(key("r"), none)).toBeNull();
    expect(planKeyAction(key("Delete"), none)).toBeNull();
    expect(planKeyAction(key("Escape"), none)).toEqual({ type: "escape" });
    expect(planKeyAction(key("ArrowRight"), none)).toEqual({ type: "pan", dx: 1, dy: 0 });
    expect(planKeyAction(key("ArrowUp"), none)).toEqual({ type: "pan", dx: 0, dy: -1 });
  });

  it("+ and - zoom and 0 shows the whole floor, selected or not; Cmd+plus stays the browser's", () => {
    for (const selected of [false, true]) {
      const o = { live: false, selected, armed: false };
      expect(planKeyAction(key("+"), o)).toEqual({ type: "zoom", dir: 1 });
      expect(planKeyAction(key("="), o)).toEqual({ type: "zoom", dir: 1 });
      expect(planKeyAction(key("-"), o)).toEqual({ type: "zoom", dir: -1 });
      expect(planKeyAction(key("0"), o)).toEqual({ type: "zoom", dir: 0 });
    }
    expect(planKeyAction(key("=", { meta: true }), sel)).toBeNull();
    expect(planKeyAction(key("-", { ctrl: true }), sel)).toBeNull();
    expect(planKeyAction(key("+", {}, { tagName: "INPUT" }), sel)).toBeNull();
    expect(planKeyAction(key("+"), { ...sel, live: true })).toBeNull();
  });

  it("leaves modified keys (Cmd+R reloads) and live mode alone", () => {
    expect(planKeyAction(key("r", { meta: true }), sel)).toBeNull();
    expect(planKeyAction(key("Delete", { ctrl: true }), sel)).toBeNull();
    expect(planKeyAction(key("r"), { ...sel, live: true })).toBeNull();
    expect(planKeyAction(key("r", {}, { tagName: "INPUT" }), sel)).toBeNull();
  });

  it("the buttons name the platform's keys", () => {
    expect(isMacPlatform("MacIntel")).toBe(true);
    expect(isMacPlatform("Win32")).toBe(false);
    expect(shortcutWords(true)).toMatchObject({ undoTitle: "Undo (⌘Z)", redoTitle: "Redo (⇧⌘Z)" });
    expect(shortcutWords(false)).toMatchObject({
      undoTitle: "Undo (Ctrl+Z)",
      redoTitle: "Redo (Ctrl+Y)",
    });
  });
});
