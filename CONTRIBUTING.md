# Contributing to AgentDesk

Thanks for helping improve AgentDesk.

AgentDesk is a Windows-first, local-first MCP engineering copilot built from DevSpace. Contributions should preserve safety, local control, and clear user consent.

## Development setup

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/agentdesk.git
cd agentdesk
npm install
npm run typecheck
npm run build
```

Run focused tests:

```bash
npx tsx src/config.test.ts
npx tsx src/plugins.test.ts
npx tsx src/system-tools.test.ts
```

Run the full test suite:

```bash
npm test
```

## Contribution priorities

Good first areas:

- Windows diagnostics
- Docker diagnostics
- Codex / MCP repair checks
- Skill Pack examples
- Plugin manifest examples
- Documentation and demo improvements

High-impact areas:

- `agentdesk doctor`
- Docker plugin tools
- Browser/localhost diagnostics
- Trusted plugin execution adapter
- Windows installation experience

## Safety rules

Do not add features that:

- expose broad filesystem roots by default
- execute arbitrary plugin code without explicit trust boundaries
- terminate processes without confirmation
- read credentials, cookies, browser profiles, SSH keys, or `.env` secrets by default
- encourage users to expose AgentDesk directly to the public internet without authentication

Dangerous tools must be:

1. opt-in
2. documented
3. permission-gated
4. confirmation-gated when destructive
5. tested

## Code style

- Prefer TypeScript types over loose objects.
- Keep platform-specific parsing functions testable.
- Prefer structured MCP tools over asking the model to run shell commands.
- Keep shell usage explicit and minimal.
- Redact secrets in diagnostics.

## Documentation expectations

For new user-facing features, update at least one of:

- `README.md`
- `README.zh-CN.md`
- `docs/configuration.md`
- `docs/getting-started.md`
- `docs/demo-script.md`
- `docs/star-roadmap.md`

## Pull request checklist

- [ ] Typecheck passes.
- [ ] Relevant focused tests pass.
- [ ] Documentation updated.
- [ ] Safety impact considered.
- [ ] Credits and upstream compatibility respected.

## Upstream credit

AgentDesk is based on Waishnav/devspace. Keep upstream license and credit intact.
