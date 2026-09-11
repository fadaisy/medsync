/**
 * Print every model parameter with its value, unit and provenance.
 *
 *   npm run params
 *
 * README.md's parameter table and MODEL.md's constants are generated from
 * this, so they cannot drift from the code.
 */

import {
  AGEING,
  ARBITRATION,
  CONTROLLER,
  ELECTROCHEMICAL,
  ENVELOPE_DEFAULT,
  OPTICAL,
  PARAM_NOTES,
  PHYSIOLOGY,
  RANGES,
  SENSING,
} from "../src/engine/params.ts";

/* eslint-disable no-console */

const GROUPS: Array<[string, Record<string, unknown>]> = [
  ["PHYSIOLOGY", PHYSIOLOGY],
  ["AGEING", AGEING],
  ["OPTICAL", OPTICAL],
  ["ELECTROCHEMICAL", ELECTROCHEMICAL],
  ["SENSING", SENSING],
  ["ARBITRATION", ARBITRATION],
  ["CONTROLLER", CONTROLLER],
  ["ENVELOPE_DEFAULT", ENVELOPE_DEFAULT],
  ["RANGES", RANGES],
];

const notes = new Map(PARAM_NOTES.map((n) => [n.path, n]));

const format = process.argv.includes("--markdown") ? "markdown" : "text";

if (format === "markdown") {
  console.log("| Parameter | Value | Unit | Provenance | Justification |");
  console.log("| --- | --- | --- | --- | --- |");
}

for (const [groupName, group] of GROUPS) {
  if (format === "text") console.log(`\n${groupName}`);
  for (const [key, value] of Object.entries(group)) {
    const path = `${groupName}.${key}`;
    const note = notes.get(path);
    const printed =
      typeof value === "number"
        ? Number.isInteger(value)
          ? String(value)
          : String(Number(value.toPrecision(6)))
        : String(value);
    if (format === "markdown") {
      console.log(
        `| \`${path}\` | ${printed} | ${note?.unit ?? ""} | ${note?.provenance ?? "estimate"} | ${note?.note ?? "Engineering estimate. Not from any document."} |`,
      );
    } else {
      console.log(
        `  ${path.padEnd(44)} ${printed.padStart(12)}  ${(note?.provenance ?? "estimate").padEnd(10)} ${note?.unit ?? ""}`,
      );
    }
  }
}
