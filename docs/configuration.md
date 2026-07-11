# Configuration Reference

DevSpace can be configured through `devspace init`, persisted config files, or
environment variables.

The default files are:

```text
~/.devspace/config.json
~/.devspace/auth.json
```

Use another config directory with:

```bash
DEVSPACE_CONFIG_DIR=/path/to/config npx @waishnav/devspace serve
```

## Commands

```bash
npx @waishnav/devspace init
npx @waishnav/devspace serve
npx @waishnav/devspace doctor
npx @waishnav/devspace config get
npx @waishnav/devspace config set publicBaseUrl https://devspace.example.com
```

## Core Environment Variables

| Variable | Purpose |
| --- | --- |
| `HOST` | Local bind host. Defaults to `127.0.0.1`. |
| `PORT` | Local port. Defaults to `7676`. |
| `DEVSPACE_ALLOWED_ROOTS` | Comma-separated local roots that workspaces may open. |
| `DEVSPACE_PUBLIC_BASE_URL` | Public origin for the server, without `/mcp`. |
| `DEVSPACE_ALLOWED_HOSTS` | Optional Host header allowlist override. |
| `DEVSPACE_OAUTH_OWNER_TOKEN` | Owner password for OAuth approval. Must be at least 16 characters. |
| `DEVSPACE_WORKTREE_ROOT` | Directory for managed Git worktrees. Defaults to `~/.devspace/worktrees`. |
| `DEVSPACE_STATE_DIR` | Directory for SQLite state. Defaults to `~/.local/share/devspace`. |
| `DEVSPACE_PERMISSION_PROFILE` | Permission guidance profile: `safe`, `dev`, `power`, or `owner`. Defaults to `dev`. |

## OAuth

DevSpace uses a single-user OAuth approval flow.

| Variable | Default |
| --- | --- |
| `DEVSPACE_OAUTH_ACCESS_TOKEN_TTL_SECONDS` | `3600` |
| `DEVSPACE_OAUTH_REFRESH_TOKEN_TTL_SECONDS` | `2592000` |
| `DEVSPACE_OAUTH_SCOPES` | `devspace` |
| `DEVSPACE_OAUTH_ALLOWED_REDIRECT_HOSTS` | `chatgpt.com,localhost,127.0.0.1` |

MCP clients discover metadata from:

```text
/.well-known/oauth-protected-resource/mcp
/.well-known/oauth-authorization-server
```

## Tool Modes

`DEVSPACE_TOOL_MODE` controls the tool surface.

| Value | Behavior |
| --- | --- |
| `minimal` | Default. Exposes `open_workspace`, `read`, `write`, `edit`, and `bash`. Clients use `bash` with tools such as `rg`, `find`, and `ls` for inspection. |
| `full` | Exposes the minimal tools plus dedicated `grep`, `glob`, and `ls` tools. |
| `codex` | Experimental. Exposes `open_workspace`, `read`, `apply_patch`, `exec_command`, and `write_stdin`. Existing mutation and shell tools are hidden. |

`DEVSPACE_MINIMAL_TOOLS` remains a backward-compatible alias when
`DEVSPACE_TOOL_MODE` is unset: `1` selects `minimal` and `0` selects `full`.
The `codex` mode must be selected through `DEVSPACE_TOOL_MODE` and always uses
its fixed short tool names regardless of `DEVSPACE_TOOL_NAMING`.

Codex-mode commands run without a PTY by default. Set `tty: true` on
`exec_command` for interactive terminal programs. PTY support uses the optional
`node-pty` dependency; `write_stdin` can send input, poll output, and resize PTY
sessions.

## Permission Profiles

`DEVSPACE_PERMISSION_PROFILE` tells MCP hosts how deeply they may use the exposed local workspace capabilities. It does not bypass OAuth, filesystem roots, or host-exposed tool boundaries; it is model-facing guidance for safer high-trust sessions.

| Value | Intended use |
| --- | --- |
| `safe` | Inspection, review, low-risk edits, and read-heavy work. |
| `dev` | Default. Normal project development: code edits, tests, builds, and git inspection. |
| `power` | Deeper local diagnostics such as ports, Docker, browsers, databases, and services when the user asks. |
| `owner` | Highest-trust owner session. Broad local maintenance is allowed, but destructive, credential-touching, or irreversible actions still need explicit confirmation. |

For example:

```bash
DEVSPACE_PERMISSION_PROFILE=power npx @waishnav/devspace serve
```

## System Diagnostic Tools

`DEVSPACE_SYSTEM_TOOLS` controls read-only local machine diagnostics. When unset, these tools are enabled only for `power` and `owner` permission profiles.

| Tool | Purpose |
| --- | --- |
| `system_summary` | OS, Node.js, CPU, and memory summary. |
| `system_proxy_status` | Proxy environment variables with credentials redacted. |
| `system_ports` | Listening TCP ports, optionally filtered by port. |
| `system_processes` | Local process list with optional query and result limit. |
| `system_find_process` | Targeted process search before any process-control decision. |
| `system_doctor` | Combined system, proxy, and port diagnostics. |

All system diagnostic tools require a `workspaceId` from `open_workspace`. They do not write files, stop processes, change services, read secrets, or mutate global machine state.

Examples:

```bash
DEVSPACE_PERMISSION_PROFILE=power DEVSPACE_SYSTEM_TOOLS=1 npx @waishnav/devspace serve
DEVSPACE_PERMISSION_PROFILE=dev DEVSPACE_SYSTEM_TOOLS=0 npx @waishnav/devspace serve
```

### Process Control

`DEVSPACE_PROCESS_CONTROL` exposes the destructive `system_kill_process_confirmed` tool. It is disabled by default and is only registered when `DEVSPACE_PERMISSION_PROFILE=owner` is active. The tool requires `confirmationPhrase` to exactly equal `KILL <pid>` and refuses to terminate the DevSpace server process or its parent process.

Use process inspection first, then enable process control only for an explicit maintenance session:

```bash
DEVSPACE_PERMISSION_PROFILE=owner DEVSPACE_SYSTEM_TOOLS=1 DEVSPACE_PROCESS_CONTROL=1 npx @waishnav/devspace serve
```

## Browser Control Tools

`DEVSPACE_BROWSER_TOOLS` exposes a Chromium-compatible browser session through MCP. It is disabled by default and intended for explicit, user-authorized web automation such as opening a page, reading visible text, clicking buttons, and filling forms.

AgentDesk supports two browser profile modes:

| Mode | Environment | Behavior |
| --- | --- | --- |
| `isolated` | `DEVSPACE_BROWSER_MODE=isolated` | Default. Starts Edge/Chromium with a separate AgentDesk profile under the AgentDesk state directory. This does not reuse normal login state. |
| `live` | `DEVSPACE_BROWSER_MODE=live` | Uses the configured Edge user data directory and profile, so websites can see the login state already stored in that Edge profile. AgentDesk does not export or copy cookies; it drives the browser profile directly. |

Edge is preferred by default. Set `DEVSPACE_BROWSER_EXECUTABLE` only if AgentDesk cannot find Edge automatically.

| Tool | Purpose |
| --- | --- |
| `browser_start` | Start the controlled browser session. |
| `browser_navigate` | Navigate the controlled browser to a URL. |
| `browser_snapshot` | Read URL, title, visible text, and interactive elements. |
| `browser_click` | Click by CSS selector or visible text. |
| `browser_type` | Type into an input or editable element. |
| `browser_close` | Close the controlled browser session. In `live` mode it detaches instead of killing your main browser profile. |

Safe isolated owner session:

```bash
DEVSPACE_PERMISSION_PROFILE=owner DEVSPACE_BROWSER_TOOLS=1 DEVSPACE_BROWSER_MODE=isolated npx agentdesk-mcp serve
```

Live Edge profile session on Windows:

```bash
DEVSPACE_PERMISSION_PROFILE=owner \
DEVSPACE_BROWSER_TOOLS=1 \
DEVSPACE_BROWSER_MODE=live \
DEVSPACE_BROWSER_EXECUTABLE="C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe" \
DEVSPACE_BROWSER_USER_DATA_DIR="C:\\Users\\YOU\\AppData\\Local\\Microsoft\\Edge\\User Data" \
DEVSPACE_BROWSER_PROFILE_DIRECTORY=Default \
npx agentdesk-mcp serve
```

If Edge is already open and locks the same profile, close existing Edge windows first. Alternatively, start Edge yourself with a remote debugging port and set attach-only mode:

```bash
msedge.exe --remote-debugging-port=9222 --user-data-dir="C:\\Users\\YOU\\AppData\\Local\\Microsoft\\Edge\\User Data" --profile-directory=Default
DEVSPACE_BROWSER_ATTACH_ONLY=1 DEVSPACE_BROWSER_MODE=live DEVSPACE_BROWSER_TOOLS=1 DEVSPACE_PERMISSION_PROFILE=owner npx agentdesk-mcp serve
```

Optional browser configuration:

```bash
DEVSPACE_BROWSER_DEBUG_PORT=9222
DEVSPACE_BROWSER_PROFILE_DIRECTORY=Default
```

## Widgets

`DEVSPACE_WIDGETS` controls ChatGPT Apps iframe usage.

| Value | Behavior |
| --- | --- |
| `full` | Default. Widget UI is attached to exposed workspace, file, edit, and shell tools. |
| `changes` | Enables the aggregate `show_changes` tool and attaches widget UI to `open_workspace` and `show_changes`. |
| `off` | Disables widget UI. |

## Skills

| Variable | Purpose |
| --- | --- |
| `DEVSPACE_SKILLS` | Set to `0` to hide skills. Enabled by default. |
| `DEVSPACE_SUBAGENTS` | Set to `1` to expose configured agent profiles as Subagents. Experimental and disabled by default. |
| `DEVSPACE_AGENT_DIR` | Defaults to `~/.codex`; its `skills` child is loaded for compatibility. |
| `DEVSPACE_SKILL_PATHS` | Optional comma-separated additional skill directories. |

`~/.devspace/config.json` can also define `skillPaths` for persistent personal skill libraries:

```json
{
  "skillPaths": [
    "~/my-devspace-skills",
    "D:/AI/skills"
  ]
}
```

DevSpace discovers standard Agent Skills from:

- `~/.agents/skills`
- project `.agents/skills`
- `~/.devspace/skills`

It also keeps compatibility with:

- the bundled `subagent-delegation` skill when `DEVSPACE_SUBAGENTS=1`, unless `~/.devspace/skills/subagent-delegation/SKILL.md` exists
- `DEVSPACE_AGENT_DIR/skills`, defaulting to `~/.codex/skills`
- additional paths from `DEVSPACE_SKILL_PATHS`

When Subagents are enabled, DevSpace discovers agent profiles
from:

- `~/.devspace/agents/*.md`
- project `.devspace/agents/*.md`

`open_workspace` returns a compact catalog containing profile names,
descriptions, providers, and optional models/thinking levels so the host model can choose an
agent without reading provider-specific launch details. `devspace agents ls`
lists existing subagent sessions for the current workspace, scoped by the
workspace environment injected into shell commands. The `subagent-delegation`
skill teaches the model to use only the minimal `devspace agents ls`,
`devspace agents run`, and `devspace agents show` workflow.

Starter profile templates are available under `examples/agents/`. Copy or adapt
them into one of the active profile directories before use.

Legacy project paths such as `.pi/skills` can be added through `DEVSPACE_SKILL_PATHS` when needed.

Example:

```bash
DEVSPACE_SKILL_PATHS="$HOME/.claude/skills,$HOME/company/skills" \
npx @waishnav/devspace serve
```

## Plugin Manifests

DevSpace can discover plugin manifests and return them from `open_workspace` as capability metadata. This is a foundation for private extension systems: a manifest advertises a plugin's name, permissions, related skills, and expected tools. DevSpace does not execute plugin code from manifests by itself; actual tools must still be exposed by a trusted MCP host or adapter.

| Variable | Purpose |
| --- | --- |
| `DEVSPACE_PLUGINS` | Set to `0` to hide plugin manifests. Enabled by default. |
| `DEVSPACE_PLUGIN_PATHS` | Optional comma-separated additional plugin directories. |

DevSpace discovers manifests from:

- `~/.agents/plugins`
- project `.agents/plugins`
- `~/.devspace/plugins`
- project `.devspace/plugins`
- additional paths from `DEVSPACE_PLUGIN_PATHS`

Each plugin directory may contain a `plugin.json` directly or child folders with their own `plugin.json` files.

Example manifest:

```json
{
  "name": "windows-tools",
  "description": "Windows process, port, service, and PowerShell helpers.",
  "version": "0.1.0",
  "permissions": ["process:list", "process:kill", "network:ports"],
  "skills": ["codex-repair"],
  "tools": [
    { "name": "windows_find_port", "description": "Find the process using a local port." }
  ]
}
```

A persistent personal setup can live in `~/.devspace/config.json`:

```json
{
  "permissionProfile": "power",
  "pluginPaths": ["~/my-devspace-plugins"],
  "skillPaths": ["~/my-devspace-skills"],
  "subagents": true
}
```

## Logging

| Variable | Default |
| --- | --- |
| `DEVSPACE_LOG_LEVEL` | `info` |
| `DEVSPACE_LOG_FORMAT` | `json` |
| `DEVSPACE_LOG_REQUESTS` | `1` |
| `DEVSPACE_LOG_ASSETS` | `0` |
| `DEVSPACE_LOG_TOOL_CALLS` | `1` |
| `DEVSPACE_LOG_SHELL_COMMANDS` | `0` |
| `DEVSPACE_TRUST_PROXY` | `0` |

Set `DEVSPACE_LOG_FORMAT=pretty` for local debugging.

Set `DEVSPACE_LOG_SHELL_COMMANDS=1` only when you intentionally want command
previews in logs.

## Env-Only Example

```bash
DEVSPACE_OAUTH_OWNER_TOKEN="$(openssl rand -base64 32)" \
DEVSPACE_ALLOWED_ROOTS="$HOME/personal,$HOME/work" \
DEVSPACE_PUBLIC_BASE_URL="https://devspace.example.com" \
DEVSPACE_WORKTREE_ROOT="$HOME/.devspace/worktrees" \
DEVSPACE_TOOL_MODE="minimal" \
DEVSPACE_WIDGETS="full" \
npx @waishnav/devspace serve
```

The environment assignments must be part of the same command invocation, or
exported first.
