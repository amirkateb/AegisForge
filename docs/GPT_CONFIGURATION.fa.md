# اتصال GPT خصوصی به AegisForge

AegisForge فقط به یک Custom GPT خصوصی متصل می‌شود و خود Master هیچ API مدل
هوش مصنوعی را فراخوانی نمی‌کند. GPT با `MCP_KEY` به دامنه HTTPS مستر وصل می‌شود
و Agentهای هر سرور اتصال خروجی WSS خود را با Master نگه می‌دارند.

## مراحل اتصال

1. مطمئن شوید `https://YOUR_DOMAIN/healthz` از اینترنت قابل دسترسی است.
2. در ویرایشگر GPT خصوصی یک Action جدید بسازید.
3. Authentication را روی API Key و نوع آن را روی Bearer قرار دهید.
4. مقدار `MCP_KEY` را وارد کنید؛ هرگز `MASTER_API_KEY` را به GPT ندهید.
5. در [openapi.yaml](openapi.yaml) مقدار `servers[0].url` را به دامنه واقعی Master تغییر دهید.
6. کل OpenAPI را در Action وارد کنید.
7. متن کامل Instructions موجود در [نسخه انگلیسی راهنما](GPT_CONFIGURATION.md) را در بخش Instructions قرار دهید.
8. برای آزمایش بپرسید: «به چه سرورها و پوشه‌های پروژه دسترسی داری؟»

## رفتار عملی

GPT ابتدا `getAegisForgeCatalog` را فراخوانی می‌کند و نام، وضعیت، محیط، Workspace
و ابزارهای واقعی سرورها را همراه `accessMode` می‌بیند. برای یک تغییر کد:

1. با `createEngineeringTask` روی Project/Agent/Workspace انتخاب‌شده Task می‌سازد.
2. با `runTaskTool` فایل‌ها را list/search/read می‌کند.
3. با همان Action و ابزارهای advertiseشده فایل‌ها را edit/write می‌کند.
4. formatter، typecheck، build و تست‌های مرتبط را تا جای ممکن اجرا می‌کند.
5. در صورت خطا، `getEngineeringTask` و `listExecutionLogs` را می‌خواند.
6. با `recordEngineeringResult` نتیجه و شواهد نهایی را ثبت می‌کند.

اگر پاسخ `APPROVAL_REQUIRED` دریافت شد، GPT باید متوقف شود و شما عملیات را در
Dashboard تأیید کنید. برای ادامه یک Tool تعاملی، GPT همان درخواست را با `stepId`
و `approvalId` برگشتی تکرار می‌کند. تصمیم Approval هیچ‌وقت در اختیار GPT نیست.

اگر Agent روی `FULL_TRUST` باشد، هیچ Approvalای ساخته نمی‌شود و GPT نباید بین
عملیات از شما سؤال کند. باید بررسی، ویرایش، رفع خطا، تست و Verification را تا
پایان یا رسیدن به مانع واقعی ادامه دهد و سپس یک گزارش نهایی کامل بدهد. در
`CAUTIOUS` و `VERY_CAUTIOUS` رفتار Approval مطابق پاسخ Action ادامه دارد.

نتیجه `UNKNOWN` به معنی «ممکن است اجرا شده باشد» است؛ قبل از Retry باید وضعیت
فایل، Git diff، سرویس یا endpoint بررسی شود.

مسیر `/mcp` برای Clientهای MCP باقی مانده است، اما Custom GPT از قرارداد REST
داخل `openapi.yaml` استفاده می‌کند.
