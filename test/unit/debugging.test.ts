import { describe, expect, it } from "vitest";
import { diagnoseFailure } from "../../controller/src/debugging.js";

describe("autonomous debugging", () => {
  it("extracts Laravel stack evidence and proposes bounded next actions", () => {
    const diagnosis = diagnoseFailure({
      stderr: "SQLSTATE[42P01]: Undefined table: users at /srv/app/app/Services/AuthService.php:42",
      stdout: "",
      code: 1,
    });
    expect(diagnosis.category).toBe("DATABASE_SCHEMA");
    expect(diagnosis.locations).toContainEqual({ path: "/srv/app/app/Services/AuthService.php", line: 42 });
    expect(diagnosis.suggestions.join(" ")).toContain("migration");
  });

  it("classifies dependency and permission failures without exposing raw secrets", () => {
    expect(diagnoseFailure({ stderr: "Cannot find module 'fastify'", code: 1 }).category).toBe("DEPENDENCY");
    expect(diagnoseFailure({ stderr: "EACCES: permission denied", code: 1 }).category).toBe("PERMISSION");
  });
});
