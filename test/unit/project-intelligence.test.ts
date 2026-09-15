import { describe, expect, it } from "vitest";
import {
  analyzeCode,
  findAffectedCode,
} from "../../controller/src/code-intelligence.js";
import { analyzeProject } from "../../controller/src/project-analyzer.js";

const files: Record<string, string> = {
  "composer.json": JSON.stringify({ require: { "laravel/framework": "^12" } }),
  "app/Models/User.php": "<?php class User extends Authenticatable {}",
  "app/Services/AuthService.php":
    "<?php use App\\Models\\User; class AuthService { public function login(User $user) {} }",
  "app/Http/Controllers/UserController.php":
    "<?php use App\\Models\\User; class UserController { public function show(User $user) {} }",
  "routes/api.php": "<?php Route::get('/users/{user}', [UserController::class, 'show']);",
  "database/migrations/2026_create_users.php":
    "<?php Schema::create('users', function (Blueprint $table) {});",
};

const reader = {
  async list() {
    return Object.keys(files);
  },
  async read(path: string) {
    return files[path] ?? null;
  },
};

describe("project intelligence", () => {
  it("recognizes Laravel architecture and database structure", async () => {
    const profile = await analyzeProject(reader);
    expect(profile.framework).toContain("Laravel");
    expect(profile.architecture).toEqual(
      expect.arrayContaining(["Models", "Services", "Controllers", "Migrations"]),
    );
    expect(profile.databases).toContain("Laravel migrations");
  });

  it("indexes symbols, routes and relationships for impact analysis", async () => {
    const index = await analyzeCode(reader);
    const impact = findAffectedCode(index, "User");
    expect(index.routes[0]).toMatchObject({ method: "GET", path: "/users/{user}" });
    expect(index.databaseEntities).toContainEqual(
      expect.objectContaining({ name: "users", kind: "table" }),
    );
    expect(impact.files).toEqual(
      expect.arrayContaining([
        "app/Models/User.php",
        "app/Services/AuthService.php",
        "app/Http/Controllers/UserController.php",
        "routes/api.php",
      ]),
    );
  });
});
