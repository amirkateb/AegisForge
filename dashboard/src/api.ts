import type { Snapshot } from "./types.js";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok)
    throw Object.assign(new Error(`Request failed (${response.status})`), {
      status: response.status,
    });
  return response.json() as Promise<T>;
}
export const api = {
  login(masterApiKey: string) {
    return request<{ ok: true }>("/v1/session", {
      method: "POST",
      body: JSON.stringify({ masterApiKey }),
    });
  },
  snapshot() {
    return request<Snapshot>("/v1/ui/snapshot");
  },
  decideApproval(
    id: string,
    decision: "APPROVE_ONCE" | "APPROVE_SESSION" | "DENY",
  ) {
    return request(`/v1/ui/approvals/${id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
  },
};
