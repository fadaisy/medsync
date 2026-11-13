/** Where the Tether landing page points (Step 0 Q3, STOP 0 ruling 2). */
export const LINKS = {
  signIn: "/sign-in",
  register: "/signup/hospital",
  /** STOP 0 ruling 2: `/help` is not built; Help goes to the public emergency pathway. */
  help: "/emergency",
  email: "hello@medsync.health",
  /** D-LP-10: hidden while null. The canvas points to https://medsync-pi-inky.vercel.app/, which still
   *  says MedSync. */
  future: null as string | null,
} as const;
