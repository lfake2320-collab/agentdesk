# AgentDesk Demo Script

Use this script to record the first GIF or short video for the README.

## Goal

Show that AgentDesk lets ChatGPT diagnose a real Windows localhost problem instead of only suggesting generic commands.

## Setup

1. Start AgentDesk in power mode:

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="power"
$env:DEVSPACE_SYSTEM_TOOLS="1"
$env:DEVSPACE_TOOL_MODE="full"
agentdesk serve
```

2. Start any local dev server on a common port such as `8080` or `3000`.

3. Connect ChatGPT or another MCP host to AgentDesk.

## Prompt

```text
My localhost:8080 is not working. Open my project and diagnose it. Check the project, ports, processes, and proxy settings before giving advice.
```

## Ideal tool sequence

1. `open_workspace`
2. `read` / `grep` / `glob` to inspect scripts and project structure
3. `system_ports` with `port=8080`
4. `system_find_process` for the PID returned by the port scan
5. `system_proxy_status`
6. Final explanation with concrete next steps

## Optional owner-mode extension

Start AgentDesk with process control:

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="owner"
$env:DEVSPACE_SYSTEM_TOOLS="1"
$env:DEVSPACE_PROCESS_CONTROL="1"
agentdesk serve
```

Then ask:

```text
If the process occupying 8080 is safe to stop, ask me for confirmation and then stop it.
```

The tool must receive an exact confirmation phrase:

```text
KILL <pid>
```

## GIF storyboard

| Scene | What to show |
| --- | --- |
| 1 | User asks why localhost is broken. |
| 2 | AgentDesk opens the workspace. |
| 3 | AgentDesk checks `system_ports`. |
| 4 | AgentDesk finds the PID and process. |
| 5 | AgentDesk explains the cause. |
| 6 | Optional: owner-mode confirmation before killing the process. |

## README caption

```text
AgentDesk lets ChatGPT debug your local Windows dev environment: ports, processes, proxy settings, and project scripts through MCP.
```

## Recording tips

- Keep the terminal font large.
- Use a small project to keep the demo fast.
- Blur usernames, project names, tokens, and private paths if needed.
- Keep the GIF under 20 seconds.
- Put the final file at `docs/assets/agentdesk-demo.gif`.
