# AegisForge

پلتفرم امن مهندسی نرم‌افزار از راه دور با هوش مصنوعی. یک Master مرکزی چند Agent، چند پروژه و چند Workspace را از طریق HTTPS/WSS مدیریت می‌کند؛ دستورات از مسیر Toolهای تایپ‌شده، Policy، Approval و Audit عبور می‌کنند.

> پلتفرم امن و self-hosted برای مهندسی نرم‌افزار از راه دور با چند Agent، تأیید انسانی، MCP و اتصال Custom GPT.

## نصب سریع توسعه

پیش‌نیازها: Node.js 22 یا جدیدتر و PostgreSQL 15 یا جدیدتر.

```bash
git clone https://github.com/amirkateb/aegisforge.git
cd aegisforge
npm ci --ignore-scripts
cp .env.example .env
# مقادیر واقعی secrets و DATABASE_URL را در .env تنظیم کنید
npm run migrate -w @aegisforge/server
npm run build
npm run dev
```

داشبورد در `http://127.0.0.1:8787` قرار می‌گیرد. برای بررسی کامل `npm run check` را اجرا کنید.

## نصب Production

```bash
sudo npm run installer -- --type master \
  --database-url 'postgresql://aegisforge:PASSWORD@127.0.0.1/aegisforge' \
  --domain forge.example.com --email ops@example.com
```

برای Agent:

```bash
sudo npm run installer -- --type agent \
  --master-url https://forge.example.com \
  --enrollment-key 'YOUR_ENROLLMENT_KEY' \
  --agent-name production-01 --environment production \
  --workspace /srv/apps/my-project
```

راهنمای کامل در [docs/INSTALL.fa.md](docs/INSTALL.fa.md) و نسخهٔ انگلیسی در [docs/INSTALL.md](docs/INSTALL.md) است. کلیدها را در Git commit نکنید.

## قابلیت‌ها

- Master/Agent مستقل با enrollment، revoke، disable و rotate token
- سطح دسترسی ۰ تا ۴ و Approval یک‌باره یا Session با hash دقیق عملیات
- محافظ Workspace در برابر traversal و symlink escape
- Filesystem، Terminal، Session، Git، Docker، Nginx، Database، Network و Service tools
- Controller با چرخهٔ Understand → Plan → Execute → Verify → Fix
- REST v1، MCP، OpenAPI، CLI، Dashboard واکنش‌گرا، PostgreSQL و systemd/Docker/TLS

جزئیات امنیت در [docs/SECURITY.fa.md](docs/SECURITY.fa.md) و اتصال GPT/Codex/Claude در [docs/GPT_CONFIGURATION.fa.md](docs/GPT_CONFIGURATION.fa.md) است.

English: [README.md](README.md).
