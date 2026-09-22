import { permanentRedirect } from "next/navigation";

/**
 * E2 lives on the Emergency page now (`/emergency#tell`): the numbers and
 * the pre-alert are one screen. This route stays for old links — the
 * phone's screens have their own — and carries `?items=` / `?submission=`
 * across.
 */
type Search = Record<string, string | string[] | undefined>;

export default async function TellPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const one of Array.isArray(v) ? v : v ? [v] : []) q.append(k, one);
  }
  permanentRedirect(`/emergency${q.size ? `?${q}` : ""}#tell`);
}
