const DOWNLOAD_URL = "https://github.com/tapiwakundi/relay/releases/latest/download/Relay-mac-arm64.dmg";
const RELEASES_API = "https://api.github.com/repos/tapiwakundi/relay/releases/latest";

const button = document.getElementById("download-btn");
const version = document.getElementById("version");

if (button instanceof HTMLAnchorElement) {
  button.href = DOWNLOAD_URL;
}

void fetch(RELEASES_API, { headers: { accept: "application/vnd.github+json" } })
  .then(async (response) => {
    if (!response.ok) return;
    const data = (await response.json()) as { tag_name?: string };
    if (version && data.tag_name) {
      version.textContent = `Latest release ${data.tag_name} · Apple Silicon`;
    }
  })
  .catch(() => {
    /* Keep the static download label if GitHub is unreachable. */
  });
