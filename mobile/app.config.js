const { existsSync } = require("node:fs");
const { join } = require("node:path");

/**
 * Build-time additions to `app.json`.
 *
 * - `google-services.json` (Android push, FCM) is a per-project secret that is
 *   not in the repo. Expo cannot parse a config that points at a missing file,
 *   which breaks Expo Go on Android, so the setting stays only when the file
 *   is actually there (a release build).
 * - The map (ADR 0343) is Apple Maps on iPhone (no key) and Google Maps on
 *   Android. Expo Go carries its own Google key; a release build needs one of
 *   its own, given as GOOGLE_MAPS_ANDROID_API_KEY when building. The mobile
 *   Maps SDK has no per-load charge; restrict the key to the app in Google
 *   Cloud. Never commit the key.
 */
module.exports = ({ config }) => {
  const file = config.android?.googleServicesFile;
  if (file && !existsSync(join(__dirname, file))) delete config.android.googleServicesFile;

  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (mapsKey) {
    config.android = config.android ?? {};
    config.android.config = { ...config.android.config, googleMaps: { apiKey: mapsKey } };
  }
  return config;
};
