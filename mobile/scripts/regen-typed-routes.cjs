// Regenerates mobile/.expo/types/router.d.ts exactly as `expo start` does, without Metro.
const path = require("node:path");
const root = path.resolve(__dirname, "..");
process.env.EXPO_ROUTER_APP_ROOT = path.join(root, "src/app");
const mod = require(path.join(root, "node_modules/expo/node_modules/@expo/cli/node_modules/@expo/router-server/build/typed-routes"));
mod.regenerateDeclarations(path.join(root, ".expo/types"), {});
setTimeout(() => console.log(require("node:fs").readFileSync(path.join(root, ".expo/types/router.d.ts"), "utf8").split("\n").find(l => l.includes("href:"))), 1500);
