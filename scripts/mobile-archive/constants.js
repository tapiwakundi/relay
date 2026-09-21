const fs = require("fs");
const path = require("path");

const SKIP_BUMP_FLAG = "--no-bump";
const SKIP_BUILD_FLAG = "--skip-build";
const CONFIGURATION = "Release";
const PROD_APP_ENV = "prod";
const EXPORT_METHOD = "app-store-connect";
const EXPORT_DESTINATION = "upload";
const SIGNING_STYLE = "automatic";
const BUNDLE_VERSION_KEY = "CFBundleVersion";
const BUNDLE_SHORT_VERSION_KEY = "CFBundleShortVersionString";
const GENERIC_IOS_DESTINATION = "generic/platform=iOS";
const BUILD_DIR_NAME = "build";
const EXPORT_OPTIONS_FILE_NAME = "ExportOptions.plist";
const ENV_PROD_FILE_NAME = ".env.prod";
const APP_JSON_FILE_NAME = "app.json";
const EAS_JSON_FILE_NAME = "eas.json";
const PLATFORM_ANDROID = "android";
const BUILD_PROFILE = "production";
const SUBMIT_PROFILE = "internal-testing";
const AAB_EXTENSION = ".aab";
const NPX_YES_FLAG = "--yes";
const EAS_CLI_PACKAGE = "eas-cli";
const EAS_NON_INTERACTIVE_FLAG = "--non-interactive";
const PLAY_SERVICE_ACCOUNT_FILE_NAME = "play-service-account.json";
const GOOGLE_SERVICE_ACCOUNT_KEY_ENV = "GOOGLE_SERVICE_ACCOUNT_KEY_PATH";
const PLAY_SERVICE_ACCOUNT_GUIDE_URL =
  "https://expo.fyi/creating-google-service-account";
const IOS_LABEL = "iOS";
const ANDROID_LABEL = "Android";
const IOS_SCRIPT = "archiveIos.js";
const ANDROID_SCRIPT = "archiveAndroid.js";
const INCREMENT_SCRIPT = "incrementBuildNumber.js";
const STREAM_LOGS_ENV = "ARCHIVE_STREAM_LOGS";
const STREAM_LOGS_VALUE = "1";
const ARCHIVE_LOG_FILE_NAME = "archive.log";
const LAST_ERROR_LINE_COUNT = 30;

const ANDROID_BUILDS_DIR_BY_SLUG = {
  relay: "relay-app",
};

function getAppRoot() {
  return process.cwd();
}

function getAppJsonPath(appRoot = getAppRoot()) {
  return path.join(appRoot, APP_JSON_FILE_NAME);
}

function readExpoConfig(appRoot = getAppRoot()) {
  return JSON.parse(fs.readFileSync(getAppJsonPath(appRoot), "utf8")).expo;
}

function nativeIosProjectName(expoName) {
  return String(expoName).replace(/[^A-Za-z0-9]/g, "");
}

function androidBuildsDirName(slug) {
  return ANDROID_BUILDS_DIR_BY_SLUG[slug] || `${slug}-app`;
}

function shouldBump() {
  return !process.argv.includes(SKIP_BUMP_FLAG);
}

function shouldSkipAndroidBuild() {
  return process.argv.includes(SKIP_BUILD_FLAG);
}

function resolveGoogleServiceAccountKeyPath(appRoot = getAppRoot()) {
  const fromEnv = process.env[GOOGLE_SERVICE_ACCOUNT_KEY_ENV];
  if (fromEnv && fs.existsSync(fromEnv)) {
    return path.resolve(fromEnv);
  }
  const localPath = path.join(appRoot, PLAY_SERVICE_ACCOUNT_FILE_NAME);
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  return null;
}

function playServiceAccountHelp() {
  return [
    "Google Play uploads need a Play Console service account JSON. There is no Xcode-style signed-in session.",
    `Create a key: ${PLAY_SERVICE_ACCOUNT_GUIDE_URL}`,
    `Invite that service account to the Play app (com.endurancelabs.relayapp), then either place ${PLAY_SERVICE_ACCOUNT_FILE_NAME} in the app directory, set ${GOOGLE_SERVICE_ACCOUNT_KEY_ENV}, or upload the key with: npx eas-cli credentials --platform android`,
  ].join("\n");
}

module.exports = {
  SKIP_BUMP_FLAG,
  SKIP_BUILD_FLAG,
  CONFIGURATION,
  PROD_APP_ENV,
  EXPORT_METHOD,
  EXPORT_DESTINATION,
  SIGNING_STYLE,
  BUNDLE_VERSION_KEY,
  BUNDLE_SHORT_VERSION_KEY,
  GENERIC_IOS_DESTINATION,
  BUILD_DIR_NAME,
  EXPORT_OPTIONS_FILE_NAME,
  ENV_PROD_FILE_NAME,
  PLATFORM_ANDROID,
  BUILD_PROFILE,
  SUBMIT_PROFILE,
  AAB_EXTENSION,
  NPX_YES_FLAG,
  EAS_CLI_PACKAGE,
  IOS_LABEL,
  ANDROID_LABEL,
  IOS_SCRIPT,
  ANDROID_SCRIPT,
  INCREMENT_SCRIPT,
  STREAM_LOGS_ENV,
  STREAM_LOGS_VALUE,
  ARCHIVE_LOG_FILE_NAME,
  LAST_ERROR_LINE_COUNT,
  EAS_JSON_FILE_NAME,
  EAS_NON_INTERACTIVE_FLAG,
  PLAY_SERVICE_ACCOUNT_FILE_NAME,
  GOOGLE_SERVICE_ACCOUNT_KEY_ENV,
  PLAY_SERVICE_ACCOUNT_GUIDE_URL,
  getAppRoot,
  getAppJsonPath,
  readExpoConfig,
  nativeIosProjectName,
  androidBuildsDirName,
  shouldBump,
  shouldSkipAndroidBuild,
  resolveGoogleServiceAccountKeyPath,
  playServiceAccountHelp,
};
