# Security Policy

AgentDesk exposes local development capabilities over MCP. Treat it as remote access to your computer.

## Supported versions

AgentDesk is currently pre-1.0. Security fixes should target the latest `main` branch unless a release branch exists.

## Security model

AgentDesk uses several layers:

1. **Allowed roots**: only approved filesystem roots may be opened as workspaces.
2. **OAuth owner approval**: MCP clients must complete the owner approval flow.
3. **Host allowlist**: the server restricts expected hosts unless explicitly overridden.
4. **Permission profiles**: the model receives explicit guidance for `safe`, `dev`, `power`, and `owner` sessions.
5. **System tool gating**: system diagnostic tools are enabled by default only for `power` and `owner` profiles.
6. **Process control gating**: process termination requires `owner`, `DEVSPACE_PROCESS_CONTROL=1`, and exact confirmation.

## High-risk settings

Avoid these unless you fully understand the risk:

```text
DEVSPACE_ALLOWED_ROOTS=C:\
DEVSPACE_ALLOWED_ROOTS=/
DEVSPACE_ALLOWED_HOSTS=*
DEVSPACE_PERMISSION_PROFILE=owner
DEVSPACE_PROCESS_CONTROL=1
```

Use narrow roots such as:

```text
C:\Users\you\Projects
G:\Projects
```

## Process control safety

`system_kill_process_confirmed` is intentionally difficult to call accidentally.

It requires:

```text
DEVSPACE_PERMISSION_PROFILE=owner
DEVSPACE_PROCESS_CONTROL=1
confirmationPhrase = KILL <pid>
```

AgentDesk refuses to kill:

- its own process
- its parent process

## Reporting vulnerabilities

Open a private security advisory if your GitHub repository supports it. Otherwise, create an issue with minimal reproduction details and avoid posting secrets, tokens, private paths, or exploit chains that could harm users.

Include:

- AgentDesk version or commit
- OS and Node.js version
- configuration relevant to the issue
- minimal reproduction steps
- expected and actual behavior

## Responsible disclosure

Please give maintainers reasonable time to investigate and patch security issues before public disclosure.

## Credits

AgentDesk is based on Waishnav/devspace. Security reports that affect upstream DevSpace should also be responsibly reported upstream.
