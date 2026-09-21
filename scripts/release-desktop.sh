#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROD_ENV="$ROOT/apps/desktop/.env.prod"
if [[ -f "$PROD_ENV" ]]; then
  PRODUCTION_API_URL="$(grep -E '^RELAY_API_URL=' "$PROD_ENV" | tail -n1 | cut -d= -f2- | tr -d '\"' | tr -d '\r')"
fi
PRODUCTION_API_URL="${PRODUCTION_API_URL:-https://relay-api-rsck.onrender.com}"
RELEASE_DIR="apps/desktop/release"
ARM_DMG="$RELEASE_DIR/Relay-mac-arm64.dmg"
ARM_ZIP="$RELEASE_DIR/Relay-mac-arm64.zip"
INTEL_DMG="$RELEASE_DIR/Relay-mac-x64.dmg"
INTEL_ZIP="$RELEASE_DIR/Relay-mac-x64.zip"
WIN_EXE="$RELEASE_DIR/Relay-win-x64.exe"
UPDATE_MAC="$RELEASE_DIR/latest-mac.yml"
UPDATE_WIN="$RELEASE_DIR/latest.yml"
ARM_APP="$RELEASE_DIR/mac-arm64/Relay.app"
INTEL_APP="$RELEASE_DIR/mac/Relay.app"
DOWNLOAD_BASE="https://github.com/tapiwakundi/relay/releases/latest/download"
DESKTOP_PACKAGE="apps/desktop/package.json"
ROOT_PACKAGE="package.json"
VERSION=""
TAG=""
VERSION_BUMPED=0
VERSION_COMMITTED=0
VERSION_BACKUP_DIR=""

cleanup() {
  status=$?
  if [[ "$status" -ne 0 && "$VERSION_BUMPED" -eq 1 && "$VERSION_COMMITTED" -eq 0 && -n "$VERSION_BACKUP_DIR" ]]; then
    git reset -q HEAD -- "$ROOT_PACKAGE" "$DESKTOP_PACKAGE" 2>/dev/null || true
    cp "$VERSION_BACKUP_DIR/root-package.json" "$ROOT_PACKAGE"
    cp "$VERSION_BACKUP_DIR/desktop-package.json" "$DESKTOP_PACKAGE"
    echo "Release failed before the version commit; restored the previous version."
  fi
  if [[ -n "$VERSION_BACKUP_DIR" ]]; then
    rm -rf "$VERSION_BACKUP_DIR"
  fi
}
trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Desktop releases are built on macOS, including the Intel Mac app and the Windows installer."
  exit 1
fi

for cmd in pnpm gh codesign spctl xcrun curl git node file; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
done

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not logged in. Run: gh auth login"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash before releasing."
  git status --short
  exit 1
fi

if [[ -z "${APPLE_API_KEY:-}" || -z "${APPLE_API_KEY_ID:-}" || -z "${APPLE_API_ISSUER:-}" ]]; then
  echo "Set notarization credentials before releasing:"
  echo "  export APPLE_API_KEY=/path/to/AuthKey_${APPLE_API_KEY_ID:-XXXXXXXXXX}.p8"
  echo "  export APPLE_API_KEY_ID=XXXXXXXXXX"
  echo "  export APPLE_API_ISSUER=your-issuer-uuid"
  echo "Developer ID can live in Keychain. If you use a .p12 instead, also set CSC_LINK and CSC_KEY_PASSWORD."
  exit 1
fi

if [[ ! -f "$APPLE_API_KEY" ]]; then
  echo "APPLE_API_KEY is not a file: $APPLE_API_KEY"
  exit 1
fi

echo "Checking production API…"
healthy=0
for attempt in 1 2 3 4 5 6; do
  if curl -fsS "$PRODUCTION_API_URL/api/health" | grep -q '"ok":true'; then
    healthy=1
    break
  fi
  echo "API health check failed (attempt $attempt); retrying…"
  sleep 10
done
if [[ "$healthy" -ne 1 ]]; then
  echo "Production API at $PRODUCTION_API_URL/api/health is not healthy."
  exit 1
fi

CURRENT_VERSION="$(node -p "require('./$DESKTOP_PACKAGE').version")"
if gh release view "v${CURRENT_VERSION}" >/dev/null 2>&1; then
  VERSION_BACKUP_DIR="$(mktemp -d)"
  cp "$ROOT_PACKAGE" "$VERSION_BACKUP_DIR/root-package.json"
  cp "$DESKTOP_PACKAGE" "$VERSION_BACKUP_DIR/desktop-package.json"
  VERSION_BUMPED=1
  VERSION="$(
    node - "$ROOT_PACKAGE" "$DESKTOP_PACKAGE" <<'NODE'
const fs = require("node:fs");
const [rootPath, desktopPath] = process.argv.slice(2);
const desktop = JSON.parse(fs.readFileSync(desktopPath, "utf8"));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(desktop.version);
if (!match) throw new Error(`Desktop version must be x.y.z, received ${desktop.version}`);
const next = `${match[1]}.${Number(match[2]) + 1}.0`;
for (const file of [rootPath, desktopPath]) {
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.version = next;
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}
process.stdout.write(next);
NODE
  )"
  echo "Bumped Relay desktop ${CURRENT_VERSION} → ${VERSION}."
else
  VERSION="$CURRENT_VERSION"
  echo "Version ${VERSION} has not been published yet; retrying it without another bump."
fi
TAG="v${VERSION}"

echo "Building Relay ${VERSION} for Apple Silicon, Intel Mac, and Windows…"
export APP_ENV=prod
# One electron-builder invocation so latest-mac.yml lists both Mac architectures.
pnpm --filter @relay/desktop dist

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing release artifact: $1"
    exit 1
  fi
}

require_file "$ARM_DMG"
require_file "$ARM_ZIP"
require_file "$ARM_ZIP.blockmap"
require_file "$INTEL_DMG"
require_file "$INTEL_ZIP"
require_file "$INTEL_ZIP.blockmap"
require_file "$WIN_EXE"
require_file "$WIN_EXE.blockmap"
require_file "$UPDATE_MAC"
require_file "$UPDATE_WIN"
test -d "$ARM_APP"
test -d "$INTEL_APP"
grep -q "Relay-mac-arm64.zip" "$UPDATE_MAC"
grep -q "Relay-mac-x64.zip" "$UPDATE_MAC"
grep -q "Relay-win-x64.exe" "$UPDATE_WIN"
if ! file "$WIN_EXE" | grep -q "PE32+"; then
  echo "Windows installer is not a 64-bit Windows executable: $WIN_EXE"
  exit 1
fi

verify_mac_app() {
  local app="$1"
  echo "Verifying signature and notarization for $app…"
  # Gatekeeper checks the app. electron-builder leaves the DMG unsigned on purpose.
  codesign --verify --deep --strict --verbose=2 "$app"
  spctl --assess --type execute --verbose "$app"
  xcrun stapler validate "$app"
}

verify_mac_app "$ARM_APP"
verify_mac_app "$INTEL_APP"

checksum() {
  shasum -a 256 "$1" | tee "$1.sha256"
}

checksum "$ARM_DMG"
checksum "$ARM_ZIP"
checksum "$INTEL_DMG"
checksum "$INTEL_ZIP"
checksum "$WIN_EXE"

ASSETS=(
  "$ARM_DMG" "$ARM_DMG.sha256" "$ARM_ZIP" "$ARM_ZIP.sha256" "$ARM_ZIP.blockmap"
  "$INTEL_DMG" "$INTEL_DMG.sha256" "$INTEL_ZIP" "$INTEL_ZIP.sha256" "$INTEL_ZIP.blockmap"
  "$WIN_EXE" "$WIN_EXE.sha256" "$WIN_EXE.blockmap"
  "$UPDATE_MAC" "$UPDATE_WIN"
)
if [[ -f "$ARM_DMG.blockmap" ]]; then
  ASSETS+=("$ARM_DMG.blockmap")
fi
if [[ -f "$INTEL_DMG.blockmap" ]]; then
  ASSETS+=("$INTEL_DMG.blockmap")
fi

if [[ "$VERSION_BUMPED" -eq 1 ]]; then
  echo "Committing ${TAG} version bump…"
  git commit -m "chore(desktop): release ${TAG}" -- "$ROOT_PACKAGE" "$DESKTOP_PACKAGE"
  VERSION_COMMITTED=1
fi

echo "Pushing $(git rev-parse --abbrev-ref HEAD) to origin…"
git push -u origin HEAD

NOTES="$(printf '%s\n' \
  "Relay ${VERSION} for macOS and Windows." \
  "" \
  "Apple Silicon: ${DOWNLOAD_BASE}/Relay-mac-arm64.dmg" \
  "Intel Mac: ${DOWNLOAD_BASE}/Relay-mac-x64.dmg" \
  "Windows: ${DOWNLOAD_BASE}/Relay-win-x64.exe" \
  "" \
  "Existing installations can update from Relay → Check for Updates." \
  "Requires macOS 12+ or 64-bit Windows 10+. The app talks to ${PRODUCTION_API_URL}.")"

TARGET="$(git rev-parse HEAD)"
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Updating existing release ${TAG}…"
  gh release upload "$TAG" "${ASSETS[@]}" --clobber
  gh release edit "$TAG" --title "Relay ${VERSION}" --notes "$NOTES"
else
  echo "Creating GitHub release ${TAG}…"
  gh release create "$TAG" "${ASSETS[@]}" \
    --title "Relay ${VERSION}" \
    --notes "$NOTES" \
    --target "$TARGET"
fi

echo "Published ${TAG}:"
echo "  https://github.com/tapiwakundi/relay/releases/tag/${TAG}"
echo "  ${DOWNLOAD_BASE}/Relay-mac-arm64.dmg"
echo "  ${DOWNLOAD_BASE}/Relay-mac-x64.dmg"
echo "  ${DOWNLOAD_BASE}/Relay-win-x64.exe"
echo "  Automatic update metadata: ${DOWNLOAD_BASE}/latest-mac.yml and ${DOWNLOAD_BASE}/latest.yml"
if [[ -z "${WIN_CSC_LINK:-}" ]]; then
  echo "Windows installer is unsigned. SmartScreen will warn until WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD are set."
fi
