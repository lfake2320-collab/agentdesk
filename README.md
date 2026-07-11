# AgentDesk

> Turn ChatGPT into your local Windows-first engineering copilot.

AgentDesk is a Windows-first fork of DevSpace that gives ChatGPT, Claude, and other MCP-capable hosts a secure connection to your local development machine. It keeps the DevSpace local workspace model, then adds practical local diagnostics for Windows developers: ports, processes, proxy settings, system summaries, personal Skill Packs, plugin manifests, and permission profiles.

<p align="center">
  <strong>ChatGPT should not just write code. It should understand why your localhost, proxy, Docker, Codex, or dev server is broken.</strong>
</p>

## Why AgentDesk?

DevSpace brings a Codex-style coding workflow to ChatGPT. AgentDesk goes further for everyday Windows and local-development troubleshooting.

| Pain | AgentDesk answer |
| --- | --- |
| “Why is localhost:8080 not working?” | Inspect listening ports and map them to PIDs. |
| “Why does Codex / MCP reconnect?” | Check Node, proxy, ports, and local process state. |
| “Which process is holding my port?” | Use `system_ports`, `system_processes`, and `system_find_process`. |
| “Can ChatGPT use my own workflow?” | Load personal Skill Packs from configurable directories. |
| “Can I add my own tools?” | Advertise plugin manifests and build trusted MCP tool adapters. |
| “Isn’t this dangerous?” | Use permission profiles and confirmation-gated process control. |

## Highlights

- **Windows-first local diagnostics**: system summary, proxy status, listening ports, process search, and controlled process termination.
- **Permission profiles**: `safe`, `dev`, `power`, and `owner` guide how deeply the host model may operate.
- **Personal Skill Packs**: load your own repeatable workflows for Codex repair, Docker debugging, YOLO projects, PyQt apps, papers, and more.
- **Plugin manifest system**: advertise local capabilities without blindly executing unknown plugin code.
- **MCP workspace server**: read, edit, search, write, run tests, and inspect real local projects through approved roots.
- **Controlled browser automation**: optional isolated Chromium session for opening pages, reading snapshots, clicking, and typing without stealing normal browser cookies by default.
- **Safer defaults**: powerful tools are opt-in, browser control is opt-in, process control is off unless explicitly enabled, and destructive actions require confirmation phrases.

## What is new compared with upstream DevSpace?

AgentDesk is based on `Waishnav/devspace`, but focuses on a different user story: local Windows engineering support and personal automation.

| Area | DevSpace | AgentDesk |
| --- | --- | --- |
| Core MCP workspace | Yes | Yes |
| File read/edit/search/write | Yes | Yes |
| Shell tools | Yes | Yes |
| Permission profiles | No | Yes: `safe/dev/power/owner` |
| Plugin manifests | No | Yes |
| Personal Skill Pack examples | Limited | Yes |
| System diagnostics | No | Yes |
| Port/process diagnosis | No | Yes |
| Confirmation-gated process kill | No | Yes, owner-only and opt-in |
| Controlled browser automation | No | Yes, owner-only and opt-in |
| Windows-first positioning | Partial | Primary focus |

## Quick start

AgentDesk requires Node.js `>=22.19 <27`.

```bash
npm install -g agentdesk-mcp
agentdesk init
agentdesk serve
```

For local development from this repository:

```bash
git clone https://github.com/lfake2320-collab/agentdesk.git
cd agentdesk
npm install
npm run build
node dist/cli.js init
node dist/cli.js serve
```

The local MCP endpoint is:

```text
http://127.0.0.1:7676/mcp
```

For ChatGPT or another remote MCP host, expose the server through a tunnel you control, then connect to:

```text
https://your-tunnel-host.example.com/mcp
```

Keep your Owner password private. AgentDesk is remote access to your development machine.

## Recommended Windows power setup

For deeper diagnostics without enabling destructive process control:

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="power"
$env:DEVSPACE_SYSTEM_TOOLS="1"
$env:DEVSPACE_TOOL_MODE="full"
agentdesk serve
```

For owner-only process control, enable it explicitly:

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="owner"
$env:DEVSPACE_SYSTEM_TOOLS="1"
$env:DEVSPACE_PROCESS_CONTROL="1"
$env:DEVSPACE_TOOL_MODE="full"
agentdesk serve
```

`system_kill_process_confirmed` still requires an exact confirmation phrase such as:

```text
KILL 1234
```

AgentDesk refuses to kill its own process or its parent process.

## MCP tools added by AgentDesk

The system tools are exposed only when system tools are enabled. By default, that means `power` and `owner` profiles.

| Tool | Purpose | Risk |
| --- | --- | --- |
| `system_summary` | OS, Node.js, CPU, and memory summary. | Read-only |
| `system_proxy_status` | Proxy environment variables with credentials redacted. | Read-only |
| `system_ports` | Listening TCP ports, optionally filtered by port. | Read-only |
| `system_doctor` | Combined system, proxy, port, and process diagnostics. | Read-only |
| `system_processes` | List local processes. | Read-only |
| `system_find_process` | Search by PID, name, command, or session. | Read-only |
| `system_kill_process_confirmed` | Terminate a PID after explicit confirmation. | Owner-only, opt-in |

## Permission profiles

| Profile | Recommended use |
| --- | --- |
| `safe` | Review, inspection, low-risk edits. |
| `dev` | Normal coding, tests, builds, and git inspection. |
| `power` | Local diagnostics for ports, processes, proxy, Docker, browsers, and services. |
| `owner` | Highest-trust maintenance sessions; destructive actions still need explicit confirmation. |

Set a profile with:

```bash
DEVSPACE_PERMISSION_PROFILE=power agentdesk serve
```

## Personal Skill Packs

AgentDesk can load skills from multiple locations:

```text
~/.agents/skills
project/.agents/skills
~/.devspace/skills
DEVSPACE_AGENT_DIR/skills
DEVSPACE_SKILL_PATHS
```

Example:

```powershell
$env:DEVSPACE_SKILL_PATHS="C:\Users\you\.devspace\skills,G:\AI\skills"
agentdesk serve
```

A skill is a `SKILL.md` file that teaches the model your preferred workflow. This repository includes an example:

```text
examples/skills/codex-repair/SKILL.md
```

## Plugin manifests

AgentDesk can discover plugin manifests from:

```text
~/.agents/plugins
project/.agents/plugins
~/.devspace/plugins
project/.devspace/plugins
DEVSPACE_PLUGIN_PATHS
```

Example plugin manifest:

```text
examples/plugins/windows-tools/plugin.json
```

Plugin manifests are capability metadata. AgentDesk does not blindly execute arbitrary plugin code from `plugin.json`; actual executable tools must be implemented by a trusted MCP host or adapter.

## Controlled browser automation

AgentDesk can expose browser-control tools when you explicitly enable them:

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="owner"
$env:DEVSPACE_BROWSER_TOOLS="1"
agentdesk serve
```

This registers:

```text
browser_start
browser_navigate
browser_snapshot
browser_click
browser_type
browser_close
```

By default AgentDesk launches an isolated Chromium-compatible profile through Chrome DevTools Protocol. It does not silently reuse your normal browser cookies. Set `DEVSPACE_BROWSER_EXECUTABLE` when AgentDesk cannot find Edge or Chrome automatically.

## Demo script for your README GIF

Use this scenario for a short GIF or video:

```text
User: Why is my localhost:8080 not working?
AgentDesk:
1. Opens the project workspace.
2. Calls system_ports with port=8080.
3. Finds the listening PID.
4. Calls system_find_process for that PID.
5. Explains which process owns the port.
6. In owner mode only, asks for confirmation before killing the PID.
```

Put the GIF under:

```text
docs/assets/agentdesk-demo.gif
```

Then add it near the top of this README.

## Documentation

- [Getting Started](docs/getting-started.md)
- [Star Roadmap](docs/star-roadmap.md)
- [Demo Script](docs/demo-script.md)
- [Configuration Reference](docs/configuration.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

## Safety model

AgentDesk exposes local development capabilities over MCP. Treat it as remote access to your computer.

Use narrow allowed roots:

```text
Good: C:\Users\you\Projects
Bad:  C:\
Bad:  C:\Users\you
```

Recommended rules:

- Keep the Owner password private.
- Do not expose AgentDesk directly to the public internet without authentication and a tunnel/proxy you trust.
- Use `power` for diagnostics and reserve `owner` for short, explicit maintenance sessions.
- Keep `DEVSPACE_PROCESS_CONTROL=0` unless you specifically need confirmed process termination.
- Never share logs that may include local paths, commands, or project names unless you review them first.

## Roadmap

- [x] Permission profiles: `safe`, `dev`, `power`, `owner`
- [x] Plugin manifest discovery
- [x] Personal Skill Pack examples
- [x] System summary and proxy diagnostics
- [x] Port and process diagnostics
- [x] Confirmation-gated process termination
- [ ] Docker diagnostics: containers, logs, compose status
- [ ] Codex repair doctor: config, proxy, MCP, local runtime checks
- [ ] Browser diagnostics: open page, screenshot localhost, check status
- [ ] Plugin execution adapter for trusted local extensions
- [ ] Windows-friendly installer and doctor wizard

## Credits

AgentDesk is based on [Waishnav/devspace](https://github.com/Waishnav/devspace), an excellent self-hosted MCP workspace server that brings Codex-style local coding workflows to ChatGPT and Claude.

This fork keeps the original MIT license and credits the upstream work. AgentDesk focuses on Windows-first local diagnostics, permission profiles, personal skills, and plugin-driven automation.

## License

MIT. See [LICENSE](LICENSE).
