export function masterService(prefix: string) {
  return `[Unit]\nDescription=AegisForge Master\nAfter=network-online.target postgresql.service\nWants=network-online.target\n\n[Service]\nType=simple\nUser=aegisforge\nGroup=aegisforge\nWorkingDirectory=${prefix}\nEnvironmentFile=/etc/aegisforge/master.env\nExecStart=/usr/bin/node ${prefix}/server/dist/index.js\nRestart=on-failure\nRestartSec=5\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=true\nReadWritePaths=/var/lib/aegisforge\nLimitNOFILE=65536\n\n[Install]\nWantedBy=multi-user.target\n`;
}
export function agentService(prefix: string, workspaceRoots: string[] = []) {
  const writable = workspaceRoots
    .map((root) => `ReadWritePaths=${JSON.stringify(root)}`)
    .join("\n");
  return `[Unit]\nDescription=AegisForge Agent\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nUser=aegisforge\nGroup=aegisforge\nWorkingDirectory=${prefix}\nEnvironmentFile=/etc/aegisforge/agent.env\nExecStart=/usr/bin/node ${prefix}/agent/dist/index.js\nRestart=always\nRestartSec=5\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=read-only\n${writable}\n\n[Install]\nWantedBy=multi-user.target\n`;
}
export function nginx(domain: string) {
  return `server {\n  listen 80;\n  listen [::]:80;\n  server_name ${domain};\n  location / { proxy_pass http://127.0.0.1:8787; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }\n  location /v1/agent/connect { proxy_pass http://127.0.0.1:8787; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_read_timeout 300s; }\n}\n`;
}
