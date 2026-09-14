import fs from "node:fs/promises";
import path from "node:path";

export class WorkspaceGuard {
  private constructor(private readonly canonicalRoot: string) {}

  static async create(root: string): Promise<WorkspaceGuard> {
    if (!path.isAbsolute(root))
      throw new Error("Workspace root must be absolute");
    return new WorkspaceGuard(await fs.realpath(root));
  }

  async resolve(relativePath: string): Promise<string> {
    if (path.isAbsolute(relativePath))
      throw new Error("Absolute paths are outside workspace policy");
    const candidate = path.resolve(this.canonicalRoot, relativePath);
    this.assertContained(candidate);

    const nearest = await this.resolveNearestExisting(candidate);
    this.assertContained(nearest);
    return candidate;
  }

  private assertContained(candidate: string): void {
    const relative = path.relative(this.canonicalRoot, candidate);
    if (
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new Error("Resolved path is outside workspace");
    }
  }

  private async resolveNearestExisting(candidate: string): Promise<string> {
    let current = candidate;
    const suffix: string[] = [];
    while (true) {
      try {
        const real = await fs.realpath(current);
        return path.join(real, ...suffix);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
        const parent = path.dirname(current);
        if (parent === current)
          throw new Error("No existing parent for workspace path");
        suffix.unshift(path.basename(current));
        current = parent;
      }
    }
  }
}
