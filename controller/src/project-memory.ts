import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface FilesystemContext {
  architecture: unknown;
  dependencies: unknown;
  environment: unknown;
  database: unknown;
  routes: unknown;
  decisions: string;
  knownIssues: string;
  history: unknown;
}

const files = {
  architecture: "architecture.json",
  dependencies: "dependencies.json",
  environment: "environment.json",
  database: "database.json",
  routes: "routes.json",
  decisions: "decisions.md",
  knownIssues: "known-issues.md",
  history: "history.json",
} as const;

export class FilesystemProjectMemory {
  constructor(private readonly root: string) {}

  async save(projectId: string, context: FilesystemContext): Promise<void> {
    const directory = this.directory(projectId);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    for (const [key, name] of Object.entries(files) as Array<[keyof FilesystemContext, string]>) {
      const value = key === "decisions" || key === "knownIssues"
        ? String(context[key]).trimEnd() + "\n"
        : JSON.stringify(context[key], null, 2) + "\n";
      await atomicWrite(path.join(directory, name), value);
    }
  }

  async load(projectId: string): Promise<FilesystemContext> {
    const directory = this.directory(projectId);
    const read = async (key: keyof FilesystemContext) => fs.readFile(path.join(directory, files[key]), "utf8");
    const [architecture, dependencies, environment, database, routes, decisions, knownIssues, history] = await Promise.all([
      read("architecture"), read("dependencies"), read("environment"), read("database"), read("routes"), read("decisions"), read("knownIssues"), read("history"),
    ]);
    return {
      architecture: JSON.parse(architecture),
      dependencies: JSON.parse(dependencies),
      environment: JSON.parse(environment),
      database: JSON.parse(database),
      routes: JSON.parse(routes),
      decisions,
      knownIssues,
      history: JSON.parse(history),
    };
  }

  private directory(projectId: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(projectId))
      throw new Error("Invalid project memory identifier");
    return path.join(this.root, "projects", projectId, "context");
  }
}

async function atomicWrite(target: string, content: string): Promise<void> {
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await fs.rename(temporary, target);
}
