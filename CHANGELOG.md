# Changelog

All notable AgentDesk changes will be documented in this file.

## 0.1.0 — Windows-first preview

### Added

- Rebranded the fork as AgentDesk.
- Added permission profiles: `safe`, `dev`, `power`, and `owner`.
- Added plugin manifest discovery.
- Added personal Skill Pack examples.
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

### Safety

- System diagnostic tools are enabled by default only for `power` and `owner` profiles.
- Process control is disabled by default.
- Process termination requires `owner` profile, `DEVSPACE_PROCESS_CONTROL=1`, and exact confirmation.
- AgentDesk refuses to kill its own process or parent process.

### Credits

AgentDesk is based on Waishnav/devspace and preserves the upstream MIT license.
