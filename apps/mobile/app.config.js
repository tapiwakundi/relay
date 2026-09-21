/**
 * Env files:
 *   Local run  → .env.local (APP_ENV=local, Debug `expo run:ios`)
 *   Archive    → .env.prod  (Xcode Release sets APP_ENV=prod)
 */
const path = require("path");
const fs = require("fs");

const LOCAL_APP_ENV = "local";
const PROD_APP_ENV = "prod";
const XCODE_RELEASE_CONFIGURATION = "Release";
const LOCAL_ENV_FILE = ".env.local";
const REMOTE_API_URL_PREFIX = "https://";

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, "");
      if (override || !process.env[key]) process.env[key] = value;
    }
  });
  return true;
}

const requestedAppEnv = process.env.APP_ENV || LOCAL_APP_ENV;
const appEnv =
  process.env.CONFIGURATION === XCODE_RELEASE_CONFIGURATION &&
  requestedAppEnv === LOCAL_APP_ENV
    ? PROD_APP_ENV
    : requestedAppEnv;
const envFile = appEnv === LOCAL_APP_ENV ? LOCAL_ENV_FILE : `.env.${appEnv}`;
const envPath = path.resolve(__dirname, envFile);

if (!loadEnvFile(envPath, true)) {
  throw new Error(`[app.config] Missing ${envFile} (needed for EXPO_PUBLIC_API_URL)`);
}

console.log(`[app.config] APP_ENV=${appEnv} file=${envFile} EXPO_PUBLIC_API_URL=${process.env.EXPO_PUBLIC_API_URL}`);

if (!(process.env.EXPO_PUBLIC_API_URL || "").trim()) {
  throw new Error(`[app.config] ${envFile} must set EXPO_PUBLIC_API_URL`);
}

if (
  appEnv !== LOCAL_APP_ENV &&
  !(process.env.EXPO_PUBLIC_API_URL || "").startsWith(REMOTE_API_URL_PREFIX)
) {
  throw new Error(
    `[app.config] Refusing to build APP_ENV=${appEnv} with EXPO_PUBLIC_API_URL=${process.env.EXPO_PUBLIC_API_URL} — expected an ${REMOTE_API_URL_PREFIX} URL from ${envFile}`,
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
