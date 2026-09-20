#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PRODUCTION_API_URL="${RELAY_API_URL:-https://relay-api-rsck.onrender.com}"
DMG="apps/desktop/release/Relay-mac-arm64.dmg"
ZIP="apps/desktop/release/Relay-mac-arm64.zip"
UPDATE_YML="apps/desktop/release/latest-mac.yml"
APP="apps/desktop/release/mac-arm64/Relay.app"
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
  echo "Desktop releases must be built on macOS."
  exit 1
fi

for cmd in pnpm gh codesign spctl xcrun curl git node; do
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

echo "Building, signing, and notarizing Relay ${VERSION}…"
export RELAY_API_URL="$PRODUCTION_API_URL"
pnpm --filter @relay/desktop dist

test -d "$APP"
test -f "$DMG"
test -f "$ZIP"
test -f "$ZIP.blockmap"
test -f "$UPDATE_YML"

echo "Verifying signature and notarization…"
# Gatekeeper checks the app. electron-builder leaves the DMG unsigned on purpose.
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --type execute --verbose "$APP"
xcrun stapler validate "$APP"
shasum -a 256 "$DMG" | tee "$DMG.sha256"
shasum -a 256 "$ZIP" | tee "$ZIP.sha256"

ASSETS=("$DMG" "$DMG.sha256" "$ZIP" "$ZIP.sha256" "$ZIP.blockmap" "$UPDATE_YML")
if [[ -f "$DMG.blockmap" ]]; then
  ASSETS+=("$DMG.blockmap")
fi

if [[ "$VERSION_BUMPED" -eq 1 ]]; then
  echo "Committing ${TAG} version bump…"
  git commit -m "chore(desktop): release ${TAG}" -- "$ROOT_PACKAGE" "$DESKTOP_PACKAGE"
  VERSION_COMMITTED=1
fi

echo "Pushing $(git rev-parse --abbrev-ref HEAD) to origin…"
git push -u origin HEAD

NOTES="$(printf '%s\n' \
  "Relay ${VERSION} for Apple Silicon." \
  "" \
  "Download: https://github.com/tapiwakundi/relay/releases/latest/download/Relay-mac-arm64.dmg" \
  "Existing installations can update from Help → Check for updates." \
  "" \
  "Requires macOS 12+ on Apple Silicon. The app talks to ${PRODUCTION_API_URL}.")"

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
echo "  https://github.com/tapiwakundi/relay/releases/latest/download/Relay-mac-arm64.dmg"
echo "  Automatic update metadata: https://github.com/tapiwakundi/relay/releases/latest/download/latest-mac.yml"
