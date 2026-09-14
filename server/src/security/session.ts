import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

const cookieName = "aegisforge_session";
function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function issueSession(secret: string, now = new Date()): string {
  const payload = Buffer.from(
    JSON.stringify({ role: "MASTER", exp: now.getTime() + 8 * 60 * 60_000 }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(
  token: string,
  secret: string,
  now = new Date(),
): boolean {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return false;
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { role?: unknown; exp?: unknown };
    return (
      decoded.role === "MASTER" &&
      typeof decoded.exp === "number" &&
      decoded.exp > now.getTime()
    );
  } catch {
    return false;
  }
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  isProduction: boolean,
): void {
  reply.header(
    "set-cookie",
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${isProduction ? "; Secure" : ""}`,
  );
}
export function clearSessionCookie(
  reply: FastifyReply,
  isProduction: boolean,
): void {
  reply.header(
    "set-cookie",
    `${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProduction ? "; Secure" : ""}`,
  );
}

export function requireSession(secret: string) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const cookies = Object.fromEntries(
      (request.headers.cookie ?? "")
        .split(";")
        .map((part) => part.trim().split("=").map(decodeURIComponent))
        .filter((pair) => pair.length === 2) as [string, string][],
    );
    if (!cookies[cookieName] || !verifySession(cookies[cookieName], secret))
      await reply
        .code(401)
        .send({
          error: {
            code: "UNAUTHENTICATED",
            message: "Dashboard session required",
            requestId: request.id,
          },
        });
  };
}
