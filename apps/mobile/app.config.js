/**
 * Env loading strategy:
 *   Local dev  → .env loaded by Expo, APP_ENV defaults to "local"
 *   Archive    → Xcode sets CONFIGURATION=Release, which forces APP_ENV=prod
 *   CLI        → APP_ENV=prod expo prebuild / archive
 */
const path = require("path");
const fs = require("fs");

const LOCAL_APP_ENV = "local";
const PROD_APP_ENV = "prod";
const XCODE_RELEASE_CONFIGURATION = "Release";
const REMOTE_API_URL_PREFIX = "https://";

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (override || !process.env[key]) process.env[key] = value;
    }
  });
}

// Xcode exports CONFIGURATION to every script phase, so a Release archive is
// prod even though .env pins a LAN URL for day-to-day simulator runs.
const requestedAppEnv = process.env.APP_ENV || LOCAL_APP_ENV;
const appEnv =
  process.env.CONFIGURATION === XCODE_RELEASE_CONFIGURATION &&
  requestedAppEnv === LOCAL_APP_ENV
    ? PROD_APP_ENV
    : requestedAppEnv;

if (appEnv !== LOCAL_APP_ENV) {
  loadEnvFile(path.resolve(__dirname, `.env.${appEnv}`), true);
}

console.log(
  `[app.config] APP_ENV=${appEnv} EXPO_PUBLIC_API_URL=${process.env.EXPO_PUBLIC_API_URL}`,
);

// A shipped build pointing at a LAN IP fails on device, so fail the build here.
if (
  appEnv !== LOCAL_APP_ENV &&
  !(process.env.EXPO_PUBLIC_API_URL || "").startsWith(REMOTE_API_URL_PREFIX)
) {
  throw new Error(
    `[app.config] Refusing to build APP_ENV=${appEnv} with EXPO_PUBLIC_API_URL=${
      process.env.EXPO_PUBLIC_API_URL || "(unset)"
    } — expected an ${REMOTE_API_URL_PREFIX} URL from .env.${appEnv}`,
  );
}

const { expo } = require("./app.json");
const buildNumber = expo.buildNumber || 1;
const storeRelease = appEnv !== LOCAL_APP_ENV;

function withStorePlugins(plugins) {
  if (!storeRelease) return plugins;
  return plugins.map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === "expo-notifications") {
      return [plugin[0], { ...plugin[1], mode: "production" }];
    }
    return plugin;
  });
}

module.exports = {
  ...require("./app.json"),
  expo: {
    ...expo,
    ios: {
      ...expo.ios,
      buildNumber: String(buildNumber),
    },
    android: {
      ...expo.android,
      versionCode: buildNumber,
    },
    plugins: withStorePlugins(expo.plugins),
  },
};
