import { redirect } from "next/navigation";

/**
 * Diagnostics moved to Laboratory and imaging (phase 2 of ADR 0516): the test menu, its profiles and imaging are set
 * up there now. An old link keeps its place: `?sub=imaging` opens Imaging, `?tab=profiles` opens Profiles, `?test=`
 * opens that test. The one
 * result path switch stays at its own address under here.
 */
export default async function DiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  // ⌘K's test results (`?test=<code>`) open that test's detail on the menu.
  if (typeof sp.test === "string")
    redirect(`/hospital-admin/lab?test=${encodeURIComponent(sp.test)}`);
  const tab = sp.sub === "imaging" ? "imaging" : sp.tab === "profiles" ? "profiles" : null;
  redirect(tab ? `/hospital-admin/lab?tab=${tab}` : "/hospital-admin/lab");
}
