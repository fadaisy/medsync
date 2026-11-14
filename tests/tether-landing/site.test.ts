import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The standalone site (apps/tether-site) must paint with the same Tide tokens as the hospital app. */
describe("apps/tether-site", () => {
  const block = (css: string) =>
    css
      .replace(/^[\s\S]*?\/\* pw-tokens:start \*\//, "")
      .replace(/\/\* pw-tokens:end \*\/[\s\S]*$/, "")
      .replace(/\n\s*\n/g, "\n")
      .trim();
  it("has the same generated token block as app/globals.css", () => {
    const hospital = block(readFileSync("app/globals.css", "utf8"));
    const site = readFileSync("apps/tether-site/app/pw-tokens.css", "utf8")
      .replace(/\n\s*\n/g, "\n")
      .trim();
    expect(site).toBe(hospital);
  });
  it("renders the shared page, not a copy", () => {
    expect(readFileSync("apps/tether-site/app/page.tsx", "utf8")).toMatch(
      /from "@\/components\/landing\/tether\/landing"/,
    );
  });
});

describe("apps/tether-site redirects", () => {
  it("sends sign-in, sign-up and emergency to HOSPITAL_APP_URL", async () => {
    process.env.HOSPITAL_APP_URL = "app.example.test/";
    const { default: config } = await import("../../apps/tether-site/next.config");
    const rules = await config.redirects!();
    const to = (s: string) => rules.find((r) => r.source === s)?.destination;
    expect(to("/sign-in")).toBe("https://app.example.test/sign-in");
    expect(to("/signup/:rest*")).toBe("https://app.example.test/signup/:rest*");
    expect(to("/emergency")).toBe("https://app.example.test/emergency");
    delete process.env.HOSPITAL_APP_URL;
  });
});
