# Relay

Slack-shaped workspace chat: channels, DMs, threads, huddles, desktop, and mobile.

**Not affiliated with Slack.** Layout and interaction are modeled on Slack; brand marks, logos, and assets are original.

## Stack

- **Web:** Vite + React (pixel-close Slack UI)
- **API:** Hono + TypeScript + WebSockets on Render
- **Auth:** Better Auth on the API (email/password + Google)
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

Create a Google Cloud **Web application** OAuth client and put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`. Add these authorized redirect URIs:

- `http://localhost:5173/api/auth/callback/google`
- `http://localhost:3001/api/auth/callback/google`
- `http://<your-LAN-IP>:3001/api/auth/callback/google` (phone)

Open [http://localhost:5173](http://localhost:5173) and create an account with email/password, or Google once the client IDs are set. The first account creates an empty workspace; later accounts join it.

Desktop (web + API already running):

```bash
pnpm dev:desktop
```

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
| `BETTER_AUTH_URL` | Fallback public origin (`http://localhost:5173` in dev) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Your Google Web OAuth client |
| `AUTH_ALLOWED_HOSTS` | Extra Host values for OAuth (include port) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_ENDPOINT_URL_S3` / `AWS_REGION` | Object Storage (`relay-storage`) |
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Huddle media (optional) |

Google redirect URI is `{origin}/api/auth/callback/google` — web via Vite on `:5173`, phone via the LAN API on `:3001`.

## Production (Render)

One always-on **Node** web service. Point `DATABASE_URL` at Neon’s pooled URL and set Better Auth + Google + storage variables. Do not use a sleeping instance — WebSockets will die.

Set `WEB_ORIGIN` to the Render URL (or custom domain). Serve the web build from the same origin later, or keep Vite/static on the same service.

## Repo

```
apps/api       Hono, Better Auth, Drizzle, Files SDK, /ws
apps/web       Slack-style client (`better-auth`)
apps/desktop   Electron shell
apps/mobile    Expo
packages/shared  Shared types
neon.ts          Neon Object Storage policy
```
