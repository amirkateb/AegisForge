import { buildServer } from "./app.js";
import { loadConfig } from "./config.js";
import { createPgStore } from "./persistence/pg-store.js";
import { OpenAIPlanningModel } from "@aegisforge/controller";

const config = loadConfig();
const store = createPgStore(config.DATABASE_URL);
const app = await buildServer({
  store,
  secrets: {
    masterApiKey: config.MASTER_API_KEY,
    mcpKey: config.MCP_KEY,
    enrollmentKey: config.AGENT_ENROLLMENT_KEY,
    sessionSecret: config.DASHBOARD_SESSION_SECRET,
  },
  allowedOrigins: config.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  ...(config.OPENAI_API_KEY
    ? { planningModel: new OpenAIPlanningModel(config.OPENAI_API_KEY, config.OPENAI_MODEL) }
    : {}),
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "shutting down");
  await app.close();
  await store.close();
};
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(
    signal,
    () => void shutdown(signal).finally(() => process.exit(0)),
  );
await app.listen({ host: config.HOST, port: config.PORT });
