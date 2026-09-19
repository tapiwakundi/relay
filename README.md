# Relay

Slack-shaped workspace chat: channels, DMs, threads, huddles, desktop, and mobile.

**Not affiliated with Slack.** Layout and interaction are modeled on Slack; brand marks, logos, and assets are original.

## Stack

- **API:** Hono + TypeScript + WebSockets on Render
- **Auth:** Better Auth on the API (email/password + system-browser Google for desktop)
- **DB:** Neon Postgres (local fallback: PGlite if `DATABASE_URL` is empty)
- **Files:** Neon Object Storage (`relay-storage`, private bucket)
- **Desktop:** Electron (`com.endurancelabs.relaydesktop`) with a bundled React renderer, native notifications, and screen sharing
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
pnpm --filter @relay/api db:push
pnpm dev
```

Create a Google Cloud **Web application** OAuth client and put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`. Add this authorized redirect URI:

- `http://localhost:3001/api/auth/callback/google`

`pnpm dev` starts the API and the desktop app. The first account creates an empty workspace; later accounts join it. Google sign-in opens the system browser and returns to the app through `com.endurancelabs.relaydesktop://auth/callback`.

Desktop alone (API already running):

```bash
pnpm dev:desktop
```

Package a local macOS app:

```bash
pnpm --filter @relay/desktop dist
```

The first time you join a huddle, macOS asks for the microphone and camera. Screen sharing asks for screen recording. Invite links use `relay://invite?invite=…`, which both the desktop app and the mobile app can open.

Mobile (API reachable from the device). `setup:env` writes your LAN IP:

```bash
pnpm dev:mobile          # physical iPhone
pnpm dev:mobile:sim      # Device Hub / simulator
```

## Environment

Filled by `neon link` / `neon deploy` / `neon env pull`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled URL. Empty = local PGlite in `apps/api/data` |
| `DATABASE_URL_UNPOOLED` | Direct URL for Drizzle push/migrate |
| `BETTER_AUTH_SECRET` | Session signing secret (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | Public API origin (`http://localhost:3001` in dev) |
| `RELAY_API_URL` | Optional desktop API origin override |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Your Google Web OAuth client |
| `AUTH_ALLOWED_HOSTS` | Extra Host values for OAuth (include port) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_ENDPOINT_URL_S3` / `AWS_REGION` | Object Storage (`relay-storage`) |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Huddle media (optional) |

Google redirect URI is `{BETTER_AUTH_URL}/api/auth/callback/google`. Desktop OAuth returns through the `com.endurancelabs.relaydesktop` URL scheme; mobile continues to use the API on port `3001`.

## Production (Render)

One always-on **Node** web service for the API. Point `DATABASE_URL` at Neon’s pooled URL and set Better Auth + Google + storage variables. Do not use a sleeping instance — WebSockets will die. Set `BETTER_AUTH_URL` to the Render URL, and add that URL’s `/api/auth/callback/google` path in Google Cloud. The desktop app is packaged separately and talks to this API; it is not served by Render.

## Repo

```
apps/api       Hono, Better Auth, Drizzle, Files SDK, /ws
apps/desktop   Electron app, bundled renderer, native notifications and screen sharing
apps/mobile    Expo
packages/shared  Shared types
neon.ts          Neon Object Storage policy
```
