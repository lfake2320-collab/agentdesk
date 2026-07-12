# Getting Started with AgentDesk

This guide is for users who want to run AgentDesk as a local MCP server for ChatGPT, Claude, or another MCP-capable host.

For the complete Windows beginner path, read:

```text
docs/first-clone-windows.md
```

## Requirements

- Windows 10/11 recommended
- Git
- Node.js `>=22.19 <27`
- npm
- PowerShell
- Optional: `cloudflared` for public HTTPS access from ChatGPT web

Check versions:

```powershell
git --version
node -v
npm -v
```

## Install from GitHub source

```powershell
git clone https://github.com/lfake2320-collab/agentdesk.git
cd agentdesk
npm install
npm run build
```

Run the fresh-clone verifier:

```powershell
.\scripts\verify-first-clone.ps1 -SkipTests
```

Open the first-run setup wizard:

```powershell
Start-AgentDesk.cmd
```

The wizard opens at:

```text
http://127.0.0.1:7876/
```

## Default local addresses

After setup, AgentDesk normally uses:

```text
Local console: http://127.0.0.1:7875/console
Health check:   http://127.0.0.1:7875/healthz
Local MCP:      http://127.0.0.1:7875/mcp
```

## Choose allowed roots

Allowed roots define where ChatGPT may open local workspaces.

Good examples:

```text
C:\Users\you\Documents\AgentDesk-Workspaces
G:\Projects\one-project
D:\Code\agentdesk-test
```

Avoid broad roots:

```text
C:\
D:\
G:\
C:\Users\you
/
~
```

The setup wizard defaults to the current AgentDesk repo plus:

```text
Documents\AgentDesk-Workspaces
```

If you add a whole drive root, the wizard requires an explicit risk acknowledgement.

## Connect a remote MCP host

Local endpoint:

```text
http://127.0.0.1:7875/mcp
```

ChatGPT web usually needs public HTTPS. Use Cloudflare Tunnel or another tunnel you trust:

```text
https://your-domain.example.com/mcp
```

Cloudflare guide:

```text
docs/cloudflare-tunnel.md
```

Inside the setup wizard, `Public Base URL` should be the origin only:

```text
https://your-domain.example.com
```

Do not include `/mcp` there.

## First useful prompt

After connecting AgentDesk to ChatGPT, try:

```text
@AgentDesk Open my project workspace and diagnose why localhost:8080 is not responding. Check ports, processes, proxy settings, and project scripts before suggesting a fix.
```

Expected behavior:

1. The host calls `open_workspace`.
2. It uses read/search tools for project inspection.
3. It uses `system_ports` and `system_find_process` for local diagnostics when enabled.
4. It explains the likely cause.
5. It asks for explicit confirmation before any destructive action.

## CLI / package usage

Global package usage is still supported:

```bash
npm install -g agentdesk-mcp
agentdesk init
agentdesk serve
```

The source-clone wizard path is recommended for Windows testers because it configures the fixed `7875` line, first-run setup, and hidden scheduled tasks.

## Troubleshooting

Run:

```powershell
npm run typecheck
npm run build
npm test
```

If MCP cannot connect:

- Confirm AgentDesk is running.
- Confirm `http://127.0.0.1:7875/healthz` returns 200.
- Confirm your public tunnel points to `http://127.0.0.1:7875`.
- Confirm `Public Base URL` matches the public origin without `/mcp`.
- Confirm the OAuth Owner Token approval flow completed.

If a port is occupied, ask AgentDesk to call `system_ports` with that port.

If process control is unavailable:

- Confirm `DEVSPACE_PERMISSION_PROFILE=owner`.
- Confirm `DEVSPACE_PROCESS_CONTROL=1`.
- Use the exact confirmation phrase `KILL <pid>`.
