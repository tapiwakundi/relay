const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const rnRoot = path.dirname(require.resolve("react-native/package.json", { paths: [projectRoot] }));

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

function resolveFrom(moduleName, originModulePath) {
  const searchPaths = [projectRoot, rnRoot];
  if (originModulePath) searchPaths.unshift(path.dirname(originModulePath));
  return require.resolve(moduleName, { paths: searchPaths });
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const intercept =
    moduleName === "better-auth" ||
    moduleName.startsWith("better-auth/") ||
    moduleName.startsWith("@better-auth/") ||
    moduleName.startsWith("@better-fetch/") ||
    moduleName.startsWith("@react-native/");

  if (intercept) {
    try {
      return { filePath: resolveFrom(moduleName, context.originModulePath), type: "sourceFile" };
    } catch {
      /* fall through to Metro */
    }
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
