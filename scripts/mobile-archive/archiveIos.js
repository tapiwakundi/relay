#!/usr/bin/env node

/**
 * Archives a Release iOS build of the current mobile app and uploads it
 * to App Store Connect. Uses the Apple ID already signed into Xcode.
 *
 * Run from the mobile app directory (`pnpm --filter @relay/mobile archive:ios`).
 */

const fs = require("fs");
const path = require("path");
const {
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
  readExpoConfig,
  nativeIosProjectName,
  shouldBump,
} = require("./constants");
const { run } = require("./run");
const { writeXcodeEnvLocal } = require("../../apps/mobile/plugins/withXcodeEnv.js");

const appRoot = getAppRoot();
const iosDir = path.join(appRoot, "ios");
const envProdPath = path.join(appRoot, ENV_PROD_FILE_NAME);

function requireIosProject(projectName) {
  const workspacePath = path.join(iosDir, `${projectName}.xcworkspace`);
  if (!fs.existsSync(workspacePath)) {
    throw new Error(
      `Missing ${workspacePath}. Run pnpm prebuild:ios first.`,
    );
  }
}

function requireProdEnv() {
  if (!fs.existsSync(envProdPath)) {
    throw new Error(
      `Missing ${ENV_PROD_FILE_NAME}. Release archives load it for EXPO_PUBLIC_API_URL.`,
    );
  }
}

function setPlistString(plistPath, key, value) {
  if (!fs.existsSync(plistPath)) {
    return;
  }
  run("plutil", ["-replace", key, "-string", String(value), plistPath]);
}

function syncNativeVersions(projectName, version, buildNumber) {
  const infoPlistPath = path.join(iosDir, projectName, "Info.plist");
  setPlistString(infoPlistPath, BUNDLE_VERSION_KEY, buildNumber);
  setPlistString(infoPlistPath, BUNDLE_SHORT_VERSION_KEY, version);
}

function writeExportOptions(filePath, teamId) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>${EXPORT_METHOD}</string>
  <key>destination</key>
  <string>${EXPORT_DESTINATION}</string>
  <key>signingStyle</key>
  <string>${SIGNING_STYLE}</string>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
`;
  fs.writeFileSync(filePath, plist);
}

function main() {
  requireProdEnv();

  if (shouldBump()) {
    run(process.execPath, [path.join(__dirname, INCREMENT_SCRIPT)]);
  }

  const expo = readExpoConfig();
  const appName = expo.name;
  const projectName = nativeIosProjectName(appName);
  const version = String(expo.version);
  const buildNumber = String(expo.buildNumber);
  const teamId = expo.ios.appleTeamId;

  if (!teamId) {
    throw new Error("expo.ios.appleTeamId is missing from app.json");
  }

  requireIosProject(projectName);
  writeXcodeEnvLocal(iosDir);
  syncNativeVersions(projectName, version, buildNumber);

  const buildDir = path.join(iosDir, BUILD_DIR_NAME);
  fs.mkdirSync(buildDir, { recursive: true });

  const archivePath = path.join(buildDir, `${projectName}.xcarchive`);
  const exportPath = path.join(buildDir, "export");
  const exportOptionsPath = path.join(buildDir, EXPORT_OPTIONS_FILE_NAME);
  const derivedDataPath = path.join(buildDir, "DerivedData");
  const workspace = `${projectName}.xcworkspace`;

  writeExportOptions(exportOptionsPath, teamId);

  console.log(
    `Archiving ${appName} ${version} (${buildNumber}) → App Store Connect`,
  );

  run(
    "xcodebuild",
    [
      "-workspace",
      workspace,
      "-scheme",
      projectName,
      "-configuration",
      CONFIGURATION,
      "-destination",
      GENERIC_IOS_DESTINATION,
      "-archivePath",
      archivePath,
      "-derivedDataPath",
      derivedDataPath,
      "-allowProvisioningUpdates",
      "archive",
      `APP_ENV=${PROD_APP_ENV}`,
      `DEVELOPMENT_TEAM=${teamId}`,
      `CURRENT_PROJECT_VERSION=${buildNumber}`,
      `MARKETING_VERSION=${version}`,
    ],
    iosDir,
  );

  console.log("Uploading archive to App Store Connect…");

  run(
    "xcodebuild",
    [
      "-exportArchive",
      "-archivePath",
      archivePath,
      "-exportPath",
      exportPath,
      "-exportOptionsPlist",
      exportOptionsPath,
      "-allowProvisioningUpdates",
    ],
    iosDir,
  );

  console.log(
    `Uploaded ${appName} ${version} (${buildNumber}) to App Store Connect.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(typeof error.status === "number" ? error.status : 1);
}
