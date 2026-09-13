# MedSync mobile

The patient booking app — Expo SDK 57, same Supabase project and Edge
Functions as the web app, reading and writing the same rows under the same
Row Level Security.

## Run on the local network

```sh
cd mobile
cp ../.env.local .env   # then keep ONLY EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npm install
npx expo start --lan -c
```

Scan the QR code with Expo Go on a phone on the same Wi-Fi. `-c` clears
Metro's cache; env vars are inlined at build time, so restart with it after
changing `.env`.

`.env` must never contain the service role key. The anon key grants nothing
RLS does not; privileged reads and every write go through Edge Functions.

## Checks

```sh
npm run typecheck   # tsc --noEmit (typed routes need one `expo start` first)
npm run lint        # eslint, React Compiler rules on
```

## Shared code

`@shared/*` resolves to `../supabase/functions/_shared/*`. The slot engine
(`slots.ts`) has zero imports on purpose — Next, Deno and this app all load
the same file. `metro.config.js` adds the repo root to `watchFolders` for
exactly that.
