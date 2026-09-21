#!/usr/bin/env node

/**
 * Builds a Release Android App Bundle for the current mobile app and
 * uploads it to Google Play internal testing (track: internal).
 *
 * Run from the mobile app directory (`pnpm --filter @relay/mobile archive:android`).
 *
 * Play uploads need a Google service account JSON. Place
 * play-service-account.json in the app directory, set
 * GOOGLE_SERVICE_ACCOUNT_KEY_PATH, or complete the one-time EAS prompt.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  PLATFORM_ANDROID,
  BUILD_PROFILE,
  SUBMIT_PROFILE,
  AAB_EXTENSION,
  NPX_YES_FLAG,
  EAS_CLI_PACKAGE,
  EAS_JSON_FILE_NAME,
  EAS_NON_INTERACTIVE_FLAG,
  INCREMENT_SCRIPT,
  ENV_PROD_FILE_NAME,
  getAppRoot,
  readExpoConfig,
  androidBuildsDirName,
  shouldBump,
  shouldSkipAndroidBuild,
  resolveGoogleServiceAccountKeyPath,
  playServiceAccountHelp,
} = require("./constants");
const { run } = require("./run");

const appRoot = getAppRoot();
const gradlePath = path.join(appRoot, "android", "app", "build.gradle");
const easJsonPath = path.join(appRoot, EAS_JSON_FILE_NAME);

function requireAndroidProject() {
  if (!fs.existsSync(gradlePath)) {
    throw new Error(
      `Missing ${gradlePath}. Run pnpm prebuild:android first.`,
    );
  }
}

function requireProdEnv() {
  const envProdPath = path.join(appRoot, ENV_PROD_FILE_NAME);
  if (!fs.existsSync(envProdPath)) {
    throw new Error(
      `Missing ${ENV_PROD_FILE_NAME}. Release archives load it for EXPO_PUBLIC_API_URL.`,
    );
  }
}

function aabFileName(version, buildNumber) {
  const parts = version.split(".");
  const shortVersion = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
  return `${shortVersion}.${buildNumber}${AAB_EXTENSION}`;
}

function syncNativeVersions(version, buildNumber) {
  const gradle = fs.readFileSync(gradlePath, "utf8");
  const versionCodePattern = /(defaultConfig \{[\s\S]*?versionCode )\d+/;
  const versionNamePattern = /(defaultConfig \{[\s\S]*?versionName )"[^"]+"/;
  if (!versionCodePattern.test(gradle) || !versionNamePattern.test(gradle)) {
    throw new Error(
      "Could not update versionCode/versionName in android/app/build.gradle",
    );
  }
  const next = gradle
    .replace(versionCodePattern, `$1${buildNumber}`)
    .replace(versionNamePattern, `$1"${version}"`);
  if (next !== gradle) {
    fs.writeFileSync(gradlePath, next);
  }
}

function withAndroidServiceAccountKeyPath(keyPath, fn) {
  if (!keyPath) {
    return fn();
  }
  const original = fs.readFileSync(easJsonPath, "utf8");
  const easJson = JSON.parse(original);
  const submitProfile = easJson.submit?.[SUBMIT_PROFILE] || {};
  easJson.submit = {
    ...easJson.submit,
    [SUBMIT_PROFILE]: {
      ...submitProfile,
      android: {
        ...submitProfile.android,
        serviceAccountKeyPath: keyPath,
      },
    },
  };
  fs.writeFileSync(easJsonPath, `${JSON.stringify(easJson, null, 2)}\n`);
  try {
    return fn();
  } finally {
    fs.writeFileSync(easJsonPath, original);
  }
}

function easSubmitArgs(outputPath, nonInteractive) {
  const args = [
    NPX_YES_FLAG,
    EAS_CLI_PACKAGE,
    "submit",
    "--platform",
    PLATFORM_ANDROID,
    "--profile",
    SUBMIT_PROFILE,
    "--path",
    outputPath,
  ];
  if (nonInteractive) {
    args.push(EAS_NON_INTERACTIVE_FLAG);
  }
  return args;
}

function submitAab(outputPath, { keyPath, nonInteractive }) {
  withAndroidServiceAccountKeyPath(keyPath, () => {
    run("npx", easSubmitArgs(outputPath, nonInteractive));
  });
}

function submitToPlay(outputPath) {
  const keyPath = resolveGoogleServiceAccountKeyPath();
  try {
    submitAab(outputPath, { keyPath, nonInteractive: true });
  } catch (error) {
    if (!process.stdin.isTTY) {
      throw new Error(`${error.message}\n${playServiceAccountHelp()}`);
    }
    console.log(
      "EAS could not submit non-interactively. Prompting for a Play service account key…",
    );
    console.log(playServiceAccountHelp());
    submitAab(outputPath, { keyPath: null, nonInteractive: false });
  }
}

function main() {
  requireProdEnv();
  requireAndroidProject();

  if (shouldBump()) {
    run(process.execPath, [path.join(__dirname, INCREMENT_SCRIPT)]);
  }

  const expo = readExpoConfig();
  const version = String(expo.version);
  const buildNumber = String(expo.buildNumber);
  const outputDir = path.join(
    os.homedir(),
    "Desktop",
    androidBuildsDirName(expo.slug),
  );
  const outputPath = path.join(outputDir, aabFileName(version, buildNumber));
  const skipBuild = shouldSkipAndroidBuild();

  if (skipBuild) {
    if (!fs.existsSync(outputPath)) {
      throw new Error(
        `Missing ${outputPath}. Run without --skip-build to create it.`,
      );
    }
    console.log(`Skipping Android build; using ${outputPath}`);
  } else {
    syncNativeVersions(version, buildNumber);
    fs.mkdirSync(outputDir, { recursive: true });

    console.log(
      `Building ${expo.name} ${version} (${buildNumber}) Android App Bundle`,
    );

    run("npx", [
      NPX_YES_FLAG,
      EAS_CLI_PACKAGE,
      "build",
      "--platform",
      PLATFORM_ANDROID,
      "--profile",
      BUILD_PROFILE,
      "--local",
      "--output",
      outputPath,
      EAS_NON_INTERACTIVE_FLAG,
    ]);
  }

  console.log(`Uploading ${outputPath} to Google Play internal testing…`);
  submitToPlay(outputPath);

  console.log(
    `Uploaded ${expo.name} ${version} (${buildNumber}) to Google Play internal testing.`,
  );
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(typeof error.status === "number" ? error.status : 1);
}
