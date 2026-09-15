# مدل امنیتی AegisForge

تمام ورودی‌های AI، متن Task، محتوای Repository، آرگومان Tool و metadata Agent غیرقابل‌اعتماد فرض می‌شوند. Master احراز هویت، assignment و policy را بررسی می‌کند و Agent همان policy را دوباره اجرا می‌کند.

- `MASTER_API_KEY` برای اپراتور، `MCP_KEY` برای AI client، `AGENT_ENROLLMENT_KEY` فقط برای enrollment و `AGENT_TOKEN` فقط برای یک Agent است.
- Token Agent در Master فقط SHA-256 digest است؛ revoke، disable و rotate اتصال را قطع می‌کنند.
- عملیات حساس reason، impact، منابع، risk و hash آرگومان‌ها را در Approval ثبت می‌کنند. Approve Once ده دقیقه و Session یک ساعت اعتبار دارد.
- WorkspaceGuard مسیر canonical را بررسی می‌کند و traversal/symlink escape را می‌بندد.
- Processها با `shell:false`، allowlist، timeout و output cap اجرا می‌شوند.
- Audit قبل از ذخیره password/token/cookie/private-key و Bearer credential را redact می‌کند.
- Dashboard با session HttpOnly/SameSite=Strict و API با HTTPS؛ Agent فقط WSS است.

## Mode دسترسی Agent

- `FULL_TRUST`: تصمیم دائمی در سطح Agent است؛ همهٔ Toolهای ثبت‌شده، عملیات
  پرریسک/بحرانی، `ALWAYS` و Production بدون Approval اجرا می‌شوند و Mode به Task،
  Step، آرگومان یا Session وابسته نیست.
- `CAUTIOUS`: عملیات امن خودکار است؛ `ALWAYS`، عملیات حساس High/Critical و
  تغییرات Production Approval دقیق و منقضی‌شونده می‌خواهند.
- `VERY_CAUTIOUS`: فقط Tool سطح صفر، کم‌ریسک و `NEVER` خودکار است؛ بقیه Approval
  می‌خواهند.

ذخیره هر Mode سطح Permission را خودکار روی ۴ می‌گذارد. این انتخاب مرزهای
احراز هویت، Tool Registry، انقضای Dispatch، Assignment و WorkspaceGuard را حذف
نمی‌کند؛ فقط رفتار Approval و Policy را تعیین می‌کند. هر تغییر Mode در Audit ثبت
می‌شود.

برای تهدیدها [THREAT_MODEL.md](THREAT_MODEL.md) و نسخهٔ انگلیسی [SECURITY.md](SECURITY.md) را بخوانید.
