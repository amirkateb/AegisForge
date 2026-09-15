import {
  CodeIndexSchema,
  type CodeIndex,
} from "../../packages/contracts/src/index.js";
import type { ProjectReader } from "./project-analyzer.js";

const SOURCE = /\.(?:[cm]?[jt]sx?|php|py|go|rs)$/i;
const IGNORED = /(^|\/)(?:node_modules|vendor|\.git|dist|build|coverage|storage\/logs)(\/|$)/;

export async function analyzeCode(reader: ProjectReader): Promise<CodeIndex> {
  const paths = (await reader.list(8))
    .filter((file) => SOURCE.test(file) && !IGNORED.test(file))
    .slice(0, 5000);
  const symbols: CodeIndex["symbols"] = [];
  const relations: CodeIndex["relations"] = [];
  const routes: CodeIndex["routes"] = [];
  const databaseEntities: CodeIndex["databaseEntities"] = [];

  for (const source of paths) {
    const body = await reader.read(source, 2 * 1024 * 1024);
    if (!body) continue;
    const lines = body.split("\n");
    for (const [index, line] of lines.entries()) {
      for (const match of line.matchAll(/\b(class|interface|function)\s+([A-Za-z_$][\w$]*)/g))
        symbols.push({ name: match[2]!, kind: match[1] as "class" | "interface" | "function", path: source, line: index + 1 });
      for (const match of line.matchAll(/\b(?:public|protected|private)?\s*(?:async\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?:\{|:)/g)) {
        const name = match[1]!;
        if (!["if", "for", "while", "switch", "catch", "function"].includes(name))
          symbols.push({ name, kind: "method", path: source, line: index + 1 });
      }
    }
    for (const match of body.matchAll(/(?:import[\s\S]*?from\s*|require\s*\(|use\s+)(?:['"])?([^'";\n)]+)/g))
      relations.push({ from: source, to: match[1]!.trim().replaceAll("\\", "/"), type: "imports" });
    for (const match of body.matchAll(/\bextends\s+([A-Za-z_$][\w$]*)/g))
      relations.push({ from: source, to: match[1]!, type: "extends" });
    for (const symbol of symbols.filter((item) => item.path !== source)) {
      if (new RegExp(`\\b${escapeRegExp(symbol.name)}\\b`).test(body))
        relations.push({ from: source, to: symbol.path, type: "uses" });
    }
    for (const match of body.matchAll(/Route::(get|post|put|patch|delete|options|any)\s*\(\s*['"]([^'"]+)['"]\s*,?\s*([^;\n]*)/gi))
      routes.push({ method: match[1]!.toUpperCase(), path: match[2]!, handler: match[3]?.trim() || null, source });
    for (const match of body.matchAll(/\b(?:app|router)\.(get|post|put|patch|delete|options)\s*\(\s*['"]([^'"]+)['"]/gi))
      routes.push({ method: match[1]!.toUpperCase(), path: match[2]!, handler: null, source });
    for (const match of body.matchAll(/Schema::(?:create|table)\s*\(\s*['"]([^'"]+)['"]/g))
      databaseEntities.push({ name: match[1]!, kind: "table", source });
    if (/(^|\/)Models?\//i.test(source)) {
      for (const symbol of symbols.filter((item) => item.path === source && item.kind === "class"))
        databaseEntities.push({ name: symbol.name, kind: "model", source });
    }
  }
  // A second pass connects symbol references regardless of file traversal order.
  for (const source of paths) {
    const body = await reader.read(source, 2 * 1024 * 1024);
    if (!body) continue;
    for (const symbol of symbols) {
      if (symbol.path !== source && new RegExp(`\\b${escapeRegExp(symbol.name)}\\b`).test(body))
        relations.push({ from: source, to: symbol.path, type: "uses" });
    }
  }
  return CodeIndexSchema.parse({
    version: 1,
    generatedAt: new Date().toISOString(),
    filesIndexed: paths.length,
    symbols: unique(symbols, (item) => `${item.path}:${item.line}:${item.kind}:${item.name}`).slice(0, 20_000),
    relations: unique(relations, (item) => `${item.from}:${item.to}:${item.type}`).slice(0, 40_000),
    routes: unique(routes, (item) => `${item.source}:${item.method}:${item.path}`).slice(0, 5000),
    databaseEntities: unique(databaseEntities, (item) => `${item.source}:${item.kind}:${item.name}`).slice(0, 5000),
  });
}

export function findAffectedCode(index: CodeIndex, query: string) {
  const needle = query.toLowerCase();
  const seedFiles = new Set(index.symbols.filter((item) => item.name.toLowerCase() === needle || item.path.toLowerCase().includes(needle)).map((item) => item.path));
  for (const entity of index.databaseEntities)
    if (entity.name.toLowerCase().includes(needle)) seedFiles.add(entity.source);
  const files = new Set(seedFiles);
  let changed = true;
  while (changed) {
    changed = false;
    for (const relation of index.relations) {
      const targetMatches = files.has(relation.to) || relation.to.toLowerCase().includes(needle);
      if (targetMatches && !files.has(relation.from)) { files.add(relation.from); changed = true; }
    }
  }
  for (const route of index.routes)
    if (files.has(route.source) || route.handler?.toLowerCase().includes(needle)) files.add(route.source);
  return {
    query,
    files: [...files].sort(),
    symbols: index.symbols.filter((item) => files.has(item.path)),
    routes: index.routes.filter((item) => files.has(item.source)),
  };
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [key(item), item])).values()];
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
