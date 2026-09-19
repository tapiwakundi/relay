# Relay

Slack-shaped workspace chat: channels, DMs, threads, huddles, desktop, and mobile.

**Not affiliated with Slack.** Layout and interaction are modeled on Slack; brand marks, logos, and assets are original.

## Stack

- **Web:** Vite + React (pixel-close Slack UI)
- **API:** Hono + TypeScript + WebSockets on Render
- **Auth:** Neon Auth (Managed Better Auth — email/password + Google)
- **DB:** Neon Postgres (local fallback: PGlite if `DATABASE_URL` is empty)
- **Files:** Neon Object Storage (`relay-storage`, private bucket)
- **Desktop:** Electron (Windows + macOS)
- **Mobile:** Expo + push token registration
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

Copy `NEON_AUTH_BASE_URL` from `.env` into `VITE_NEON_AUTH_URL` (Vite does not pick up the Neon name automatically).

Open [http://localhost:5173](http://localhost:5173) and create a real account with email/password, or sign in with Google (Neon’s shared development OAuth until you add your own Google app). The first account creates an empty workspace; later accounts join it.

Desktop (web + API already running):

```bash
pnpm dev:desktop
```

Mobile (API reachable from the device/simulator):

```bash
cd apps/mobile
EXPO_PUBLIC_API_URL=http://localhost:3001 pnpm start
```

## Environment

Filled by `neon link` / `neon deploy` / `neon env pull`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled URL. Empty = local PGlite in `apps/api/data` |
| `DATABASE_URL_UNPOOLED` | Direct URL for Drizzle push/migrate |
| `NEON_AUTH_BASE_URL` / `NEON_AUTH_JWKS_URL` | Managed Auth endpoint + JWT keys |
| `VITE_NEON_AUTH_URL` | Same as `NEON_AUTH_BASE_URL` for the Vite client |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_ENDPOINT_URL_S3` / `AWS_REGION` | Object Storage (`relay-storage`) |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Huddle media (optional) |

Google OAuth callback on Neon Auth: `{NEON_AUTH_BASE_URL}/callback/google`.

## Production (Render)

One always-on **Node** web service. Point `DATABASE_URL` at Neon’s pooled URL and set the Auth + storage variables from `neon env pull`. Do not use a sleeping instance — WebSockets will die.

Set `WEB_ORIGIN` to the Render URL (or custom domain). Serve the web build from the same origin later, or keep Vite/static on the same service.

## Repo

```
apps/api       Hono, Neon JWT auth, Drizzle, Files SDK, /ws
apps/web       Slack-style client (`@neondatabase/auth`)
apps/desktop   Electron shell
apps/mobile    Expo
packages/shared  Shared types
neon.ts          Neon Auth + Object Storage policy
```
