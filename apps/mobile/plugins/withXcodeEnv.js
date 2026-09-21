const { withDangerousMod } = require("expo/config-plugins");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROD_APP_ENV = "prod";
const RELEASE_CONFIGURATION = "Release";

/**
 * Creates .xcode.env.local with the absolute node path (resolved at prebuild
 * time) and any env vars needed by Xcode build phases. Xcode's shell has a
 * minimal PATH so $(command -v node) won't work there.
 *
 * APP_ENV=prod is only exported for Release so Debug `expo run:ios` keeps
 * the local API URL. Archives still get prod because they use Release.
 */
function writeXcodeEnvLocal(iosDir) {
  const filePath = path.join(iosDir, ".xcode.env.local");
  const nodeBinary = execSync("which node", { encoding: "utf-8" }).trim();
  const lines = [
    `export NODE_BINARY="${nodeBinary}"`,
    `if [ "$CONFIGURATION" = "${RELEASE_CONFIGURATION}" ]; then`,
    `  export APP_ENV=${PROD_APP_ENV}`,
    "fi",
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf-8");
  return nodeBinary;
}

function withXcodeEnv(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const iosDir = config.modRequest.platformProjectRoot;
      const nodeBinary = writeXcodeEnvLocal(iosDir);
      console.log(`withXcodeEnv: wrote .xcode.env.local (node: ${nodeBinary})`);
      return config;
    },
  ]);
}

module.exports = withXcodeEnv;
module.exports.writeXcodeEnvLocal = writeXcodeEnvLocal;
