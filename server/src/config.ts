import { z } from "zod";

const ConfigSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string().min(1),
  MASTER_API_KEY: z.string().min(32),
  MCP_KEY: z.string().min(32),
  AGENT_ENROLLMENT_KEY: z.string().min(32),
  DASHBOARD_SESSION_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string().default(""),
});

export type ServerConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const config = ConfigSchema.parse(env);
  const secrets = new Set([
    config.MASTER_API_KEY,
    config.MCP_KEY,
    config.AGENT_ENROLLMENT_KEY,
    config.DASHBOARD_SESSION_SECRET,
  ]);
  if (secrets.size !== 4)
    throw new Error("All authentication and session secrets must be different");
  if (
    config.NODE_ENV === "production" &&
    ["0.0.0.0", "::"].includes(config.HOST) &&
    !config.ALLOWED_ORIGINS
  ) {
    throw new Error("ALLOWED_ORIGINS is required for a public production bind");
  }
  return config;
}
