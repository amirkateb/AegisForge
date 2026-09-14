# API فارسی

پیشوند API برابر `/v1` است. برای Operator از `Authorization: Bearer MASTER_API_KEY` و برای MCP از `MCP_KEY` استفاده کنید. ساخت Task حتماً `Idempotency-Key` می‌خواهد.

- `GET /v1/agents` و `GET /v1/projects` برای انتخاب منابع
- `POST /v1/tasks` با `projectId`، `agentId` و `workspaceId` صریح
- `POST /v1/tools/run` برای اجرای Tool یا پاسخ `202 APPROVAL_REQUIRED`
- `POST /v1/approvals/{id}/decision` با `APPROVE_ONCE`، `APPROVE_SESSION` یا `DENY`
- `GET /v1/logs` برای Auditهای redact‌شده
- `POST /v1/agents/{id}/revoke|disable|rotate-token` برای چرخهٔ عمر Agent
- `wss://.../v1/agent/connect` برای کانال Agent و `/mcp` برای MCP

قرارداد کامل در [openapi.yaml](openapi.yaml) و نسخهٔ انگلیسی در [API.md](API.md) است.
