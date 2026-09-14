import { describe, expect, it } from "vitest";
import {
  nginx,
  agentService,
  masterService,
} from "../../installer/src/templates.js";

describe("production service templates", () => {
  it("keeps Master private behind an upgrade-aware reverse proxy", () => {
    const config = nginx("forge.example.com");
    expect(config).toContain("proxy_pass http://127.0.0.1:8787");
    expect(config).toContain("proxy_set_header Upgrade $http_upgrade");
    expect(config).toContain("server_name forge.example.com");
  });
  it("runs both services without root privileges", () => {
    expect(masterService("/opt/aegisforge")).toContain("User=aegisforge");
    expect(agentService("/opt/aegisforge")).toContain("NoNewPrivileges=true");
  });
});
