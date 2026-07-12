# Changelog

All notable AgentDesk changes will be documented in this file.

## 0.1.0 — Windows-first preview

### Added

- Rebranded the fork as AgentDesk.
- Added first-run Windows setup wizard launched by `Start-AgentDesk.cmd`.
- Added fixed AgentDesk MCP line on port `7875`.
- Added local control center and public status pages.
- Added hidden Windows scheduled tasks for fixed MCP and optional named tunnel startup.
- Added Cloudflare named tunnel setup support.
- Added beginner clone guide: `docs/first-clone-windows.md`.
- Added Cloudflare Tunnel guide: `docs/cloudflare-tunnel.md`.
- Added release checklist: `docs/release-checklist.md`.
- Added fresh-clone verification script: `scripts/verify-first-clone.ps1`.
- Added Windows source release zip script: `scripts/create-release-zip.ps1`.
- Added permission profiles: `safe`, `dev`, `power`, and `owner`.
- Added plugin manifest discovery.
- Added personal Skill Pack examples.
- Added controlled browser automation tools when explicitly enabled.
- Added system diagnostic tools:
  - `system_summary`
  - `system_proxy_status`
  - `system_ports`
  - `system_doctor`
  - `system_processes`
  - `system_find_process`
  - `system_kill_process_confirmed`
- Added confirmation-gated process control with `DEVSPACE_PROCESS_CONTROL=1` and `KILL <pid>` phrases.
- Added Windows-first plugin example under `examples/plugins/windows-tools`.
- Added Codex repair Skill Pack example under `examples/skills/codex-repair`.
- Added English README, Chinese README, getting-started guide, demo script, star roadmap, security policy, and contribution guide.

### Changed

- Updated README and Chinese README to prioritize the first-clone Windows install path.
- Updated getting-started docs to use the fixed `7875` AgentDesk line instead of the older `7676` examples.
- Changed first-run allowed-roots defaults to use the current AgentDesk repo plus `Documents\AgentDesk-Workspaces`.
- Added wide-root acknowledgement when users try to expose drive roots or the full user home directory.
- Raised Vite chunk warning limit to match the current bundled editor/highlighter assets and avoid noisy preview builds.

### Safety

- System diagnostic tools are enabled by default only for `power` and `owner` profiles.
- Process control is disabled by default.
- Process termination requires `owner` profile, `DEVSPACE_PROCESS_CONTROL=1`, and exact confirmation.
- AgentDesk refuses to kill its own process or parent process.
- New setup defaults avoid whole-drive allowed roots unless the user explicitly acknowledges the risk.

### Credits

AgentDesk is based on Waishnav/devspace and preserves the upstream MIT license.
