const fs = require("fs");
const path = require("path");

function loadEnvFile(envPath, { overwrite = false } = {}) {
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq);
    let value = line.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key.startsWith("EXPO_PUBLIC_")) continue;
    if (overwrite || !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(__dirname, ".env"));
loadEnvFile(path.resolve(__dirname, ".env.local"), { overwrite: true });

module.exports = require("./app.json");
