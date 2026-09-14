import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export type CredentialRole = "MASTER" | "MCP";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
export function tokenDigest(value: string): string {
  return digest(value).toString("hex");
}
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}
export function safeDigestEqual(
  value: string,
  expectedHexDigest: string,
): boolean {
  const actual = digest(value);
  const expected = Buffer.from(expectedHexDigest, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function bearer(request: FastifyRequest): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(
    request.headers.authorization?.trim() ?? "",
  );
  return match?.[1]?.trim() || null;
}

export function requireRole(
  secrets: { masterApiKey: string; mcpKey: string },
  allowed: readonly CredentialRole[],
) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const token = bearer(request);
    if (!token) {
      await reply
        .code(401)
        .send({
          error: {
            code: "UNAUTHENTICATED",
            message: "Bearer token required",
            requestId: request.id,
          },
        });
      return;
    }
    const role = safeEqual(token, secrets.masterApiKey)
      ? "MASTER"
      : safeEqual(token, secrets.mcpKey)
        ? "MCP"
        : null;
    if (!role) {
      await reply
        .code(401)
        .send({
          error: {
            code: "UNAUTHENTICATED",
            message: "Invalid credential",
            requestId: request.id,
          },
        });
      return;
    }
    if (!allowed.includes(role)) {
      await reply
        .code(403)
        .send({
          error: {
            code: "FORBIDDEN",
            message: "Credential is not authorized for this interface",
            requestId: request.id,
          },
        });
    }
  };
}
