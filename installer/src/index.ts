#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import dns from "node:dns/promises";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Command } from "commander";
import { InstallTransaction } from "./transaction.js";
import { run, exists } from "./command.js";
import { ask, fail, progress } from "./ui.js";
import { agentService, masterService, nginx } from "./templates.js";

type InstallType = "master" | "agent" | "both";
type Enrollment = { agent: { id: string }; token: string };
const program = new Command()
  .name("aegisforge-install")
  .option("--type <type>", "master, agent, or both")
  .option("--prefix <path>", "installation directory", "/opt/aegisforge")
  .option("--domain <name>")
  .option("--email <address>")
  .option("--database-url <url>")
  .option("--master-url <url>")
  .option("--enrollment-key <key>")
  .option("--agent-name <name>")
  .option("--environment <name>", "production, development, testing")
  .option("--workspace <path...>")
  .option("--project-name <name>")
  .option("--dry-run")
  .option("--uninstall")
  .parse();
const options = program.opts();
const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const marker = ".aegisforge-install";
const secret = () => randomBytes(32).toString("base64url");
const safeValue = (name: string, value: string) => {
  if (/[\r\n\0]/.test(value))
    throw new Error(`${name} contains an invalid control character`);
  return value;
};
const writeSecure = async (file: string, content: string) => {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, content, { mode: 0o600, flag: "wx" });
};

function validatePrefix(raw: string): string {
  const prefix = path.resolve(raw);
  if (
    ["/", "/opt", "/usr", "/var", "/home", "/root"].includes(prefix) ||
    path.basename(prefix) !== "aegisforge"
  )
    throw new Error(
      "Install prefix must be a dedicated directory named aegisforge",
    );
  return prefix;
}

async function uninstall(prefix: string): Promise<void> {
  try {
    await fs.access(path.join(prefix, marker));
  } catch {
    throw new Error(
      `Refusing uninstall: ${prefix} is not a verified AegisForge installation`,
    );
  }
  for (const name of ["aegisforge-master", "aegisforge-agent"])
    await run("systemctl", ["disable", "--now", `${name}.service`]).catch(
      () => undefined,
    );
  await fs.rm("/etc/systemd/system/aegisforge-master.service", { force: true });
  await fs.rm("/etc/systemd/system/aegisforge-agent.service", { force: true });
  await fs.rm("/etc/nginx/sites-enabled/aegisforge", { force: true });
  await fs.rm("/etc/nginx/sites-available/aegisforge", { force: true });
  await fs.rm("/etc/aegisforge", { recursive: true, force: true });
  await fs.rm(prefix, { recursive: true, force: true });
  await run("systemctl", ["daemon-reload"]);
  console.error(
    "AegisForge removed. PostgreSQL data and TLS certificates were retained for recovery.",
  );
}

async function ensureServiceUser(dryRun: boolean): Promise<void> {
  if (dryRun) return;
  if (
    await run("id", ["-u", "aegisforge"])
      .then(() => true)
      .catch(() => false)
  )
    return;
  await run("useradd", [
    "--system",
    "--home",
    "/var/lib/aegisforge",
    "--create-home",
    "--shell",
    "/usr/sbin/nologin",
    "aegisforge",
  ]);
}

async function ensureTlsDependencies(dryRun: boolean): Promise<void> {
  if ((await exists("nginx")) && (await exists("certbot"))) return;
  if (!(await exists("apt-get")))
    throw new Error(
      "Automatic TLS requires nginx and certbot (apt-get was not found)",
    );
  if (dryRun) return;
  await run("apt-get", ["update"]);
  await run("apt-get", [
    "install",
    "-y",
    "nginx",
    "certbot",
    "python3-certbot-nginx",
  ]);
}

async function verifyDns(domain: string): Promise<void> {
  const records = await Promise.allSettled([
    dns.resolve4(domain),
    dns.resolve6(domain),
  ]);
  const addresses = records.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (!addresses.length)
    throw new Error(`DNS check failed: ${domain} has no A or AAAA record`);
  console.error(`DNS resolved ${domain} to ${addresses.join(", ")}`);
}

async function main() {
  const prefix = validatePrefix(options.prefix as string);
  if (options.uninstall) {
    await uninstall(prefix);
    return;
  }
  const rawType =
    (options.type as string | undefined) ??
    (await ask("Install type (master/agent/both)", "both"));
  if (!["master", "agent", "both"].includes(rawType))
    throw new Error("Install type must be master, agent, or both");
  const type = rawType as InstallType;
  const dryRun = Boolean(options.dryRun);
  if (prefix.startsWith("/opt/") && process.getuid?.() !== 0)
    throw new Error(
      "Run as root for /opt installation or use a writable dedicated aegisforge directory",
    );
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw new Error("Node.js 22 or newer is required");
  await ensureServiceUser(dryRun);
  const transaction = new InstallTransaction(progress);
  const serviceFiles: string[] = [];
  let enrollmentKey = options.enrollmentKey as string | undefined;
  let masterUrl = options.masterUrl as string | undefined;
  let masterEnvironment: NodeJS.ProcessEnv | undefined;
  transaction.add({
    name: "Copy application files",
    apply: async () => {
      if (dryRun) return;
      await fs
        .access(prefix)
        .then(() => {
          throw new Error(
            `${prefix} already exists; uninstall or choose a new prefix`,
          );
        })
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      await fs.cp(sourceRoot, prefix, {
        recursive: true,
        filter: (entry) =>
          !entry.includes(`${path.sep}node_modules`) &&
          !entry.includes(`${path.sep}.git`),
      });
      await fs.writeFile(path.join(prefix, marker), "AegisForge\n", {
        mode: 0o600,
      });
    },
    rollback: async () => {
      if (!dryRun) await fs.rm(prefix, { recursive: true, force: true });
    },
  });
  transaction.add({
    name: "Install locked dependencies and build",
    apply: async () => {
      if (dryRun) return;
      await run("npm", ["ci", "--ignore-scripts"], prefix);
      await run("npm", ["run", "build"], prefix);
    },
    rollback: async () => undefined,
  });
  if (type === "master" || type === "both") {
    const databaseUrl = safeValue(
      "DATABASE_URL",
      (options.databaseUrl as string | undefined) ??
        (await ask("PostgreSQL DATABASE_URL")),
    );
    if (!databaseUrl) throw new Error("DATABASE_URL is required for Master");
    const domain = safeValue(
      "domain",
      (options.domain as string | undefined) ??
        (await ask("Public domain (leave empty for local-only)")),
    );
    if (
      domain &&
      !/^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(
        domain,
      )
    )
      throw new Error("Domain must be a valid DNS hostname");
    if (type === "both" && !domain && !masterUrl)
      throw new Error(
        "Both mode requires --domain or an explicit HTTPS --master-url",
      );
    const masterApiKey = secret();
    const mcpKey = secret();
    enrollmentKey = enrollmentKey ?? secret();
    const sessionSecret = secret();
    masterEnvironment = {
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: "8787",
      DATABASE_URL: databaseUrl,
      MASTER_API_KEY: masterApiKey,
      MCP_KEY: mcpKey,
      AGENT_ENROLLMENT_KEY: enrollmentKey,
      DASHBOARD_SESSION_SECRET: sessionSecret,
      ALLOWED_ORIGINS: domain ? `https://${domain}` : "",
    };
    const env =
      Object.entries(masterEnvironment)
        .map(([key, value]) => `${key}=${safeValue(key, String(value))}`)
        .join("\n") + "\n";
    transaction.add({
      name: "Create Master configuration",
      apply: async () => {
        if (!dryRun) await writeSecure("/etc/aegisforge/master.env", env);
      },
      rollback: async () => {
        await fs.rm("/etc/aegisforge/master.env", { force: true });
      },
    });
    transaction.add({
      name: "Run database migrations",
      apply: async () => {
        if (!dryRun)
          await run(
            "npm",
            ["run", "migrate", "-w", "@aegisforge/server"],
            prefix,
            masterEnvironment,
          );
      },
      rollback: async () => undefined,
    });
    transaction.add({
      name: "Install Master systemd service",
      apply: async () => {
        if (dryRun) return;
        await fs.mkdir("/var/lib/aegisforge", { recursive: true });
        await run("chown", ["aegisforge:aegisforge", "/var/lib/aegisforge"]);
        const file = "/etc/systemd/system/aegisforge-master.service";
        await fs.writeFile(file, masterService(prefix));
        serviceFiles.push(file);
        await run("systemctl", ["daemon-reload"]);
        await run("systemctl", [
          "enable",
          "--now",
          "aegisforge-master.service",
        ]);
      },
      rollback: async () => {
        await run("systemctl", [
          "disable",
          "--now",
          "aegisforge-master.service",
        ]).catch(() => undefined);
        await Promise.all(
          serviceFiles.map((file) => fs.rm(file, { force: true })),
        );
      },
    });
    if (domain) {
      const email = safeValue(
        "email",
        (options.email as string | undefined) ??
          (await ask("Email for Let's Encrypt notices")),
      );
      if (!/^\S+@\S+\.\S+$/.test(email))
        throw new Error("A valid email is required for TLS");
      await verifyDns(domain);
      await ensureTlsDependencies(dryRun);
      transaction.add({
        name: "Configure Nginx reverse proxy",
        apply: async () => {
          if (dryRun) return;
          const file = "/etc/nginx/sites-available/aegisforge";
          await fs.writeFile(file, nginx(domain));
          await fs
            .symlink(file, "/etc/nginx/sites-enabled/aegisforge")
            .catch((error: NodeJS.ErrnoException) => {
              if (error.code !== "EEXIST") throw error;
            });
          await run("nginx", ["-t"]);
          await run("systemctl", ["reload", "nginx"]);
        },
        rollback: async () => {
          await fs.rm("/etc/nginx/sites-enabled/aegisforge", { force: true });
          await fs.rm("/etc/nginx/sites-available/aegisforge", { force: true });
        },
      });
      transaction.add({
        name: "Provision Let's Encrypt certificate",
        apply: async () => {
          if (!dryRun)
            await run("certbot", [
              "--nginx",
              "--non-interactive",
              "--agree-tos",
              "--email",
              email,
              "-d",
              domain,
              "--redirect",
            ]);
        },
        rollback: async () => undefined,
      });
      masterUrl = masterUrl ?? `https://${domain}`;
    }
  }
  if (type === "agent" || type === "both") {
    masterUrl = safeValue(
      "Master URL",
      masterUrl ?? (await ask("Master HTTPS URL")),
    );
    enrollmentKey = safeValue(
      "enrollment key",
      enrollmentKey ?? (await ask("Agent enrollment key")),
    );
    if (!masterUrl.startsWith("https://"))
      throw new Error("Master URL must use HTTPS");
    const name = safeValue(
      "Agent name",
      (options.agentName as string | undefined) ??
        (await ask("Agent name", `agent-${process.platform}`)),
    );
    const environment = (
      (options.environment as string | undefined) ??
      (await ask("Environment (production/development/testing)", "development"))
    ).toUpperCase();
    if (!["PRODUCTION", "DEVELOPMENT", "TESTING"].includes(environment))
      throw new Error("Invalid Agent environment");
    let enrollment: Enrollment = {
      agent: { id: "00000000-0000-4000-8000-000000000000" },
      token: "dry-run-agent-token-0000000000000000",
    };
    if (!dryRun) {
      const response = await fetch(
        `${masterUrl.replace(/\/$/, "")}/v1/agents/enroll`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${enrollmentKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ name, environment, permissionLevel: 2 }),
        },
      );
      if (!response.ok)
        throw new Error(`Agent enrollment failed with HTTP ${response.status}`);
      enrollment = (await response.json()) as Enrollment;
    }
    const roots: Record<string, string> = {};
    for (const root of (options.workspace as string[] | undefined) ?? []) {
      const resolved = safeValue("workspace path", path.resolve(root));
      const projectName = safeValue(
        "project name",
        (options.projectName as string | undefined) ?? path.basename(resolved),
      );
      if (dryRun) {
        roots[`dry-run-${Object.keys(roots).length}`] = resolved;
        continue;
      }
      const response = await fetch(
        `${masterUrl.replace(/\/$/, "")}/v1/agent/workspaces`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${enrollment.token}`,
            "x-agent-id": enrollment.agent.id,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            projectName,
            rootPath: resolved,
            repositoryUrl: null,
          }),
        },
      );
      if (!response.ok)
        throw new Error(
          `Workspace registration failed with HTTP ${response.status}`,
        );
      const body = (await response.json()) as { workspace: { id: string } };
      roots[body.workspace.id] = resolved;
    }
    const env = `MASTER_WS_URL=${masterUrl.replace(/^https:/, "wss:").replace(/\/$/, "")}/v1/agent/connect\nAGENT_ID=${enrollment.agent.id}\nAGENT_TOKEN=${enrollment.token}\nWORKSPACE_ROOTS_JSON=${JSON.stringify(roots)}\n`;
    transaction.add({
      name: "Create Agent configuration",
      apply: async () => {
        if (!dryRun) await writeSecure("/etc/aegisforge/agent.env", env);
      },
      rollback: async () => {
        await fs.rm("/etc/aegisforge/agent.env", { force: true });
      },
    });
    transaction.add({
      name: "Install Agent systemd service",
      apply: async () => {
        if (dryRun) return;
        const file = "/etc/systemd/system/aegisforge-agent.service";
        await fs.writeFile(file, agentService(prefix, Object.values(roots)));
        serviceFiles.push(file);
        await run("systemctl", ["daemon-reload"]);
        await run("systemctl", ["enable", "--now", "aegisforge-agent.service"]);
      },
      rollback: async () => {
        await run("systemctl", [
          "disable",
          "--now",
          "aegisforge-agent.service",
        ]).catch(() => undefined);
      },
    });
  }
  if (type === "master" || type === "both")
    transaction.add({
      name: "Verify Master health",
      apply: async () => {
        if (dryRun) return;
        const response = await fetch("http://127.0.0.1:8787/healthz");
        if (!response.ok)
          throw new Error(`Health check failed with HTTP ${response.status}`);
      },
      rollback: async () => undefined,
    });
  await transaction.run();
  console.error(
    "AegisForge installation completed successfully. Store credentials from /etc/aegisforge/master.env in your secrets manager.",
  );
}
main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
