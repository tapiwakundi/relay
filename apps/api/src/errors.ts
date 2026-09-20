import type { Context } from "hono";
import { HttpError } from "./access.js";

export type AuthedEnv = {
  Variables: {
    userId: string;
    userName: string;
    userImage: string | null;
  };
};

export function isUniqueViolation(err: unknown) {
  const rec = err as { code?: string; cause?: { code?: string } } | null;
  return rec?.code === "23505" || rec?.cause?.code === "23505";
}

export function jsonError(c: Context, err: unknown) {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "server error" }, 500);
}

export function routeParam(c: Context, name: string) {
  const value = c.req.param(name);
  if (!value) throw new HttpError(400, "Missing id");
  return value;
}

export function handle(fn: (c: Context<AuthedEnv>) => Promise<Response> | Response) {
  return async (c: Context<AuthedEnv>) => {
    try {
      return await fn(c);
    } catch (err) {
      return jsonError(c, err);
    }
  };
}
