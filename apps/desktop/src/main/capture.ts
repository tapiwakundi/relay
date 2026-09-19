import { desktopCapturer, session, systemPreferences } from "electron";
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

export async function prepareMedia(): Promise<MediaAccess> {
  if (process.platform !== "darwin") return { microphone: true, camera: true };
  const [microphone, camera] = await Promise.all([
    systemPreferences.askForMediaAccess("microphone"),
    systemPreferences.askForMediaAccess("camera"),
  ]);
  return { microphone, camera };
}
