export type FailureCategory = "DATABASE_SCHEMA" | "DEPENDENCY" | "PERMISSION" | "SYNTAX" | "NETWORK" | "RESOURCE" | "UNKNOWN";

export interface FailureDiagnosis {
  category: FailureCategory;
  summary: string;
  locations: Array<{ path: string; line: number }>;
  suggestions: string[];
}

export function diagnoseFailure(evidence: unknown): FailureDiagnosis {
  const text = sanitize(typeof evidence === "string" ? evidence : JSON.stringify(evidence));
  const lower = text.toLowerCase();
  let category: FailureCategory = "UNKNOWN";
  let suggestions = ["Inspect the nearest error context and reproduce with the smallest read-only diagnostic command"];
  if (/sqlstate|undefined table|no such table|relation .* does not exist/.test(lower)) {
    category = "DATABASE_SCHEMA";
    suggestions = ["Compare the model and migration history", "Inspect migration status before requesting approval to apply a migration"];
  } else if (/cannot find module|module not found|class .* not found|missing package/.test(lower)) {
    category = "DEPENDENCY";
    suggestions = ["Compare the lockfile and manifest", "Install locked dependencies, then rerun the failing verification"];
  } else if (/eacces|permission denied|operation not permitted/.test(lower)) {
    category = "PERMISSION";
    suggestions = ["Inspect ownership and the Agent permission boundary", "Request approval only for the narrow permission change required"];
  } else if (/syntaxerror|parse error|unexpected token/.test(lower)) {
    category = "SYNTAX";
    suggestions = ["Open the reported source location", "Apply a minimal syntax correction and rerun the focused test"];
  } else if (/econnrefused|enotfound|timed? ?out|dns/.test(lower)) {
    category = "NETWORK";
    suggestions = ["Check DNS and the target port", "Retry only after confirming whether the previous effect completed"];
  } else if (/no space left|out of memory|enomem|disk full/.test(lower)) {
    category = "RESOURCE";
    suggestions = ["Inspect disk, memory and process usage", "Free only reviewed resources before retrying"];
  }
  const locations = [...text.matchAll(/((?:[A-Za-z]:)?[\/][^\s:"']+\.[A-Za-z0-9]+):(\d+)/g)]
    .slice(0, 50)
    .map((match) => ({ path: match[1]!, line: Number(match[2]) }));
  return { category, summary: text.slice(0, 2000), locations, suggestions };
}

function sanitize(value: string): string {
  return value
    .replace(/(authorization|password|token|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[REDACTED PRIVATE MATERIAL]");
}
