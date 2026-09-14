import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
const color = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  reset: "\x1b[0m",
};
export function progress(event: {
  type: "START" | "DONE" | "ROLLBACK";
  name: string;
}) {
  const marker =
    event.type === "DONE"
      ? `${color.green}✓`
      : event.type === "ROLLBACK"
        ? `${color.yellow}↶`
        : `${color.cyan}◆`;
  console.error(`${marker}${color.reset} ${event.name}`);
}
export function fail(message: string) {
  console.error(`${color.red}Installation failed:${color.reset} ${message}`);
}
export async function ask(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question(
      `${question}${defaultValue ? ` ${color.dim}[${defaultValue}]${color.reset}` : ""}: `,
    );
    return answer.trim() || defaultValue || "";
  } finally {
    terminal.close();
  }
}
