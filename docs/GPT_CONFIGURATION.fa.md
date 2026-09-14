# اتصال Custom GPT، Codex و Claude

1. Master را پشت دامنهٔ HTTPS قرار دهید.
2. فایل [openapi.yaml](openapi.yaml) را به‌عنوان Action در Custom GPT وارد کنید.
3. برای Action فقط `MCP_KEY` را با Bearer authentication تنظیم کنید؛ `MASTER_API_KEY` و Agent token را به AI client ندهید.
4. Agents و Projects را بخوانید و برای هر Task، سه شناسهٔ صریح Project/Agent/Workspace را انتخاب کنید.
5. پاسخ `202` را متوقف کنید و از انسان Approval بگیرید؛ سپس دقیقاً همان آرگومان‌ها را با `approvalId` تکرار کنید.
6. پاسخ `UNKNOWN` را موفق یا ناموفق فرض نکنید؛ ابتدا وضعیت منبع را بررسی کنید.

دستورهای سیستم انگلیسی در [GPT_CONFIGURATION.md](GPT_CONFIGURATION.md) و MCP endpoint در `https://YOUR_DOMAIN/mcp` مستند شده است.
