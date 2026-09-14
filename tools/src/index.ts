import {
  ToolDefinitionSchema,
  type ToolDefinition,
} from "../../packages/contracts/src/index.js";

export interface ToolContext {
  workspaceRoot: string;
  signal: AbortSignal;
  resolvePath(path: string): Promise<string>;
}

export interface ToolPlugin {
  definition: ToolDefinition;
  execute(
    arguments_: Record<string, unknown>,
    context: ToolContext,
  ): Promise<unknown>;
}

export * from "./builtins.js";
export * from "./operations.js";
export * from "./sessions.js";

export class ToolRegistry {
  private readonly plugins = new Map<string, ToolPlugin>();

  register(plugin: ToolPlugin): void {
    const definition = ToolDefinitionSchema.parse(plugin.definition);
    if (this.plugins.has(definition.name))
      throw new Error(`Tool already registered: ${definition.name}`);
    this.plugins.set(definition.name, { ...plugin, definition });
  }

  get(name: string): ToolPlugin {
    const plugin = this.plugins.get(name);
    if (!plugin) throw new Error(`Unknown tool: ${name}`);
    return plugin;
  }

  list(): ToolDefinition[] {
    return [...this.plugins.values()].map((plugin) => plugin.definition);
  }
}
