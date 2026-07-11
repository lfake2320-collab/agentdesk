# Star Roadmap

This roadmap is written for growth: each milestone should create a visible reason for developers to star AgentDesk instead of treating it as a small fork.

## Positioning

AgentDesk is not just another DevSpace fork.

It is a Windows-first local AI engineering copilot:

```text
DevSpace gives ChatGPT a local workspace.
AgentDesk gives ChatGPT local engineering awareness.
```

## Target users

1. Windows developers using ChatGPT, Claude, Codex, or MCP.
2. Developers who often debug localhost, ports, proxy, Docker, or Node processes.
3. Users who want private, local-first AI workflows.
4. People who want personal skills and plugin-style automation.

## v0.1 — Windows-first preview

Goal: make the repository immediately understandable and demo-worthy.

- [x] Rename and position as AgentDesk.
- [x] Add permission profiles.
- [x] Add plugin manifest discovery.
- [x] Add personal Skill Pack examples.
- [x] Add system, proxy, port, and process diagnostics.
- [x] Add confirmation-gated process termination.
- [x] Add English README, Chinese README, demo script, security policy, changelog.
- [ ] Record README GIF.
- [ ] Publish first GitHub release.

## v0.2 — Codex and Windows repair doctor

Goal: solve the user's real recurring problems.

- [ ] `agentdesk doctor` command.
- [ ] Codex config checker.
- [ ] MCP endpoint checker.
- [ ] Proxy checker for Clash / localhost proxy setups.
- [ ] Node/npm/Python/Conda environment checker.
- [ ] Port ownership explanation.
- [ ] Windows PowerShell shell backend improvements.

## v0.3 — Docker diagnostics

Goal: attract backend and full-stack developers.

- [ ] `docker_ps`
- [ ] `docker_logs`
- [ ] `docker_compose_status`
- [ ] `docker_port_map`
- [ ] `docker_compose_restart_confirmed`
- [ ] Docker troubleshooting Skill Pack

## v0.4 — Browser and localhost checks

Goal: attract frontend developers.

- [ ] Browser open/check page tool.
- [ ] Screenshot local page.
- [ ] Detect common frontend dev-server errors.
- [ ] Check HTTP status for localhost routes.
- [ ] Playwright-based optional plugin.

## v0.5 — Real plugin adapter

Goal: make AgentDesk extensible.

- [ ] Plugin tool registration API.
- [ ] Plugin permission declarations.
- [ ] Plugin enable/disable commands.
- [ ] Plugin template generator.
- [ ] Windows tools plugin.
- [ ] Docker plugin.
- [ ] Browser plugin.

## v1.0 — Friendly distribution

Goal: reduce setup friction.

- [ ] `npm install -g agentdesk-mcp`
- [ ] `agentdesk init`
- [ ] `agentdesk serve`
- [ ] `agentdesk doctor`
- [ ] Windows quick-start guide.
- [ ] One-command demo.
- [ ] Release assets and screenshots.

## README growth checklist

- [ ] First-screen tagline is clear.
- [ ] GIF appears above the fold.
- [ ] Install command is copy-pasteable.
- [ ] Differentiation from DevSpace is explicit.
- [ ] Safety model is visible.
- [ ] Roadmap is ambitious but believable.
- [ ] Credits to upstream are clear.
- [ ] GitHub topics include `mcp`, `chatgpt`, `windows`, `developer-tools`, `ai-agent`, `local-first`.

## Launch post template

```text
I built AgentDesk, a Windows-first DevSpace fork that lets ChatGPT debug your local dev environment through MCP.

It can inspect ports, processes, proxy settings, system state, and project files — with permission profiles and confirmation-gated process control.

GitHub: <repo url>
```

## Star-worthy demo prompts

```text
Why is localhost:8080 not working? Check ports, processes, proxy settings, and this project before suggesting a fix.
```

```text
Open this project and explain whether it is safe to stop the process occupying port 3000.
```

```text
Diagnose why Codex keeps reconnecting on my machine. Check proxy environment variables, local MCP ports, and related processes.
```
