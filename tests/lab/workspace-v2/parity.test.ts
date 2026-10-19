import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import ACTIONS from "./parity-actions.json";

/**
 * Law 2, the action half of the parity checklist (docs/lab/workspace-v2/parity-checklist.md): every server action
 * the lab imported at Step 0 is still called from the lab. The legacy list's three actions live in
 * app/lab/actions.ts, used only where LAB_WORKSPACE is off.
 */
const ROOT = resolve(__dirname, "../../..");
const LEGACY = new Set(["enterLabResultAction", "rejectLabResultAction", "releaseLabResultAction"]);
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const f = join(d, n);
    return statSync(f).isDirectory() ? walk(f) : /\.tsx?$/.test(n) ? [f] : [];
  });
const SRC = walk(resolve(ROOT, "app/lab")).map((f) => readFileSync(f, "utf8"));

describe("parity: every Step 0 lab action is reachable", () => {
  it.each(Object.keys(ACTIONS))("%s", (name) => {
    if (LEGACY.has(name)) return;
    expect(SRC.some((s) => new RegExp(`\\b${name}\\b`).test(s))).toBe(true);
  });
});
