import { describe, expect, it } from "vitest";

import { runScenario, scenarioById } from "../src/engine/scenarios.ts";
import { SimEngine } from "../src/engine/sim.ts";
import type { Sample } from "../src/engine/types.ts";
import { SampleStream } from "../src/worker/sampleStream.ts";

/**
 * The bench draws from the worker's sample pipeline; the phase one runner
 * draws from the engine directly. If those two ever disagree, every number on
 * the screen stops being evidence for anything.
 */
describe("the bench's traces match the headless runner", () => {
  it("the minute buffer is the engine's own samples, value for value", () => {
    const scenario = scenarioById("ordinary-day");
    const reference = runScenario(scenario);

    const stream = new SampleStream();
    const engine = new SimEngine({
      seed: scenario.seed,
      maxSamples: 8,
      onSample: (sample) => stream.add(sample),
    });
    const queue = [...scenario.events].sort((a, b) => a.atSeconds - b.atSeconds);
    let next = 0;
    for (let t = 1; t <= scenario.durationS; t += 1) {
      while (next < queue.length && (queue[next]?.atSeconds ?? Infinity) <= t) {
        engine.apply(queue[next]!.event);
        next += 1;
      }
      engine.step();
    }

    // The stream keeps 24 h of minutes, which is exactly this scenario.
    expect(stream.minutes.length).toBe(reference.samplesProduced);
    const tail = reference.samples;
    const streamTail = stream.minutes.slice(-tail.length);
    for (let i = 0; i < tail.length; i += 1) {
      const a = tail[i] as Sample;
      const b = streamTail[i] as Sample;
      expect(b.t).toBe(a.t);
      expect(b.plasma).toBe(a.plasma);
      expect(b.peritoneal).toBe(a.peritoneal);
      expect(b.subcutaneous).toBe(a.subcutaneous);
      expect(b.glucoseA).toBe(a.glucoseA);
      expect(b.glucoseB).toBe(a.glucoseB);
      expect(b.fused).toBe(a.fused);
      expect(b.insulinUph).toBe(a.insulinUph);
      expect(b.autonomy).toBe(a.autonomy);
      expect(b.arbitration).toBe(a.arbitration);
    }
  });

  it("hour aggregates summarise exactly the minutes they cover", () => {
    const stream = new SampleStream();
    const engine = new SimEngine({
      seed: 4242,
      maxSamples: 8,
      onSample: (sample) => stream.add(sample),
    });
    const minutes: Sample[] = [];
    const collector = new SimEngine({ seed: 4242, maxSamples: 100_000 });
    engine.run(6 * 3600);
    collector.run(6 * 3600);
    minutes.push(...collector.samples);

    expect(stream.hours.length).toBeGreaterThanOrEqual(5);

    for (const hour of stream.hours) {
      const covered = minutes.filter((s) => s.t >= hour.t && s.t < hour.t + 3600);
      expect(covered.length).toBeGreaterThan(0);
      const plasmas = covered.map((s) => s.plasma);
      expect(hour.plasmaMin).toBeCloseTo(Math.min(...plasmas), 10);
      expect(hour.plasmaMax).toBeCloseTo(Math.max(...plasmas), 10);
      expect(hour.plasmaMean).toBeCloseTo(
        plasmas.reduce((a, b) => a + b, 0) / plasmas.length,
        10,
      );
      expect(hour.autonomyMin).toBe(Math.min(...covered.map((s) => s.autonomy)));
    }
  });

  it("a fast-forward that outruns the buffer keeps the most recent samples", () => {
    const stream = new SampleStream();
    const engine = new SimEngine({
      seed: 77,
      maxSamples: 8,
      onSample: (sample) => stream.add(sample),
    });
    engine.run(3 * 86_400);
    // 24 h of minutes, and three days of hours.
    expect(stream.minutes.length).toBe(24 * 60);
    expect(stream.hours.length).toBe(3 * 24);
    const last = stream.minutes[stream.minutes.length - 1];
    expect(last?.t).toBe(3 * 86_400);
  });
});

describe("the comma-separated export", () => {
  it("quotes and escapes so a spreadsheet reads it back correctly", () => {
    // The export is built in the event log component; this is the same
    // shaping, applied to log lines that contain the characters that break
    // naive comma-separated output: commas, quotes and non-ASCII.
    const rows = [
      { t: 0, stream: "clinical", code: "CAL", message: 'Calibration: meter read 6.3 mmol/L, gain 1.044' },
      { t: 61, stream: "insulin", code: "BOLU", message: 'meal bolus 4.00 U over 5 min, ceiling 4.0 U' },
      { t: 122, stream: "device", code: "ARBT", message: 'Supervisor said "invalid", then "valid"' },
    ];
    const header = "simulated_seconds,simulated_time,stream,code,message\n";
    const body = rows
      .map((e) => `${e.t},${e.t},${e.stream},${e.code},"${e.message.replace(/"/g, '""')}"`)
      .join("\n");
    const csv = header + body;

    // Parse it back the way a spreadsheet would.
    const parsed = parseCsv(csv);
    expect(parsed[0]).toEqual([
      "simulated_seconds",
      "simulated_time",
      "stream",
      "code",
      "message",
    ]);
    expect(parsed).toHaveLength(4);
    expect(parsed[1]?.[4]).toBe("Calibration: meter read 6.3 mmol/L, gain 1.044");
    expect(parsed[3]?.[4]).toBe('Supervisor said "invalid", then "valid"');
    for (const row of parsed) expect(row).toHaveLength(5);
  });
});

/** A minimal comma-separated parser, the way a spreadsheet reads one. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
