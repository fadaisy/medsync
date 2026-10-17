import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { searchPlacesAction } from "@/app/signup/_actions/lookup";
import { submitPatientSignup } from "@/app/signup/patient/actions";
import { CONSENT } from "@/content/onboarding";
import { signupsClosedHere } from "@/lib/legal";
import { fetchSmsConsentVersion } from "@/lib/notifications/consent";
import { SMS_CONSENT_COPY } from "@/lib/notifications/consent-copy";
import { liveNotice } from "@/lib/onboarding/notice";
import { allow } from "@/lib/onboarding/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The phone's door into patient sign-up (Tide v1 F-03). A thin JSON wrapper over the web's
 * `submitPatientSignup`, so the app and the web share one onboarding path: same schema, same
 * notice hash check, same under-18 refusal, same `assertSignupsOpen` gate.
 *
 * GET           the live data-processing notice and SMS text the phone shows and binds consent to.
 * GET ?q=kawe   the place search the web form uses (LOC-5), rate-limited there.
 * POST          { input, key } → SignupResult, exactly as the server action returns it.
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (q !== null) return NextResponse.json({ places: await searchPlacesAction(q) });

  const [notice, sms] = await Promise.all([liveNotice(), fetchSmsConsentVersion()]);
  return NextResponse.json({
    open: !signupsClosedHere() && notice !== null,
    notice,
    summary: CONSENT.lines,
    agree: CONSENT.agree,
    sms: sms
      ? {
          version: sms.version,
          sha: sms.bodySha256,
          body: sms.body,
          label: SMS_CONSENT_COPY.label,
          declined: SMS_CONSENT_COPY.declined,
          receipt: SMS_CONSENT_COPY.receiptException,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  // The web action rides on Next's own action protection; a public JSON door gets a budget too.
  if (!(await allow("mobile-signup", 10)))
    return NextResponse.json(
      { ok: false, formError: "Too many tries. Wait a minute and try again." },
      { status: 429 },
    );
  let body: { input?: unknown; key?: unknown };
  try {
    body = (await request.json()) as { input?: unknown; key?: unknown };
  } catch {
    return NextResponse.json({ ok: false, formError: "Try again." }, { status: 400 });
  }
  try {
    return NextResponse.json(await submitPatientSignup(body.input, body.key));
  } catch (e) {
    // `assertSignupsOpen` throws while production sign-ups are closed (D1). Nothing was stored.
    if (signupsClosedHere())
      return NextResponse.json(
        { ok: false, formError: "Sign-up is not open yet. Please try again later." },
        { status: 503 },
      );
    throw e;
  }
}
