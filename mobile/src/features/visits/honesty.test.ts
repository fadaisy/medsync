import { readFileSync } from "fs";
import { join } from "path";

/**
 * Law L8: booking never promises a time. Every booking screen carries the
 * exact sentence (directly, or through `HonestNote` / `HONEST` from
 * `parts.tsx`), and no clock time sits beside "your turn" anywhere.
 */
const SENTENCE = "We save your place in line. We cannot tell you the hour.";
const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const SCREENS = [
  "app/(app)/book/index.tsx",
  "app/(app)/book/today.tsx",
  "app/(app)/book/day.tsx",
  "app/(app)/visits/[id].tsx",
];
const ALL = [
  ...SCREENS,
  "app/(app)/(tabs)/visits.tsx",
  "components/tide/ticket.tsx",
  "features/visits/parts.tsx",
  "data/visits.ts",
  "features/home/doctors.tsx",
  "data/doctors.ts",
];

describe("queue honesty (law L8)", () => {
  it("the shared part holds the exact sentence", () => {
    expect(read("features/visits/parts.tsx")).toContain(`"${SENTENCE}"`);
  });

  it.each(SCREENS)("%s shows it", (file) => {
    const src = read(file);
    expect(src.includes(SENTENCE) || /\bHonestNote\b|\bHONEST\b/.test(src)).toBe(true);
  });

  it.each(ALL)("%s puts no clock time next to 'your turn'", (file) => {
    const src = read(file).toLowerCase();
    expect(src).not.toMatch(/your turn[^\n]{0,60}\d{1,2}[:.]\d{2}/);
    expect(src).not.toMatch(/\d{1,2}[:.]\d{2}[^\n]{0,60}your turn/);
    expect(src).not.toMatch(/(seen|see you|your hour) at \d{1,2}[:.]\d{2}/);
  });

  it.each(ALL)("%s prints no place number, total or line count (ADR 0084 §6)", (file) => {
    const src = read(file);
    expect(src).not.toMatch(
      /you would be|your number|You: #|#\$\{|in line ·|\} waiting|before you`/i,
    );
    expect(src).not.toMatch(/ordinal\(|yourNumber\(|positionNumber/);
  });

  it("the only count is the ahead line, from the server, on the ticket screen", () => {
    expect(read("app/(app)/book/today.tsx")).toContain("aheadWords(");
    expect(read("data/visits.ts")).toContain('rpc("patient_intake_ahead"');
  });

  it("a place in the line never promises a time; a day ticket only a doctor's chosen slot (ADR 0344)", () => {
    expect(read("app/(app)/book/today.tsx")).toContain('value: "Not promised"');
    expect(read("app/(app)/book/day.tsx")).toContain(
      'tk.time ? `${tk.time} · arrive a little early` : "Not promised"',
    );
  });
});
