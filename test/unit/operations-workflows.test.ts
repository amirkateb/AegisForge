import { describe, expect, it } from "vitest";
import { createDeploymentPlan, createTlsPlan } from "../../tools/src/workflows.js";

describe("operational workflows", () => {
  it("builds a staged production deployment with approval-bound mutations and health verification", () => {
    const plan = createDeploymentPlan({
      environment: "PRODUCTION",
      branch: "main",
      service: "aegisforge",
      healthUrl: "https://forge.example.com/healthz",
      packageManager: "npm",
      runMigrations: true,
    });
    expect(plan.steps.map((step) => step.title)).toEqual([
      "Inspect repository",
      "Update source",
      "Install dependencies",
      "Run database migrations",
      "Build application",
      "Restart service",
      "Verify deployment health",
    ]);
    expect(plan.steps.at(-1)).toMatchObject({ toolName: "network.http" });
  });

  it("builds complete Nginx, Apache and Traefik TLS plans", () => {
    for (const webServer of ["nginx", "apache", "traefik"] as const) {
      const plan = createTlsPlan({ domain: "forge.example.com", email: "ops@example.com", webServer });
      expect(plan.steps[0]).toMatchObject({ toolName: "network.dns" });
      expect(plan.steps.map((step) => step.title)).toEqual(expect.arrayContaining(["Install certificate", "Configure renewal", "Verify HTTPS"]));
    }
  });
});
