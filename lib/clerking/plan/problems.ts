/**
 * The problem cards (ADR 0184 §1): one per problem from 09 Impression, in its order: the leading
 * diagnosis, the differential numbered, then "also this visit". Each carries the tests that would
 * help decide (the catalogue's `tests_to_decide`), must-not-miss, and the treatment classes the
 * draft diagnosis → class map links it to (labelled "Draft map, not CSO-signed"). Pure.
 */
import type { Board, BoardRow } from "@/lib/clerking/impression/board";
import type { SupportiveId } from "@/lib/prescribing/reference/formulary-types";

import { diagnosisLink } from "@/lib/prescribing/formulary";

export interface ProblemTest {
  /** The catalogue test id (`test.*`). */
  key: string;
  display: string;
  specimen: string | null;
  /** The test_catalogue uuid an order names; null when the test is not on the menu. */
  testId: string | null;
}

export interface ProblemCard {
  logicalId: string;
  versionId: string;
  display: string;
  slot: BoardRow["slot"];
  /** "★" for the leading diagnosis, "1", "2"… for the differential, "" for also this visit. */
  marker: string;
  profileId: string | null;
  mustNotMiss: boolean;
  timeCritical: boolean;
  tests: ProblemTest[];
  classes: string[];
  supportive: SupportiveId[];
}

export interface TestIndex {
  names: Readonly<Record<string, string>>;
  uuids: Readonly<Record<string, string>>;
  specimens?: Readonly<Record<string, string>>;
}

export const SPECIMEN_WORD: Record<string, string> = {
  capillary_whole_blood: "Capillary blood",
  venous_whole_blood: "Venous blood",
  venous_plasma: "Venous blood (plasma)",
  venous_serum: "Venous blood (serum)",
  urine_spot: "Urine",
  sputum: "Sputum",
};

const WORD_CASE: Record<string, string> = { crag: "CrAg" };

/** A test not on the default menu has no display name: its id in words ("test.ct_head" → "CT head"). */
export function testWords(key: string): string {
  const w = key
    .replace(/^test\./, "")
    .split("_")
    .map((t) => WORD_CASE[t] ?? (t.length <= 3 ? t.toUpperCase() : t));
  const out = w.join(" ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function card(row: BoardRow, marker: string, tests: TestIndex): ProblemCard {
  const profile = row.profile;
  const link = profile ? diagnosisLink(profile.id) : undefined;
  return {
    logicalId: row.dx.logicalId,
    versionId: row.dx.versionId,
    display: row.dx.display,
    slot: row.slot,
    marker,
    profileId: profile?.id ?? row.dx.dxId,
    mustNotMiss: row.mustNotMiss,
    timeCritical: row.timeCritical,
    tests: (profile?.tests_to_decide ?? []).map((key) => ({
      key,
      display: tests.names[key] ?? testWords(key),
      specimen: tests.specimens?.[key] ? (SPECIMEN_WORD[tests.specimens[key]!] ?? null) : null,
      testId: tests.uuids[key] ?? null,
    })),
    classes: link?.classes ?? [],
    supportive: link?.supportive ?? [],
  };
}

export function problemCards(board: Board, tests: TestIndex): ProblemCard[] {
  return [
    ...(board.leading ? [card(board.leading, "★", tests)] : []),
    ...board.differential.map((r) => card(r, String(r.position), tests)),
    ...board.also.map((r) => card(r, "", tests)),
  ];
}
