# پیشنهاد انتشار در GitHub

- Owner: `amirkateb`
- Repository: `aegisforge`
- URL: `https://github.com/amirkateb/aegisforge`
- Visibility: ابتدا Private؛ بعد از بازبینی secrets و threat model می‌تواند Public شود.
- Description: `Secure self-hosted AI remote engineering platform for multi-agent software operations, approvals, MCP and Custom GPT integration.`
- Topics: `ai-agents`, `remote-engineering`, `mcp`, `custom-gpt`, `devops`, `security`, `typescript`, `postgresql`, `websocket`, `self-hosted`

## Push commands

```bash
cd /home/amir/Documents/GitHub/DCM/AegisForge
git init
git add .
git commit -m "Initial AegisForge platform"
git branch -M main
git remote add origin https://github.com/amirkateb/aegisforge.git
git push -u origin main
```

قبل از push مطمئن شوید `.env`، کلیدهای واقعی، فایل‌های systemd و `node_modules` در Git نیستند؛ `.gitignore` برای این موارد تنظیم شده است.
