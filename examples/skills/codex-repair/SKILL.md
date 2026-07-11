---
name: codex-repair
description: Diagnose and repair local Codex, DevSpace, MCP, proxy, npm, Node, port, and reconnect problems on a Windows developer machine.
---

# Codex Repair

Use this when the user reports Codex reconnect loops, MCP call failures, proxy problems, npm install failures, invalid config errors, port conflicts, or local DevSpace/Codex startup issues.

## Workflow

1. Identify the affected command, config file, port, proxy, and working directory.
2. Inspect configuration before changing it.
3. Prefer read-only diagnostics first: version checks, port checks, config validation, and recent logs.
4. Show a concise diagnosis and the smallest safe fix.
5. Do not stop processes, delete config, rotate tokens, or change global proxy settings without explicit user confirmation.

## Common checks

- `node --version`, `npm --version`
- `where codex`, `where node`, `where npm`
- `netstat -ano | findstr :<port>`
- proxy variables: `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`
- DevSpace/Codex config files under `.codex`, `.openai`, `.devspace`, or the project root
