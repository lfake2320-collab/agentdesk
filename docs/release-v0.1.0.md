# AgentDesk v0.1.0 — Windows-first Preview

AgentDesk v0.1.0 is the first public preview of a Windows-first local MCP engineering copilot for ChatGPT, Claude, and other MCP-capable hosts.

AgentDesk is based on Waishnav/devspace and keeps the original local workspace workflow, then adds a practical layer for local troubleshooting: permissions, plugin manifests, personal Skill Packs, system diagnostics, port/process inspection, and confirmation-gated process control.

## Highlights

- Windows-first local MCP copilot.
- Permission profiles: `safe`, `dev`, `power`, and `owner`.
- Local system diagnostics:
  - `system_summary`
  - `system_proxy_status`
  - `system_ports`
  - `system_doctor`
  - `system_processes`
  - `system_find_process`
  - `system_kill_process_confirmed`
- Port and process inspection for localhost debugging.
- Proxy environment inspection with credential redaction.
- Personal Skill Pack examples.
- Plugin manifest discovery.
- Confirmation-gated process control for `owner` sessions.
- English and Chinese documentation.

## Safety defaults

- System diagnostic tools are enabled by default only for `power` and `owner` profiles.
- Process control is disabled by default.
- Process termination requires:
  - `DEVSPACE_PERMISSION_PROFILE=owner`
  - `DEVSPACE_PROCESS_CONTROL=1`
  - exact confirmation phrase: `KILL <pid>`
- AgentDesk refuses to terminate its own process or parent process.

## Quick start

```bash
npm install -g agentdesk-mcp
agentdesk init
agentdesk serve
```

For local development:

```bash
git clone https://github.com/lfake2320-collab/agentdesk.git
cd agentdesk
npm install
npm run build
node dist/cli.js serve
```

## Credits

AgentDesk is based on [Waishnav/devspace](https://github.com/Waishnav/devspace), an excellent self-hosted MCP workspace server for ChatGPT and Claude.

This fork focuses on Windows-first diagnostics, personal automation, and safer high-trust local workflows.
