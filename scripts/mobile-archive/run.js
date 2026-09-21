const { spawnSync } = require("child_process");
const { getAppRoot } = require("./constants");

function run(command, args, cwd = getAppRoot(), options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio || "inherit",
    cwd,
    env: options.env || process.env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? "error"}`);
  }
}

module.exports = {
  run,
};
