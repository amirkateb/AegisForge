import {
  ProjectProfileSchema,
  type ProjectProfile,
} from "../../packages/contracts/src/index.js";

export interface ProjectReader {
  list(depth: number): Promise<string[]>;
  read(path: string, maxBytes: number): Promise<string | null>;
}

export async function analyzeProject(
  reader: ProjectReader,
): Promise<ProjectProfile> {
  const files = await reader.list(4);
  const set = new Set(files);
  const probes = [
    "package.json",
    "composer.json",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
    "Cargo.toml",
    "docker-compose.yml",
    "compose.yml",
    ".env.example",
  ];
  const contents = new Map<string, string>();
  await Promise.all(
    probes
      .filter((name) => set.has(name))
      .map(async (name) => {
        const value = await reader.read(name, 512_000);
        if (value) contents.set(name, value);
      }),
  );
  const framework = new Set<string>();
  const dependencies = new Set<string>();
  const databases = new Set<string>();
  const packageJson = contents.get("package.json");
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const name of Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
      })) {
        dependencies.add(name);
        if (name === "next") framework.add("Next.js");
        if (name === "react") framework.add("React");
        if (name === "fastify") framework.add("Fastify");
        if (name.includes("postgres") || name === "pg")
          databases.add("PostgreSQL");
        if (name.includes("mysql")) databases.add("MySQL");
        if (name.includes("redis")) databases.add("Redis");
      }
    } catch {
      /* profile remains evidence-based */
    }
  }
  const composer = contents.get("composer.json");
  if (composer) {
    try {
      const pkg = JSON.parse(composer) as { require?: Record<string, string> };
      for (const name of Object.keys(pkg.require ?? {})) {
        dependencies.add(name);
        if (name === "laravel/framework") framework.add("Laravel");
        if (name.includes("wordpress")) framework.add("WordPress");
      }
    } catch {
      /* ignore malformed manifest */
    }
  }
  if (set.has("wp-config.php")) framework.add("WordPress");
  if (contents.has("pyproject.toml") || contents.has("requirements.txt"))
    framework.add("Python");
  if (contents.has("go.mod")) framework.add("Go");
  if (contents.has("Cargo.toml")) framework.add("Rust");
  const routeFiles = files
    .filter((name) =>
      /(^|\/)(routes?|app\/api|pages\/api)(\/|\.|$)/i.test(name),
    )
    .slice(0, 500);
  const architecture = files
    .filter((name) =>
      /(^|\/)(src|app|server|agent|controller|domain|infrastructure|packages)(\/|$)/.test(
        name,
      ),
    )
    .map((name) => name.split("/").slice(0, 2).join("/"))
    .filter((name, index, all) => all.indexOf(name) === index)
    .slice(0, 100);
  return ProjectProfileSchema.parse({
    framework: [...framework],
    dependencies: [...dependencies],
    databases: [...databases],
    routes: routeFiles,
    architecture,
    importantFiles: probes.filter((name) => set.has(name)),
  });
}
