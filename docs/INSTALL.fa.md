# راهنمای نصب AegisForge

## پیش‌نیاز

Node.js 22+، PostgreSQL 15+ و در نصب Production لینوکس دارای systemd لازم است. برای TLS عمومی باید دامنهٔ واقعی با رکورد A/AAAA داشته باشید.

## Master

Installer کاربر غیرممتاز `aegisforge` را می‌سازد، dependencyهای lock‌شده را نصب و build می‌کند، secrets مستقل می‌سازد، migration و systemd را اجرا می‌کند. با `--domain`، DNS بررسی و Nginx/Certbot نصب می‌شوند و گواهی Let's Encrypt با email معتبر صادر می‌شود.

```bash
sudo npm run installer -- --type master \
  --database-url 'postgresql://aegisforge:PASSWORD@127.0.0.1/aegisforge' \
  --domain forge.example.com --email ops@example.com
```

کلیدها در `/etc/aegisforge/master.env` با دسترسی `0600` قرار می‌گیرند؛ آن‌ها را به secrets manager منتقل کنید.

## Agent

```bash
sudo npm run installer -- --type agent \
  --master-url https://forge.example.com \
  --enrollment-key '...' --agent-name app-01 \
  --environment production --workspace /srv/apps/app
```

هر Workspace در Master ثبت می‌شود و شناسهٔ واقعی آن در `WORKSPACE_ROOTS_JSON` ذخیره می‌گردد. Agent فقط اتصال خروجی `wss://` برقرار می‌کند.

## Both و حذف

`--type both` ابتدا Master/TLS و سپس Agent را نصب می‌کند و کلید enrollment تولیدشده را reuse می‌کند. حذف فقط مسیر اختصاصی دارای marker را می‌پذیرد و دادهٔ PostgreSQL و گواهی‌ها را حفظ می‌کند:

```bash
sudo npm run installer -- --uninstall
```

بررسی:

```bash
curl --fail https://forge.example.com/healthz
systemctl status aegisforge-master aegisforge-agent
```

نسخهٔ انگلیسی: [INSTALL.md](INSTALL.md).
