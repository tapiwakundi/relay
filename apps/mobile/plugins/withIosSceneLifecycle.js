const { withInfoPlist, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withIosSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return mod;
  });

  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const src = path.join(__dirname, "ios", "AppDelegate.swift");
      const projectName = mod.modRequest.projectName || "Relay";
      const dest = path.join(mod.modRequest.platformProjectRoot, projectName, "AppDelegate.swift");
      fs.copyFileSync(src, dest);
      return mod;
    },
  ]);
};
