const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SNIPPET = `
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        ver = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if ver && ver.to_f < 15.0
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
        end
      end
    end
`;

module.exports = function withIosMinTarget(config) {
  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const podfile = path.join(mod.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");
      if (!contents.includes("ver.to_f < 15.0")) {
        contents = contents.replace("react_native_post_install(", `${SNIPPET}\n    react_native_post_install(`);
        fs.writeFileSync(podfile, contents);
      }
      return mod;
    },
  ]);
};
