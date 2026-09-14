const secretKey =
  /(?:password|passwd|secret|token|authorization|api[_-]?key|private[_-]?key|cookie)/i;
const bearer = /Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi;
const credential =
  /((?:password|secret|token|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi;

function redactString(value: string): string {
  return value
    .replace(bearer, "Bearer [REDACTED]")
    .replace(credential, "$1[REDACTED]");
}

export function redactEvent(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactEvent(item, seen));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      secretKey.test(key) ? "[REDACTED]" : redactEvent(item, seen),
    ]),
  );
}
