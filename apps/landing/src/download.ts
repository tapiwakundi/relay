export const RELEASE_BASE = "https://github.com/tapiwakundi/relay/releases/latest/download";

export type DesktopOs = "mac" | "windows" | "other";
export type MacChip = "arm64" | "x64";

export type DownloadTarget = {
  id: "mac-arm64" | "mac-x64" | "win-x64";
  label: string;
  shortLabel: string;
  detail: string;
  filename: string;
};

export const DOWNLOADS = {
  macArm: {
    id: "mac-arm64",
    label: "Download for Mac",
    shortLabel: "Apple Silicon",
    detail: "Apple Silicon · macOS 12+",
    filename: "Relay-mac-arm64.dmg",
  },
  macIntel: {
    id: "mac-x64",
    label: "Download for Mac",
    shortLabel: "Intel Mac",
    detail: "Intel · macOS 12+",
    filename: "Relay-mac-x64.dmg",
  },
  windows: {
    id: "win-x64",
    label: "Download for Windows",
    shortLabel: "Windows",
    detail: "64-bit · Windows 10+",
    filename: "Relay-win-x64.exe",
  },
} as const satisfies Record<string, DownloadTarget>;

export const ALL_DOWNLOADS: DownloadTarget[] = [DOWNLOADS.macArm, DOWNLOADS.macIntel, DOWNLOADS.windows];

export function downloadUrl(filename: string) {
  return `${RELEASE_BASE}/${filename}`;
}

export function detectDesktopOs(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): DesktopOs {
  const ua = input.userAgent;
  const platform = input.platform ?? "";
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return "other";
  const looksLikeMac = /Mac/i.test(platform) || /Macintosh|Mac OS X/i.test(ua);
  if (looksLikeMac && (input.maxTouchPoints ?? 0) > 1) return "other";
  if (looksLikeMac) return "mac";
  return "other";
}

export function macChipFromArchitecture(architecture: string | undefined): MacChip | null {
  if (!architecture) return null;
  if (/arm|aarch64/i.test(architecture)) return "arm64";
  if (/x86|x64|amd64/i.test(architecture)) return "x64";
  return null;
}

/** Safari still reports an Intel user agent on Apple Silicon, so the GPU string is the fallback. */
export function macChipFromGpu(renderer: string | undefined): MacChip | null {
  if (!renderer) return null;
  if (/Apple\s+M\d|Apple GPU/i.test(renderer)) return "arm64";
  if (/Intel|AMD|Radeon|NVIDIA|GeForce/i.test(renderer)) return "x64";
  return null;
}

export function suggestDownload(input: { os: DesktopOs; macChip: MacChip | null }): DownloadTarget {
  if (input.os === "windows") return DOWNLOADS.windows;
  if (input.os === "mac" && input.macChip === "x64") return DOWNLOADS.macIntel;
  return DOWNLOADS.macArm;
}
