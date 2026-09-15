import {
  EngineeringPlanSchema,
  type EngineeringPlan,
} from "@aegisforge/contracts";

export function createDeploymentPlan(input: {
  environment: "PRODUCTION" | "DEVELOPMENT" | "TESTING";
  branch: string;
  service: string;
  healthUrl: string;
  packageManager: "npm" | "composer";
  runMigrations: boolean;
}): EngineeringPlan {
  const steps: EngineeringPlan["steps"] = [
    step("Inspect repository", "Inspect the current branch and uncommitted changes before deployment", "developer.git", { action: "status", args: ["--short", "--branch"] }, "Repository state is understood and safe to update"),
    step("Update source", `Pull reviewed ${input.branch} source`, "developer.git", { action: "pull", args: ["--ff-only", "origin", input.branch] }, `HEAD is on the expected ${input.branch} revision`),
    input.packageManager === "npm"
      ? step("Install dependencies", "Install locked production dependencies", "developer.node", { action: "ci", args: ["--ignore-scripts"] }, "Dependency installation exits successfully")
      : step("Install dependencies", "Install locked Composer dependencies", "developer.composer", { action: "install", args: ["--no-interaction", "--no-dev", "--prefer-dist"] }, "Dependency installation exits successfully"),
  ];
  if (input.runMigrations)
    steps.push(step("Run database migrations", "Apply application migrations as an explicit sensitive stage", "developer.laravel", { action: "artisan", args: ["migrate", "--force"] }, "Migration command succeeds and schema state is current"));
  steps.push(
    input.packageManager === "npm"
      ? step("Build application", "Create the production build", "developer.node", { action: "run", args: ["build"] }, "Build artifacts are produced without errors")
      : step("Build application", "Warm framework caches", "developer.laravel", { action: "artisan", args: ["optimize"] }, "Framework caches are built"),
    step("Restart service", `Restart ${input.service} after successful build`, "system.service.control", { name: input.service, action: "restart" }, "Service reports active state"),
    step("Verify deployment health", `Verify ${input.healthUrl}`, "network.http", { url: input.healthUrl, method: "GET" }, "Health endpoint returns a successful response"),
  );
  return EngineeringPlanSchema.parse({
    summary: `Deploy ${input.branch} to ${input.environment} and verify service health`,
    assumptions: ["Repository has a reviewed lockfile", "Production mutation tools require human approval"],
    steps,
  });
}

export function createTlsPlan(input: {
  domain: string;
  email: string;
  webServer: "nginx" | "apache" | "traefik";
}): EngineeringPlan {
  const validation = input.webServer === "nginx"
    ? { tool: "developer.nginx", arguments: { action: "-t", args: [] } }
    : input.webServer === "apache"
      ? { tool: "developer.apache", arguments: { action: "configtest", args: [] } }
      : { tool: "developer.traefik", arguments: { action: "version", args: [] } };
  const reload = input.webServer === "nginx"
    ? { tool: "developer.nginx", arguments: { action: "-s", args: ["reload"] } }
    : input.webServer === "apache"
      ? { tool: "developer.apache", arguments: { action: "-k", args: ["graceful"] } }
      : { tool: "system.service.control", arguments: { name: "traefik", action: "reload" } };
  return EngineeringPlanSchema.parse({
    summary: `Configure renewable HTTPS for ${input.domain} on ${input.webServer}`,
    assumptions: ["DNS must resolve to the selected Agent", "Ports 80 and 443 must be reachable", "Certificate mutation requires approval"],
    steps: [
      step("Check DNS", "Resolve the requested domain before changing the server", "network.dns", { hostname: input.domain }, "DNS contains the intended public server address"),
      step("Check HTTP port", "Verify that the ACME HTTP challenge port is reachable", "network.port", { host: input.domain, port: 80 }, "TCP port 80 is reachable"),
      step("Validate web server", `Validate current ${input.webServer} configuration`, validation.tool, validation.arguments, "Existing configuration is valid"),
      step("Install certificate", "Request or renew a Let's Encrypt certificate", "developer.ssl", { action: "certonly", args: [`--${input.webServer}`, "--non-interactive", "--agree-tos", "--email", input.email, "-d", input.domain] }, "Certificate files exist and match the domain"),
      step("Configure renewal", "Install and test automatic certificate renewal", "developer.ssl", { action: "renew", args: ["--dry-run"] }, "Renewal dry-run succeeds"),
      step("Reload web server", `Reload ${input.webServer} with the certificate`, reload.tool, reload.arguments, "Web server reload succeeds"),
      step("Verify HTTPS", "Verify public HTTPS without following redirects", "network.http", { url: `https://${input.domain}`, method: "HEAD" }, "HTTPS returns a valid response"),
    ],
  });
}

function step(title: string, description: string, toolName: string, arguments_: Record<string, unknown>, verification: string) {
  return { title, description, toolName, arguments: arguments_, verification };
}
