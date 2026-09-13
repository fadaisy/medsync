import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * The Supabase client — the SAME project the web app talks to.
 *
 * This app reads and writes the same rows a clinician sees on the web, so the
 * only thing standing between a signed-in patient and someone else's record is
 * Row Level Security. That is not a gap: RLS is enforced in the database, on
 * every query, whatever the client. It is why the anon key below is safe to
 * ship inside an app binary — it grants nothing on its own.
 *
 * What must NEVER appear in this app: the service role key. It bypasses RLS
 * entirely. Privileged writes go through the Edge Functions, which run it
 * server-side and re-check the caller's scope before every mutation.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Loud, at import, rather than a confusing auth failure three screens later.
  // A misconfigured build should be obvious to whoever made it.
  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set. " +
      "Copy them from the web app's .env.local into mobile/.env, then restart " +
      "Metro with `npx expo start -c` — env vars are inlined at build time.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    /**
     * ponytail: AsyncStorage, not SecureStore.
     *
     * This is the pattern Expo and Supabase both document, and the refresh
     * token rotates — but AsyncStorage is NOT encrypted at rest, and this is a
     * clinical product. Ceiling: a rooted or jailbroken device, or a
     * shared phone, where the stored session could be lifted.
     *
     * Upgrade path is a SecureStore adapter, with one real obstacle: Android
     * caps a SecureStore value at ~2KB and a Supabase session routinely
     * exceeds it, so the adapter has to chunk. Worth doing before this app
     * carries anything beyond booking.
     */
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    /**
     * No URL session detection: that is a browser concern — it reads the OAuth
     * fragment off `window.location`. React Native has no such thing, and
     * leaving it on makes the client look for one.
     */
    detectSessionInUrl: false,
  },
});
