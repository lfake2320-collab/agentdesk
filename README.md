# AgentDesk

> Turn ChatGPT into a Windows-first local engineering copilot.

AgentDesk connects ChatGPT, Claude, or another MCP-capable host to your local Windows development machine. It can read and edit approved project folders, run tests and builds, inspect ports and processes, check proxy settings, and help diagnose broken localhost/dev-server problems.

中文文档见：[README.zh-CN.md](README.zh-CN.md)。

## Start here if you just cloned the repo

For a first Windows install, use the beginner guide:

```text
docs/first-clone-windows.md
```

Shortest path:

```powershell
git clone https://github.com/lfake2320-collab/agentdesk.git
cd agentdesk
npm install
npm run build
Start-AgentDesk.cmd
```

`Start-AgentDesk.cmd` opens the first-run setup wizard at:

```text
http://127.0.0.1:7876/
```

After setup, AgentDesk normally runs at:

```text
Local console: http://127.0.0.1:7875/console
Health check:   http://127.0.0.1:7875/healthz
Local MCP:      http://127.0.0.1:7875/mcp
```

To verify a fresh clone before opening the wizard:

```powershell
.\scripts\verify-first-clone.ps1 -SkipTests
```

## Connecting ChatGPT

ChatGPT web cannot normally reach your computer's `127.0.0.1`, so use a public HTTPS tunnel such as Cloudflare Tunnel.

Cloudflare step-by-step guide:

```text
docs/cloudflare-tunnel.md
```

In ChatGPT's MCP / connector settings, use:

```text
Name: AgentDesk
Server URL: https://your-domain.example.com/mcp
Auth: OAuth
```

Do not put `/mcp` into `Public Base URL` inside the setup wizard. The wizard wants the origin only, for example:

```text
https://agentdesk.example.com
```

## Safer default workspace folders

AgentDesk can only access folders listed in `allowed roots`.

Good:

```text
C:\Users\you\Documents\AgentDesk-Workspaces
D:\Code\one-project
G:\devspace-copt-lab\devspace
```

Avoid whole drives or home folders:

```text
C:\
D:\
G:\
C:\Users\you
```

The first-run wizard defaults to the current AgentDesk folder plus:

```text
Documents\AgentDesk-Workspaces
```

If you deliberately add a drive root, the wizard requires an explicit risk acknowledgement.

## What AgentDesk adds beyond upstream DevSpace

| Area | AgentDesk |
| --- | --- |
| Local MCP workspace | Read, search, edit, write, and run commands in approved roots |
| Windows diagnostics | System summary, proxy status, ports, processes, doctor checks |
| Permission profiles | `safe`, `dev`, `power`, `owner` |
| Process control | Owner-only, opt-in, exact confirmation phrase required |
| Browser tools | Optional isolated/live Edge automation |
| First-run setup | Browser wizard launched by `Start-AgentDesk.cmd` |
| Public access | Optional Cloudflare named tunnel scripts |
| Startup | Hidden Windows scheduled tasks |
| Packaging | Release zip script and release checklist |

## Useful commands

```powershell
npm test
npm run typecheck
npm run build
npm run verify:first-clone
npm run release:zip
```

Create a Windows source release zip:

```powershell
.\scripts\create-release-zip.ps1 -Version 0.1.0
```

Release checklist:

```text
docs/release-checklist.md
```

## Documentation

- [Windows first clone guide](docs/first-clone-windows.md)
- [Cloudflare Tunnel guide](docs/cloudflare-tunnel.md)
- [Release checklist](docs/release-checklist.md)
- [Getting Started](docs/getting-started.md)
- [Configuration Reference](docs/configuration.md)
- [ChatGPT Setup](docs/chatgpt-setup.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Example prompt

After connecting AgentDesk to ChatGPT, try:

```text
@AgentDesk Open my project workspace and diagnose why localhost:8080 is not responding. Check ports, processes, proxy settings, and project scripts before suggesting a fix.
```

Expected flow:

```text
1. Open workspace.
2. Inspect package scripts and config.
3. Check listening ports.
4. Map the port to a process.
5. Explain the cause.
6. Ask before any risky action.
```

## Safety model

AgentDesk is remote access to your development machine. Keep allowed roots narrow, keep the Owner Token private, and expose it only through a tunnel/proxy you trust.

Process termination requires all of these:

```text
DEVSPACE_PERMISSION_PROFILE=owner
DEVSPACE_PROCESS_CONTROL=1
Exact confirmation phrase: KILL <pid>
```

AgentDesk refuses to terminate its own process or parent process.

## Status

Current status: `v0.1.0 Windows-first Preview`.

This is ready for clone-and-test workflows, but it is still a preview rather than a polished commercial installer.

## Credits

AgentDesk is based on [Waishnav/devspace](https://github.com/Waishnav/devspace), an excellent self-hosted MCP workspace server for ChatGPT and Claude.

This fork focuses on Windows-first diagnostics, first-run setup, safer local workflows, personal skills, and plugin-oriented automation.

## License

MIT. See [LICENSE](LICENSE).
