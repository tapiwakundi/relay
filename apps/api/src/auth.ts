import type { Auth } from "./better-auth.js";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export async function getAuthUser(auth: Auth, headers: Headers): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };
}
