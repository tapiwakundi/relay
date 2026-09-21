import {
  ALL_DOWNLOADS,
  detectDesktopOs,
  downloadUrl,
  macChipFromArchitecture,
  macChipFromGpu,
  suggestDownload,
  type DownloadTarget,
  type MacChip,
} from "./download";

const RELEASES_API = "https://api.github.com/repos/tapiwakundi/relay/releases/latest";

const button = document.getElementById("download-btn");
const note = document.getElementById("download-note");
const alternates = document.getElementById("download-alts");
const version = document.getElementById("version");

type UserAgentData = {
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
};

function gpuRenderer() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (!gl) return;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return;
    const value = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof value === "string" ? value : undefined;
  } catch {
    return;
  }
}

async function detectMacChip(): Promise<MacChip | null> {
  const uaData = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
  if (uaData?.getHighEntropyValues) {
    try {
      const values = await uaData.getHighEntropyValues(["architecture"]);
      const fromAgent = macChipFromArchitecture(values.architecture);
      if (fromAgent) return fromAgent;
    } catch {
      /* Safari and locked-down browsers omit high-entropy hints. */
    }
  }
  return macChipFromGpu(gpuRenderer());
}

function applyDownload(target: DownloadTarget, tagName?: string) {
  if (button instanceof HTMLAnchorElement) {
    button.href = downloadUrl(target.filename);
    button.textContent = target.label;
  }
  if (note) {
    const releases = note.querySelector("a");
    note.replaceChildren(`${target.detail} · `);
    if (releases) note.append(releases);
  }
  if (alternates) {
    const others = ALL_DOWNLOADS.filter((item) => item.filename !== target.filename);
    alternates.replaceChildren("Also available for ");
    others.forEach((item, index) => {
      if (index > 0) alternates.append(index === others.length - 1 ? " and " : ", ");
      const link = document.createElement("a");
      link.href = downloadUrl(item.filename);
      link.textContent = item.shortLabel;
      alternates.append(link);
    });
    alternates.append(".");
  }
  if (version && tagName) {
    version.textContent = `Latest release ${tagName} · ${target.shortLabel}`;
  }
}

async function suggest() {
  const os = detectDesktopOs({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  const macChip = os === "mac" ? await detectMacChip() : null;
  return suggestDownload({ os, macChip });
}

let suggested = suggestDownload({ os: "other", macChip: null });
let releaseTag: string | undefined;

function refreshDownload() {
  applyDownload(suggested, releaseTag);
}

refreshDownload();

void suggest().then((target) => {
  suggested = target;
  refreshDownload();
});

void fetch(RELEASES_API, { headers: { accept: "application/vnd.github+json" } })
  .then(async (response) => {
    if (!response.ok) return;
    const data = (await response.json()) as { tag_name?: string };
    if (!data.tag_name) return;
    releaseTag = data.tag_name;
    refreshDownload();
  })
  .catch(() => {
    /* Keep the static download label if GitHub is unreachable. */
  });
