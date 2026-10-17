const { existsSync } = require("node:fs");
const { join } = require("node:path");

/**
 * `app.json` names `google-services.json` for Android push (FCM), but that
 * file is a per-project secret that is not in the repo. Expo cannot parse a
 * config that points at a missing file, which breaks Expo Go on Android. Keep
 * the setting only when the file is actually there (a release build).
 */
module.exports = ({ config }) => {
  const file = config.android?.googleServicesFile;
  if (file && !existsSync(join(__dirname, file))) delete config.android.googleServicesFile;
  return config;
};
