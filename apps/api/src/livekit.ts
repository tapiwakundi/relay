import { AccessToken } from "livekit-server-sdk";

export async function mintLivekitToken(opts: {
  room: string;
  identity: string;
  name: string;
}) {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return { url: null as string | null, token: null as string | null };
  }
  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
  });
  at.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish: true,
    canSubscribe: true,
  });
  return { url, token: await at.toJwt() };
}
