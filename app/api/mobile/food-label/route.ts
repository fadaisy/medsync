import { NextResponse } from "next/server";
import { z } from "zod";

import { patientFromBearer } from "@/app/api/mobile/visit-summaries/_lib/caller";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { allow } from "@/lib/onboarding/rate-limit";
import { LABEL_PROMPT, readLabel } from "./_lib/read";

export const dynamic = "force-dynamic";

/** The smallest current Claude model, as for device screens (ADR 0352). */
const MODEL = "claude-haiku-5-5";
const MAX_BASE64 = 2_000_000;

const Body = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  image: z.string().min(100).max(MAX_BASE64),
});

/**
 * POST { mime, image (base64) } → a nutrition label's values per 100 g, or why
 * not (ADR 0357). The patient's photo of a pack, read by Claude and never
 * stored. Signed-in patients only, ten a minute. The phone puts the values in
 * a form the patient checks; nothing is saved from here.
 */
export async function POST(request: Request) {
  if (!(await allow("mobile-food-label", 10)))
    return NextResponse.json({ error: "Too many photos. Wait a minute and try again." }, { status: 429 });
  const caller = await patientFromBearer(request);
  if (!caller.ok) return caller.response;
  if (!env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "Reading labels isn't switched on yet. Type the values from the label." },
      { status: 503 },
    );

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "That photo couldn't be read. Try another." }, { status: 400 });
  const { mime, image } = parsed.data;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        // A printed table needs no thinking, as a digital screen needs none (ADR 0352).
        thinking: { type: "disabled" },
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mime, data: image } },
              { type: "text", text: LABEL_PROMPT },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      logger.warn("mobile.food_label.upstream", { status: res.status });
      return NextResponse.json(
        { error: "Couldn't read the label just now. Type the values instead." },
        { status: 502 },
      );
    }
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (body.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("");
    return NextResponse.json(readLabel(text));
  } catch (e) {
    logger.warn("mobile.food_label.failed", { reason: String(e) });
    return NextResponse.json(
      { error: "Couldn't read the label just now. Type the values instead." },
      { status: 502 },
    );
  }
}
