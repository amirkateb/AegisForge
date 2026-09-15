# AegisForge

[English](README.md)

AegisForge یک کنترل‌پلین self-hosted برای مهندسی نرم‌افزار از راه دور با کمک هوش مصنوعی است. یک Master مرکزی سازمان‌ها، پروژه‌ها، Workspaceها و Agentهای مستقل را از طریق HTTPS/WSS هماهنگ می‌کند. همهٔ عملیات از Toolهای تایپ‌شده، Policy قطعی، Approval محدود و Audit لاگ پالایش‌شده عبور می‌کنند و هر Agent پیش از دسترسی به میزبان، مرز Workspace را دوباره اعمال می‌کند.

> AegisForge فعلاً پروژه‌ای در مرحلهٔ اولیه با نسخهٔ `0.1.0` است. برای استفاده روی زیرساخت Production، یک نسخهٔ بازبینی‌شده را انتخاب و pin کنید.

## قابلیت‌ها

- پشتیبانی از چند سازمان، پروژه، Agent و Workspace بدون Agent پیش‌فرض پنهان
- تخصیص صریح یا انتخاب خودکار Agent بر پایهٔ دسترس‌پذیری، سطح دسترسی، ظرفیت و فناوری‌های شناسایی‌شده
- حافظهٔ ماندگار پروژه برای معماری، وابستگی‌ها، محیط، پایگاه‌داده، Routeها، تصمیم‌ها، مشکلات شناخته‌شده، تاریخچه و ایندکس محدود کد
- چرخهٔ قابل مشاهدهٔ `Observe → Understand → Plan → Execute → Verify → Learn → Continue`
- عملیات تایپ‌شده برای فایل، ترمینال، Git، Docker، سرویس، شبکه، پایگاه‌داده، Nginx، استقرار و TLS
- سطوح دسترسی ۰ تا ۴ و Approval دقیق و تاریخ‌دار از نوع یک‌باره یا Session برای عملیات حساس
- REST API نسخه‌بندی‌شده، endpoint بدون state برای MCP، ابزار CLI و داشبورد واکنش‌گرا
- ذخیره‌سازی PostgreSQL، اتصال خروجی Agent، نصب systemd، خروجی Audit و تله‌متری سلامت

## معماری

```text
ChatGPT / Codex / Claude / CLI / API clients
                       │ HTTPS
                       ▼
          Master API + Controller + Audit ─── PostgreSQL
                       │ WSS, per-Agent identity
                       ▼
             Agent Runtime + Local Policy
                       │ canonical workspace roots
                       ▼
       Files / Git / Processes / Services / Docker / DB
```

Master هیچ پورت ورودی روی Agent باز نمی‌کند. هر Agent اتصال WSS را آغاز می‌کند، Inventory و وضعیت سلامت خود را گزارش می‌دهد و فقط برای Workspace محلی ثبت‌شده کار می‌پذیرد. هر Task همیشه به یک پروژه، Agent و Workspace متصل است. اگر انتخاب خودکار نامزد یکتایی نداشته باشد، API خطای `AGENT_SELECTION_REQUIRED` را برای انتخاب انسانی برمی‌گرداند.

Controller زمینهٔ ساختاریافتهٔ پروژه و گراف ارتباط Symbolها را بدون ذخیره‌کردن بدنهٔ کد منبع نگه می‌دارد. پیش از تغییر می‌توان Impact را بررسی کرد و پس از اجرا، شواهد Verification و آموخته‌های جدید ذخیره می‌شوند. گردش‌کارهای Deployment و TLS به‌صورت Planهای مرحله‌ای ساخته می‌شوند و Policy وابسته به Context، مراحل تغییردهندهٔ Production را به عملیات نیازمند Approval ارتقا می‌دهد.

برای جزئیات طراحی و مرزهای اعتماد، [طراحی](docs/DESIGN.md)، [امنیت](docs/SECURITY.fa.md) و [مدل تهدید](docs/THREAT_MODEL.md) را ببینید.

## پیش‌نیازها

- Node.js 22 یا جدیدتر
- npm 11 یا نسخهٔ سازگار با Workspaceهای npm
- PostgreSQL 15 یا جدیدتر
- Linux دارای systemd برای Installer محیط Production
- دامنهٔ عمومی متصل به Master برای صدور خودکار TLS

## شروع سریع توسعه

```bash
git clone https://github.com/amirkateb/AegisForge.git
cd AegisForge
npm ci --ignore-scripts
cp .env.example .env
# همهٔ secretهای نمونه و DATABASE_URL را با مقادیر واقعی جایگزین کنید.
npm run migrate -w @aegisforge/server
npm run dev
```

با تنظیمات نمونه، Master روی `http://127.0.0.1:8787` اجرا می‌شود. برای ارزیابی کامل داشبورد و همهٔ Workspaceها ابتدا Build بگیرید:

```bash
npm run build
npm run dev
```

`OPENAI_API_KEY` برای API قطعی، موتور Policy و اجرای مستقیم Toolها اختیاری است؛ اما endpoint `POST /v1/tasks/{id}/run` برای اجرای خودکار Understand/Plan به آن نیاز دارد. مقدار پیش‌فرض `OPENAI_MODEL` برابر `gpt-5.6` است.

فایل `.env` را commit نکنید. برای `MASTER_API_KEY`، `MCP_KEY`، `AGENT_ENROLLMENT_KEY` و `DASHBOARD_SESSION_SECRET` چهار secret مستقل و تصادفی با حداقل ۳۲ بایت بسازید.

## فرمان‌های متداول

| فرمان                      | کاربرد                               |
| -------------------------- | ------------------------------------ |
| `npm run dev`              | اجرای Master در حالت توسعه           |
| `npm run build`            | Build همهٔ Workspaceها               |
| `npm run typecheck`        | بررسی TypeScript project referenceها |
| `npm test`                 | اجرای همهٔ تست‌های Vitest            |
| `npm run test:unit`        | اجرای تست‌های Unit                   |
| `npm run test:integration` | اجرای تست‌های Integration            |
| `npm run test:security`    | اجرای تست‌های Regression امنیتی      |
| `npm run test:connection`  | اجرای تست‌های اتصال Agent            |
| `npm run test:installer`   | اجرای تست‌های Installer              |
| `npm run check`            | Type-check، تست و Build کل مخزن      |
| `npm run installer -- ...` | اجرای Installer محیط Production      |

## نصب Production

پس از آماده‌سازی PostgreSQL و DNS عمومی، Master را نصب کنید:

```bash
sudo npm run installer -- --type master \
  --database-url 'postgresql://aegisforge:PASSWORD@127.0.0.1/aegisforge' \
  --domain forge.example.com --email ops@example.com
```

سپس Agent را با Enrollment Credential ذخیره‌شده در فایل محیط محافظت‌شدهٔ Master نصب کنید:

```bash
sudo npm run installer -- --type agent \
  --master-url https://forge.example.com \
  --enrollment-key "$AGENT_ENROLLMENT_KEY" \
  --agent-name production-01 --environment production \
  --workspace /srv/apps/my-project
```

Installer حالت Master، Agent یا هر دو را پشتیبانی می‌کند، Migration و Health Check را انجام می‌دهد و پس از شکست، مراحل تکمیل‌شدهٔ نصب را Rollback می‌کند. داده‌های PostgreSQL و Certificateهای صادرشده عمداً حفظ می‌شوند. پیش از استقرار واقعی، [راهنمای کامل نصب و عملیات](docs/INSTALL.fa.md) را بخوانید.

## API و Clientها

پیشوند پایدار API برابر `/v1` است. درخواست‌های Operator از `Authorization: Bearer <MASTER_API_KEY>` و Clientهای محدود هوش مصنوعی از `MCP_KEY` مستقل استفاده می‌کنند. Mutationهای ایجادکنندهٔ Task به `Idempotency-Key` نیاز دارند.

سطوح اصلی API عبارت‌اند از:

- `/v1/organizations`، `/v1/projects` و Queryهای Context/Impact پروژه
- `/v1/agents`، Routeهای Enrollment/Lifecycle و `/v1/agent/connect`
- `/v1/tasks` و `/v1/tasks/{id}/run`
- `/v1/tools/run`، `/v1/approvals` و `/v1/logs` پالایش‌شده
- `/v1/projects/{id}/deployments` و `/v1/projects/{id}/tls`
- `/mcp` برای Clientهای stateless MCP

[راهنمای API](docs/API.fa.md)، [قرارداد OpenAPI](docs/openapi.yaml) و [پیکربندی Clientهای هوش مصنوعی](docs/GPT_CONFIGURATION.fa.md) جزئیات کامل‌تری دارند.

CLI از متغیرهای محیطی زیر استفاده می‌کند:

```bash
export AEGISFORGE_URL=https://forge.example.com
export AEGISFORGE_MASTER_API_KEY='...'
npm run build -w @aegisforge/cli
node cli/dist/index.js status
node cli/dist/index.js agents --json
node cli/dist/index.js projects
node cli/dist/index.js logs
```

## مدل دسترسی و Approval

| سطح | معنا        | محدودهٔ معمول                       |
| --- | ----------- | ----------------------------------- |
| ۰   | فقط خواندن  | فایل، وضعیت و Inventory             |
| ۱   | عملیات امن  | DNS و Health Probe                  |
| ۲   | توسعه       | ویرایش، تست و Command کنترل‌شده     |
| ۳   | عملیات حساس | سرویس، Docker، پایگاه‌داده و Backup |
| ۴   | دسترسی کامل | Restore و Recovery بحرانی           |

داشتن Permission لازم است اما کافی نیست. هر Tool علاوه بر آن Risk و Approval Mode خود را اعلام می‌کند. Hash مربوط به Approval به Tool، آرگومان‌ها، Task و Step دقیق متصل است و هر تغییر در آرگومان‌ها آن را نامعتبر می‌کند. نتیجهٔ `UNKNOWN` را احتمالاً اجراشده در نظر بگیرید و پیش از Retry وضعیت مقصد را بررسی کنید.

## ساختار مخزن

- `server` — REST/WSS API مستر، Persistence، MCP، Session و Audit
- `agent` — Runtime خروجی، Inventory، نگاشت Workspace و اعمال Policy محلی
- `controller` — انتخاب Agent، هوشمندی پروژه/کد، Planning و State Machine اجرا
- `tools` — Registry تایپ‌شده، Adapterهای عملیاتی و گردش‌کارهای مرحله‌ای
- `skills` — Playbookهای محدود مهندسی
- `dashboard` — کنسول واکنش‌گرای عملیات
- `cli` — Client مناسب Automation برای Operator
- `installer` — نصب تراکنشی Master/Agent/Both
- `packages` — Packageهای مشترک Protocol، Policy و Logging
- `database` — Migrationهای forward-only مربوط به PostgreSQL
- `test` — تست‌های Unit، Integration، Security، Connection و Installer

## نکات عملیاتی

- Credentialهای Master، MCP، Enrollment، Agent و Dashboard را جدا نگه دارید و مستقل Rotate کنید.
- پیش از Upgrade از PostgreSQL نسخهٔ پشتیبان بگیرید؛ Migrationها forward-only هستند و Rollback پایگاه‌داده با Restore از Backup انجام می‌شود.
- صدور Certificate عمومی، Restart سرویس، تغییر Docker و عملیات پایگاه‌دادهٔ Production به میزبان واقعی نیاز دارند و همچنان تابع Approval و Policy محلی هستند.
- موفقیت تست‌های مخزن به معنی اجرای Migration روی PostgreSQL زنده، صدور Let's Encrypt عمومی یا تأیید اتصال خارجی OpenAI نیست؛ این موارد به محیط مقصد وابسته‌اند.

## مستندات

- [نصب و عملیات](docs/INSTALL.fa.md)
- [REST، WSS و MCP API](docs/API.fa.md)
- [مدل امنیت](docs/SECURITY.fa.md)
- [پیکربندی Custom GPT، Codex و Claude](docs/GPT_CONFIGURATION.fa.md)
- [طراحی سیستم](docs/DESIGN.md)
- [مدل تهدید](docs/THREAT_MODEL.md)
- [تنظیم مخزن GitHub](docs/GITHUB_REPOSITORY.md)

نسخهٔ انگلیسی مستندات در [README.md](README.md) و فایل‌های بدون پسوند `.fa` در پوشهٔ `docs/` قرار دارد.
