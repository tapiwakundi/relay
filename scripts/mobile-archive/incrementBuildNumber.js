#!/usr/bin/env node

/**
 * Increments expo.buildNumber in the current app's app.json by 1.
 * Run from the mobile app directory.
 */

const fs = require("fs");
const { getAppJsonPath, readExpoConfig } = require("./constants");

const appJsonPath = getAppJsonPath();
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const oldBuild = appJson.expo.buildNumber || 0;
const newBuild = oldBuild + 1;

appJson.expo.buildNumber = newBuild;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n");

console.log(
  `Build number: ${oldBuild} → ${newBuild} (version ${readExpoConfig().version})`,
);
