# AgentDesk v0.1.0 — Windows-first Preview

AgentDesk v0.1.0 is the first public preview of a Windows-first local MCP engineering copilot for ChatGPT, Claude, and other MCP-capable hosts.

AgentDesk is based on Waishnav/devspace and keeps the original local workspace workflow, then adds a practical layer for Windows local troubleshooting: first-run setup, permissions, plugin manifests, personal Skill Packs, system diagnostics, port/process inspection, browser tools, and confirmation-gated process control.

## Who this release is for

This release is for Windows users who are comfortable installing Git, Node.js, and optionally Cloudflare Tunnel. It is ready for clone-and-test workflows, but it is not yet a polished one-click commercial installer.

Start here:

```text
docs/first-clone-windows.md
```

## Highlights

- Windows-first local MCP copilot.
- First-run setup wizard launched by `Start-AgentDesk.cmd`.
- Fixed local AgentDesk line on port `7875`.
- Local control center at `http://127.0.0.1:7875/console`.
- Health check at `http://127.0.0.1:7875/healthz`.
- Cloudflare named tunnel support for ChatGPT web access.
- Safer default allowed roots: current AgentDesk repo plus `Documents\AgentDesk-Workspaces`.
- Wide-root acknowledgement when users try to expose `C:\`, `D:\`, `G:\`, `/`, or the home folder.
- Hidden Windows scheduled tasks for fixed MCP and named tunnel startup.
- Fresh-clone verification script: `scripts/verify-first-clone.ps1`.
- Windows source release zip script: `scripts/create-release-zip.ps1`.
- Permission profiles: `safe`, `dev`, `power`, and `owner`.
- Local system diagnostics:
  - `system_summary`
  - `system_proxy_status`
  - `system_ports`
  - `system_doctor`
  - `system_processes`
  - `system_find_process`
  - `system_kill_process_confirmed`
- Controlled browser automation when explicitly enabled.
- Personal Skill Pack examples.
- Plugin manifest discovery.

## Quick start from GitHub

```powershell
git clone https://github.com/lfake2320-collab/agentdesk.git
cd agentdesk
npm install
npm run build
Start-AgentDesk.cmd
```

Optional verification:

```powershell
.\scripts\verify-first-clone.ps1 -SkipTests
```

## Cloudflare Tunnel

For ChatGPT web, create a public HTTPS endpoint that forwards to:

```text
http://127.0.0.1:7875
```

Guide:

```text
docs/cloudflare-tunnel.md
```

ChatGPT connector URL:

```text
https://your-domain.example.com/mcp
```

## Build and validation

Before publishing this release, run:

```powershell
npm install
npm test
npm run typecheck
npm run build
```

Or:

```powershell
.\scripts\verify-first-clone.ps1
```

## Release zip

Create a source release zip:

```powershell
.\scripts\create-release-zip.ps1 -Version 0.1.0
```

Output:

```text
release\agentdesk-v0.1.0-windows-source.zip
```

The zip intentionally excludes private runtime state, tokens, Cloudflare credentials, `.git`, and `node_modules`.

## Safety defaults

- System diagnostic tools are enabled by default only for `power` and `owner` profiles.
- Process control is disabled by default.
- Process termination requires:
  - `DEVSPACE_PERMISSION_PROFILE=owner`
  - `DEVSPACE_PROCESS_CONTROL=1`
  - exact confirmation phrase: `KILL <pid>`
- AgentDesk refuses to terminate its own process or parent process.
- New setup defaults avoid whole-drive allowed roots.

## Known limitations

- Users still need to install Git and Node.js manually.
- Public ChatGPT access still requires Cloudflare Tunnel or an equivalent HTTPS tunnel.
- The source release zip is not an MSI/EXE installer.
- Large UI chunks are tolerated for this preview; the build warning threshold is set to match the current bundled editor/highlighter assets.

## Credits

AgentDesk is based on [Waishnav/devspace](https://github.com/Waishnav/devspace), an excellent self-hosted MCP workspace server for ChatGPT and Claude.

This fork focuses on Windows-first diagnostics, personal automation, first-run setup, and safer high-trust local workflows.
