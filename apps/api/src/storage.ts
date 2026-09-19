import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";

const BUCKET = "relay-storage";

export function storage() {
  return new Files({ adapter: neon({ bucket: BUCKET }) });
}

export function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export async function publicFileUrl(keyOrUrl: string | null | undefined): Promise<string | null> {
  if (!keyOrUrl) return null;
  if (isHttpUrl(keyOrUrl)) return keyOrUrl;
  try {
    return await storage().url(keyOrUrl, { expiresIn: 60 * 60 * 24 * 7 });
  } catch {
    return null;
  }
}

function fileExt(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "png";
  return ["png", "jpg", "jpeg", "gif", "webp"].includes(ext) ? ext : "png";
}

export function objectKey(userId: string, filename: string) {
  const safe = filename.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 80);
  return `uploads/${userId}/${crypto.randomUUID()}-${safe}`;
}

export function avatarObjectKey(userId: string, filename: string) {
  return `avatars/${userId}/${crypto.randomUUID()}.${fileExt(filename)}`;
}

export function workspaceIconObjectKey(workspaceId: string, filename: string) {
  return `workspace/${workspaceId}/icon/${crypto.randomUUID()}.${fileExt(filename)}`;
}
