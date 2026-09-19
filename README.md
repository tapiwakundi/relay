# Relay

Slack-shaped workspace chat: channels, DMs, threads, huddles, desktop, and mobile.

**Not affiliated with Slack.** Layout and interaction are modeled on Slack; brand marks, logos, and assets are original.

## Stack

- **API:** Hono + TypeScript + WebSockets on Render (`https://relay-api-rsck.onrender.com`)
- **Auth:** Better Auth on the API (email/password + system-browser Google for desktop)
- **DB:** Neon Postgres
- **Files:** Neon Object Storage (`relay-storage`, private bucket)
- **Desktop:** Electron (`com.endurancelabs.relaydesktop`) with a bundled React renderer, native notifications, and screen sharing
- **Landing:** Static Vite site on Render (`apps/landing`)
- **Mobile:** Expo + push token registration (`com.endurancelabs.relay`)
- **Huddles:** LiveKit Cloud (optional; roster works without keys)

## Quick start

```bash
npm i -g neon@latest && neon login
neon skills -y
neon mcp -y
neon link --project-id small-cloud-72606464 --branch production -y
neon config init   # if neon.ts is missing
# neon.ts already declares auth + the relay-storage bucket
neon deploy
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/desktop/.env.example apps/desktop/.env
neon env pull --file apps/api/.env
pnpm --filter @relay/api db:push
pnpm dev
```

Create a Google Cloud **Web application** OAuth client and put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `apps/api/.env`. Add these authorized redirect URIs:

- `http://localhost:3001/api/auth/callback/google`
- `https://relay-api-rsck.onrender.com/api/auth/callback/google`

Authorized JavaScript origins:

- `http://localhost:3001`
- `https://relay-api-rsck.onrender.com`

`pnpm dev` starts the API and the desktop app. The first account creates an empty workspace; later accounts join it. Google sign-in opens the system browser and returns to the app through `com.endurancelabs.relaydesktop://auth/callback`.

Desktop alone (API already running):

```bash
pnpm dev:desktop
```

Landing page:

```bash
pnpm dev:landing
```

The first time you join a huddle, macOS asks for the microphone and camera. Screen sharing asks for screen recording. Invite links use `relay://invite?invite=…`, which both the desktop app and the mobile app can open.

Mobile (API reachable from the device). `setup:env` writes your LAN IP:

```bash
pnpm dev:mobile          # physical iPhone
pnpm dev:mobile:sim      # Device Hub / simulator
```

## Environment

Each app loads only its own `apps/<app>/.env` (and optional `.env.local`). Copy the matching `.env.example` to start. Do not put secrets in a repo-root `.env`.

Pull Neon-managed API vars into the API file:

```bash
neon env pull --file apps/api/.env
```

### API (`apps/api/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Required Neon pooled URL |
| `DATABASE_URL_UNPOOLED` | Direct URL for Drizzle push/migrate |
| `BETTER_AUTH_SECRET` | Session signing secret (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Public API origin (`http://localhost:3001` in dev, Render URL in production) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Your Google Web OAuth client |
| `AUTH_ALLOWED_HOSTS` | Extra Host values for OAuth (include port) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_ENDPOINT_URL_S3` / `AWS_REGION` | Object Storage (`relay-storage`) |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Huddle media (optional) |

### Desktop (`apps/desktop/.env`)

| Variable | Purpose |
|---|---|
| `RELAY_API_URL` | API origin. Local: `http://localhost:3001`. Packaged builds: `https://relay-api-rsck.onrender.com` |

### Mobile (`apps/mobile/.env`)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | API origin the phone can reach. `setup:env` writes your LAN IP. |
| `EXPO_ACCESS_TOKEN` | Optional Expo services token |

The landing page is static and does not need env vars.

Google redirect URI is `{BETTER_AUTH_URL}/api/auth/callback/google`. Desktop OAuth returns through the `com.endurancelabs.relaydesktop` URL scheme; mobile continues to use the API on port `3001`.

## Production (Render)

Two services from [`render.yaml`](render.yaml):

- **relay-api** — always-on Node web service. Point `DATABASE_URL` at Neon’s pooled URL and set Better Auth + Google + storage variables. Do not use a sleeping instance — WebSockets will die. Set `BETTER_AUTH_URL=https://relay-api-rsck.onrender.com`.
- **relay-landing** — static landing page from `apps/landing`. The download button points at the latest GitHub Release DMG.

The API `/` route stays the desktop OAuth handoff page. Marketing lives on the static site.

## macOS release

Public download:

`https://github.com/tapiwakundi/relay/releases/latest/download/Relay-mac-arm64.dmg`

Build and publish from your Mac. The tag comes from [`apps/desktop/package.json`](apps/desktop/package.json) (`0.1.0` → `v0.1.0`).

1. Confirm Google Cloud has the production redirect URI above.
2. Confirm `https://relay-api-rsck.onrender.com/api/health` returns `{"ok":true,...}`.
3. Put your Developer ID Application certificate in Keychain, or set `CSC_LINK` / `CSC_KEY_PASSWORD` for a `.p12`.
4. Export an App Store Connect API key and:

```bash
export APPLE_API_KEY=/path/to/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=your-issuer-uuid
```

5. Commit a clean tree, then:

```bash
pnpm release:desktop
```

That signs, notarizes, pushes the current branch, and publishes `Relay-mac-arm64.dmg` to GitHub Releases. The landing-page Download button uses that latest-release URL.

Local unsigned packaging still needs `RELAY_API_URL` in `apps/desktop/.env`. Do not distribute an unsigned DMG publicly.

### Smoke-test a signed install

1. Install the DMG into `/Applications` (not the repo `release/` copy).
2. First launch should pass Gatekeeper.
3. Sign in with Google; the browser should return to Relay authenticated.
4. Session should survive quit and relaunch.
5. Realtime messages, `relay://invite?invite=…`, and huddle mic/camera prompts should work.

## Repo

```
apps/api       Hono, Better Auth, Drizzle, Files SDK, /ws
apps/desktop   Electron app, bundled renderer, native notifications and screen sharing
apps/landing   Public download landing page
apps/mobile    Expo
packages/shared  Shared types
neon.ts          Neon Object Storage policy
```
