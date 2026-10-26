/**
 * D-PW-03: can this browser place a phone call? Decided from the user agent on the server (so the first paint
 * is right) and again in the browser when the server saw none. Phones say so; tablets and computers mostly
 * cannot dial, so they get the number large and the dial-from-a-phone line instead of a `tel:` link that
 * would do nothing. iPads (which still say "Mobile") and Android tablets (which do not) count as computers.
 * Pure: tests/patient-web/help.test.ts runs it over real user agents (S24).
 */
export function canDial(ua: string | null | undefined): boolean {
  if (!ua) return false;
  if (/iPad/.test(ua)) return false;
  if (/iPhone|iPod/.test(ua)) return true;
  if (/Android/.test(ua)) return /Mobile/.test(ua);
  return /Windows Phone|IEMobile|BlackBerry|BB10|Opera Mini|KaiOS/i.test(ua);
}
