import { execFileSync } from "node:child_process";
import { app, desktopCapturer, session, shell, systemPreferences } from "electron";
import type { MediaAccess } from "../shared/ipc";

const mediaPermissions = new Set([
  "media",
  "display-capture",
  "mediaKeySystem",
  "notifications",
  "clipboard-sanitized-write",
  "fullscreen",
]);

export function installCapture() {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(mediaPermissions.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => mediaPermissions.has(permission));
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ["screen", "window"],
          thumbnailSize: { width: 0, height: 0 },
          fetchWindowIcons: false,
        });
        const screen = sources.find((source) => source.id.startsWith("screen:")) ?? sources[0];
        if (!screen) {
          callback({});
          return;
        }
        callback({ video: screen });
      } catch (error) {
        console.error("Screen capture failed", error);
        callback({});
      }
    },
    { useSystemPicker: true },
  );
}

const MICROPHONE_SETTINGS = [
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone",
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
];

async function openMicrophoneSettings() {
  for (const url of MICROPHONE_SETTINGS) {
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function hostPrivacyApp() {
  if (app.isPackaged || process.platform !== "darwin") return null;
  let pid = process.ppid;
  for (let i = 0; i < 12 && pid > 1; i += 1) {
    let command = "";
    let parent = "";
    try {
      command = execFileSync("ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" }).trim();
      parent = execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], { encoding: "utf8" }).trim();
    } catch {
      break;
    }
    const names = [...command.matchAll(/\/([^/]+)\.app\//g)]
      .map((match) => match[1])
      .filter((name) => name !== "Electron" && !name.endsWith(" Helper"));
    if (names[0]) return names[0];
    const next = Number(parent);
    if (!next || next === pid) break;
    pid = next;
  }
  return null;
}

export async function prepareMedia(): Promise<MediaAccess> {
  const privacyName = hostPrivacyApp() ?? app.getName();
  if (process.platform !== "darwin") {
    return {
      microphone: true,
      camera: true,
      microphoneStatus: "granted",
      appName: app.getName(),
      privacyName,
      openedSettings: false,
    };
  }
  const microphoneStatus = systemPreferences.getMediaAccessStatus("microphone");
  const cameraStatus = systemPreferences.getMediaAccessStatus("camera");
  const microphone =
    microphoneStatus === "granted"
      ? true
      : microphoneStatus === "denied" || microphoneStatus === "restricted"
        ? false
        : await systemPreferences.askForMediaAccess("microphone");
  const camera =
    cameraStatus === "granted"
      ? true
      : cameraStatus === "denied" || cameraStatus === "restricted"
        ? false
        : await systemPreferences.askForMediaAccess("camera");
  const openedSettings =
    !microphone && (microphoneStatus === "denied" || microphoneStatus === "restricted")
      ? await openMicrophoneSettings()
      : false;
  return { microphone, camera, microphoneStatus, appName: app.getName(), privacyName, openedSettings };
}
