import { describe, expect, it, vi } from "vitest";

import { resolveSlot, TAB_ID_PATTERN } from "@/lib/supabase/accounts";
import { tabAccountScript } from "@/lib/supabase/tab-account";

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co" } }));

/** One account per tab (ADR 0529). */
describe("resolveSlot", () => {
  it("the tab's header beats the browser cookie; neither is slot 0", () => {
    expect(resolveSlot({ header: "2", cookie: "1" })).toBe(2);
    expect(resolveSlot({ header: null, cookie: "1" })).toBe(1);
    expect(resolveSlot({})).toBe(0);
  });

  it("an account this request switched the tab to wins, for that tab only", () => {
    expect(resolveSlot({ header: "1", tab: "tabaaaaa", adopt: "tabaaaaa:3", cookie: "1" })).toBe(3);
    expect(resolveSlot({ header: "1", tab: "tabbbbbb", adopt: "tabaaaaa:3", cookie: "3" })).toBe(1);
    expect(resolveSlot({ header: "1", tab: "tabaaaaa", adopt: "tabaaaaa%3A3" })).toBe(3);
  });

  it("only a plain tab id may name a cookie", () => {
    expect(TAB_ID_PATTERN.test("abc123def456ghi7")).toBe(true);
    expect(TAB_ID_PATTERN.test("x; path=/")).toBe(false);
  });
});

/** A browser tab with a shared cookie jar, enough for the inline script. */
function tab(jar: Map<string, string>, origin = "https://medsync.test") {
  const listeners: Record<string, (() => void)[]> = {};
  const sent: { url: string; headers: Headers }[] = [];
  const on = (type: string, fn: () => void) => (listeners[type] ??= []).push(fn);
  const document = {
    visibilityState: "visible",
    addEventListener: on,
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    set cookie(line: string) {
      const [pair = "", ...attrs] = line.split("; ");
      const [k = "", v = ""] = pair.split("=");
      if (attrs.includes("max-age=0")) jar.delete(k);
      else jar.set(k, v);
    },
  };
  const window: Record<string, unknown> = {
    location: { href: `${origin}/doctor`, origin },
    addEventListener: on,
    fetch: async (input: RequestInfo, init?: RequestInit) => {
      sent.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response("ok");
    },
  };
  new Function("window", "document", tabAccountScript())(window, document);
  return {
    fetch: window.fetch as typeof fetch,
    slot: () => (window.__msTabAccount as () => string)(),
    fire: (type: string) => listeners[type]?.forEach((fn) => fn()),
    sent,
  };
}

describe("the tab script", () => {
  it("starts as the account it loaded with and names it on this site's requests only", async () => {
    const jar = new Map([["ms-account", "1"]]);
    const t = tab(jar);
    await t.fetch("/doctor/encounters", { method: "POST", headers: { "Next-Action": "a" } });
    await t.fetch("https://abcd.supabase.co/auth/v1/user");
    expect(t.sent[0]?.headers.get("x-ms-account")).toBe("1");
    expect(t.sent[0]?.headers.get("next-action")).toBe("a");
    expect(t.sent[0]?.headers.get("x-ms-tab")).toMatch(TAB_ID_PATTERN);
    expect(t.sent[1]?.headers.has("x-ms-account")).toBe(false);
  });

  it("two tabs keep their own accounts; the one you return to claims the cookie", async () => {
    const jar = new Map([["ms-account", "0"]]);
    const doctor = tab(jar);
    jar.set("ms-account", "2"); // a sign-in elsewhere moved the browser's default
    const nurse = tab(jar);
    await doctor.fetch("/doctor");
    await nurse.fetch("/nurse");
    expect(doctor.sent[0]?.headers.get("x-ms-account")).toBe("0");
    expect(nurse.sent[0]?.headers.get("x-ms-account")).toBe("2");
    doctor.fire("focus");
    expect(jar.get("ms-account")).toBe("0");
    nurse.fire("visibilitychange");
    expect(jar.get("ms-account")).toBe("2");
  });

  it("takes up an account a request switched it to, and no other tab does", async () => {
    const jar = new Map([["ms-account", "0"]]);
    const a = tab(jar);
    const b = tab(jar);
    await a.fetch("/sign-in");
    const id = a.sent[0]?.headers.get("x-ms-tab");
    jar.set("ms-account-tab", `${id}:3`);
    await b.fetch("/nurse");
    expect(b.slot()).toBe("0");
    await a.fetch("/sign-in");
    expect(a.slot()).toBe("3");
    expect(jar.has("ms-account-tab")).toBe(false);
    expect(jar.get("ms-account")).toBe("3");
  });
});
