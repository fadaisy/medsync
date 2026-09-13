// Learn more https://docs.expo.io/guides/customizing-metro
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

/**
 * Let Metro see one file outside this project: the shared slot engine.
 *
 * `supabase/functions/_shared/slots.ts` is the single answer to "what is a
 * bookable slot". The Next app imports it, the Deno Edge Functions import it,
 * and this app makes it the third runtime — which is the entire reason it was
 * written with ZERO imports and no platform APIs. Three clients, one
 * definition; the moment the phone re-derives slots for itself is the moment
 * it starts offering times the server will refuse.
 *
 * Metro only watches its own project root, so the parent has to be added
 * explicitly or the import resolves to nothing.
 *
 * ponytail: `watchFolders` on the whole repo root, not a surgical path. Metro
 * takes directories, and the alternative — a symlink or a published package —
 * is more moving parts for one file. Ceiling: Metro also watching the Next
 * app's files, which costs a little startup time and nothing else, since
 * nothing imports them. Upgrade path is a real monorepo with a shared package
 * once there is more than one file to share.
 */
config.watchFolders = [repoRoot];

/**
 * Resolve from THIS app's node_modules first.
 *
 * Adding the parent to `watchFolders` otherwise lets Metro reach the web app's
 * node_modules, and two copies of React in one bundle is an immediate and very
 * confusing crash. Listing the app's own path first settles that.
 *
 * Hierarchical lookup is deliberately left ON. Turning it off looks tidier and
 * breaks the build: packages with nested dependencies stop resolving — the
 * first attempt here died on `semver/functions/satisfies` from inside
 * react-native-reanimated. Order the paths; do not cut the fallback.
 */
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
