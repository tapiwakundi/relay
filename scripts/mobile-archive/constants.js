const fs = require("fs");
const path = require("path");

const SKIP_BUMP_FLAG = "--no-bump";
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
const INCREMENT_SCRIPT = "incrementBuildNumber.js";

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

function shouldBump() {
  return !process.argv.includes(SKIP_BUMP_FLAG);
}

module.exports = {
  SKIP_BUMP_FLAG,
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
  INCREMENT_SCRIPT,
  getAppRoot,
  getAppJsonPath,
  readExpoConfig,
  nativeIosProjectName,
  shouldBump,
};
