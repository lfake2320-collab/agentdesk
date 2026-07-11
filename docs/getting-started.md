# Getting Started with AgentDesk

This guide gets AgentDesk running as a local MCP server for ChatGPT, Claude, or another MCP-capable host.

## Requirements

- Node.js `>=22.19 <27`
- npm
- Git
- A shell available to your environment
- A public HTTPS tunnel if your MCP host cannot connect to `localhost`

On Windows, AgentDesk is designed to be PowerShell-friendly, but it still inherits some upstream DevSpace shell behavior. Git Bash or WSL can still be useful for project commands.

## Install

```bash
npm install -g agentdesk-mcp
agentdesk init
agentdesk serve
```

For local development:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/agentdesk.git
cd agentdesk
npm install
npm run build
node dist/cli.js init
node dist/cli.js serve
```

## Choose allowed roots

Allowed roots define where ChatGPT may open workspaces.

Good examples:

```text
C:\Users\you\Projects
G:\Projects
D:\Code
```

Bad examples:

```text
C:\
C:\Users\you
/
~
```

Keep roots narrow. AgentDesk is remote access to your development machine.

## Permission profiles

Use `dev` for normal work:

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="dev"
agentdesk serve
```

Use `power` for diagnostics:

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="power"
$env:DEVSPACE_SYSTEM_TOOLS="1"
agentdesk serve
```

Use `owner` only for short, explicit maintenance sessions:

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="owner"
$env:DEVSPACE_SYSTEM_TOOLS="1"
$env:DEVSPACE_PROCESS_CONTROL="1"
agentdesk serve
```

## Connect MCP

Local endpoint:

```text
http://127.0.0.1:7676/mcp
```

Remote tunnel endpoint:

```text
https://your-tunnel-host.example.com/mcp
```

When the MCP host connects, AgentDesk uses an Owner password approval page. Keep the Owner password private.

## First useful prompt

After connecting AgentDesk to ChatGPT, try:

```text
Open my project workspace and diagnose why localhost:8080 is not responding. Check ports, processes, proxy settings, and project scripts before suggesting a fix.
```

Expected behavior:

1. The host calls `open_workspace`.
2. It uses read/search tools for project inspection.
3. It uses `system_ports` and `system_find_process` for local diagnostics when enabled.
4. It explains the likely cause.
5. It asks for explicit confirmation before any destructive action.

## Troubleshooting

Run typecheck and build from source:

```bash
npm run typecheck
npm run build
```

If MCP cannot connect:

- Confirm AgentDesk is running.
- Confirm the `/mcp` URL is correct.
- Confirm your public tunnel points to `http://127.0.0.1:7676`.
- Confirm `DEVSPACE_PUBLIC_BASE_URL` matches the public origin, without `/mcp`.
- Confirm the Owner password approval flow completed.

If a port is occupied:

```text
Ask AgentDesk to call system_ports with the target port.
```

If process control is unavailable:

- Confirm `DEVSPACE_PERMISSION_PROFILE=owner`.
- Confirm `DEVSPACE_PROCESS_CONTROL=1`.
- Use the exact confirmation phrase `KILL <pid>`.
