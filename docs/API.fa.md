# API فارسی

پیشوند API برابر `/v1` است. برای Operator از `Authorization: Bearer MASTER_API_KEY` و برای MCP از `MCP_KEY` استفاده کنید. ساخت Task حتماً `Idempotency-Key` می‌خواهد.

- `GET /v1/agents` و `GET /v1/projects` برای انتخاب منابع
- `GET /v1/ai/catalog` برای مشاهده یک‌جای سرورها، پروژه‌ها، Workspaceها و Toolهای واقعی
- `POST /v1/tasks` با `projectId`، `agentId` و `workspaceId` صریح
- `GET /v1/tasks/{id}` برای وضعیت، Plan، مراحل، Approval و Eventها
- `POST /v1/tasks/{id}/tools/run` برای خواندن، ویرایش و تست تعاملی توسط GPT
- `POST /v1/tasks/{id}/plan` و `/result` برای Plan و گزارش نهایی GPT
- `POST /v1/tools/run` برای اجرای Tool یا پاسخ `202 APPROVAL_REQUIRED`
- `POST /v1/approvals/{id}/decision` با `APPROVE_ONCE`، `APPROVE_SESSION` یا `DENY`
- `GET /v1/logs` برای Auditهای redact‌شده
- `POST /v1/agents/{id}/revoke|disable|rotate-token` برای چرخهٔ عمر Agent
- `PATCH /v1/agents/{id}/access-mode` با `FULL_TRUST`، `CAUTIOUS` یا
  `VERY_CAUTIOUS` برای تنظیم دائمی Mode کل Agent؛ این درخواست Level را هم اتمیک
  روی ۴ می‌گذارد و Audit می‌شود.
- `wss://.../v1/agent/connect` برای کانال Agent و `/mcp` برای MCP

قرارداد کامل در [openapi.yaml](openapi.yaml) و نسخهٔ انگلیسی در [API.md](API.md) است.
