import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import type { AgentInventory } from "../../packages/contracts/src/index.js";

const run = promisify(execFile);
async function version(
  command: string,
  args = ["--version"],
): Promise<string | null> {
  try {
    return (
      (await run(command, args, { timeout: 3000, maxBuffer: 64 * 1024 })).stdout
        .trim()
        .split("\n")[0] ?? null
    );
  } catch {
    return null;
  }
}

export async function collectInventory(): Promise<AgentInventory> {
  const cpus = os.cpus();
  const [node, php, python, docker, mysql, postgres, redis] = await Promise.all(
    [
      version("node"),
      version("php"),
      version("python3"),
      version("docker"),
      version("mysql"),
      version("psql"),
      version("redis-cli"),
    ],
  );
  const network = Object.entries(os.networkInterfaces()).flatMap(
    ([name, addresses]) =>
      (addresses ?? []).map((address) => ({
        name,
        address: address.address,
        family: address.family,
        isInternal: address.internal,
      })),
  );
  const disks = await collectDisks();
  return {
    agentVersion: process.env.AEGIS_AGENT_VERSION ?? "0.1.0",
    os: {
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
      hostname: os.hostname(),
    },
    cpu: {
      model: cpus[0]?.model ?? "unknown",
      cores: Math.max(1, cpus.length),
      loadPercent: Math.min(
        100,
        Math.round(((os.loadavg()[0] ?? 0) / Math.max(1, cpus.length)) * 100),
      ),
    },
    memory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
    disks,
    network,
    runtimes: { node, php, python },
    docker: {
      isInstalled: docker !== null,
      isRunning:
        docker !== null &&
        (await version("docker", [
          "info",
          "--format",
          "{{.ServerVersion}}",
        ])) !== null,
      version: docker,
    },
    databaseTools: [
      ["mysql", mysql],
      ["postgresql", postgres],
      ["redis", redis],
    ]
      .filter((entry) => entry[1] !== null)
      .map((entry) => entry[0]!),
    collectedAt: new Date().toISOString(),
    health: {
      score: calculateHealthScore({
        cpuPercent: Math.min(100, Math.round(((os.loadavg()[0] ?? 0) / Math.max(1, cpus.length)) * 100)),
        memoryFreePercent: os.totalmem() ? (os.freemem() / os.totalmem()) * 100 : 0,
        diskFreePercent: disks[0]?.totalBytes ? (disks[0].freeBytes / disks[0].totalBytes) * 100 : 100,
        latencyMs: null,
      }),
      latencyMs: null,
      lastHeartbeatAt: new Date().toISOString(),
    },
  };
}

export function calculateHealthScore(input: { cpuPercent: number; memoryFreePercent: number; diskFreePercent: number; latencyMs: number | null }): number {
  const cpuScore = 100 - Math.min(100, Math.max(0, input.cpuPercent));
  const memoryScore = Math.min(100, Math.max(0, input.memoryFreePercent));
  const diskScore = Math.min(100, Math.max(0, input.diskFreePercent));
  const latencyScore = input.latencyMs == null ? 100 : Math.max(0, 100 - input.latencyMs / 10);
  return Math.round(cpuScore * 0.35 + memoryScore * 0.3 + diskScore * 0.25 + latencyScore * 0.1);
}

async function collectDisks(): Promise<AgentInventory["disks"]> {
  if (process.platform === "win32") return [];
  try {
    const { stdout } = await run("df", ["-Pk"]);
    return stdout
      .trim()
      .split("\n")
      .slice(1)
      .flatMap((line) => {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 6) return [];
        const totalBytes = Number(fields[1]) * 1024;
        const freeBytes = Number(fields[3]) * 1024;
        if (!Number.isFinite(totalBytes) || !Number.isFinite(freeBytes))
          return [];
        return [{ mount: fields.slice(5).join(" "), totalBytes, freeBytes }];
      });
  } catch {
    try {
      const stat = await fs.statfs("/");
      return [
        {
          mount: "/",
          totalBytes: stat.blocks * stat.bsize,
          freeBytes: stat.bavail * stat.bsize,
        },
      ];
    } catch {
      return [];
    }
  }
}
