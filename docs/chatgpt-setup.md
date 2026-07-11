# Connect AgentDesk to ChatGPT / GPT

This guide configures the AgentDesk fork in `G:\devspace-copt-lab\devspace` so a GPT/ChatGPT MCP client can call local tools, system diagnostics, and controlled Edge browser automation.

## 1. Choose a browser mode

### Recommended for normal testing: isolated mode

This starts a separate AgentDesk browser profile. It does not reuse your normal Edge login state.

```powershell
cd G:\devspace-copt-lab\devspace
.\scripts\start-agentdesk-isolated.ps1
```

### Full live Edge mode

This starts Microsoft Edge with your Edge user data directory and profile. Websites can see the login state stored in that Edge profile.

```powershell
cd G:\devspace-copt-lab\devspace
.\scripts\start-agentdesk-live-edge.ps1 -EdgeProfile Default
```

If your signed-in Edge profile is not `Default`, try:

```powershell
.\scripts\start-agentdesk-live-edge.ps1 -EdgeProfile "Profile 1"
.\scripts\start-agentdesk-live-edge.ps1 -EdgeProfile "Profile 2"
```

If Edge refuses to start with the live profile, close all Edge windows first. Edge may lock the profile while it is already open.

## 2. Expose AgentDesk to ChatGPT

AgentDesk listens locally at:

```text
http://127.0.0.1:7676/mcp
```

If your ChatGPT MCP client accepts local URLs in the desktop app, use that directly.

For ChatGPT web or remote MCP clients, expose AgentDesk through a tunnel you control. Example with Cloudflare Tunnel:

```powershell
cloudflared tunnel --url http://127.0.0.1:7676
```

Copy the HTTPS tunnel origin, for example:

```text
https://example-random.trycloudflare.com
```

Then restart AgentDesk with that public origin:

```powershell
cd G:\devspace-copt-lab\devspace
.\scripts\start-agentdesk-live-edge.ps1 -PublicBaseUrl "https://example-random.trycloudflare.com" -EdgeProfile Default
```

The MCP URL to paste into ChatGPT is then:

```text
https://example-random.trycloudflare.com/mcp
```

Do not include a trailing slash unless the ChatGPT UI requires it.

## 3. Add the MCP server in ChatGPT / GPT

The exact UI can vary by account, app version, and rollout. Look for a path similar to:

```text
ChatGPT Settings → Connectors / Apps / Developer mode → Add custom MCP server
```

Use:

```text
Name: AgentDesk
URL: https://your-tunnel-host.example.com/mcp
Authentication: OAuth / browser authorization page, if prompted
```

When ChatGPT connects, AgentDesk may show an owner approval page. Use the Owner password printed by `agentdesk init` or stored in:

```text
~/.devspace/auth.json
```

On Windows this usually maps to:

```text
C:\Users\<you>\.devspace\auth.json
```

Keep this password private.

## 4. Check OAuth discovery

If ChatGPT reports `does not implement OAuth`, first make sure you rebuilt and restarted AgentDesk after pulling the latest code:

```powershell
npm run build
.\scripts\start-agentdesk-live-edge.ps1 -PublicBaseUrl "https://your-tunnel-host.example.com" -EdgeProfile Default
```

Then run this in a second PowerShell:

```powershell
.\scripts\test-agentdesk-oauth.ps1 -PublicBaseUrl "https://your-tunnel-host.example.com"
```

The checker should show JSON for these discovery URLs:

```text
/.well-known/oauth-protected-resource
/.well-known/oauth-protected-resource/mcp
/.well-known/oauth-authorization-server
/mcp/.well-known/oauth-protected-resource
/mcp/.well-known/oauth-authorization-server
```

If those routes return 404 or HTML from another service, your tunnel is not pointing at the running AgentDesk process.

## 5. Test from ChatGPT

After adding AgentDesk, ask ChatGPT:

```text
Use AgentDesk. Open the workspace G:\devspace-copt-lab\devspace and list available tools.
```

Then test local diagnostics:

```text
Use AgentDesk to check my system summary and list listening ports.
```

Then test browser control in isolated mode:

```text
Use AgentDesk browser tools to open https://example.com and summarize the page.
```

Then test live Edge mode:

```text
Use AgentDesk browser tools to open https://github.com/lfake2320-collab/agentdesk and tell me whether the page appears signed in.
```

## 5. Important safety settings

The scripts deliberately set:

```text
DEVSPACE_PROCESS_CONTROL=0
```

This means AgentDesk can inspect processes but cannot kill them. Enable process control only for a short maintenance session.

Live Edge mode deliberately uses:

```text
DEVSPACE_BROWSER_MODE=live
DEVSPACE_BROWSER_USER_DATA_DIR=%LOCALAPPDATA%\Microsoft\Edge\User Data
DEVSPACE_BROWSER_PROFILE_DIRECTORY=Default
```

AgentDesk does not export cookie files. It starts/controls Edge with the selected profile so the browser itself uses the existing login state.

## 6. Quick command reference

Live Edge mode with public tunnel:

```powershell
cd G:\devspace-copt-lab\devspace
.\scripts\start-agentdesk-live-edge.ps1 -PublicBaseUrl "https://your-tunnel-host.example.com" -EdgeProfile Default
```

Isolated mode with public tunnel:

```powershell
cd G:\devspace-copt-lab\devspace
.\scripts\start-agentdesk-isolated.ps1 -PublicBaseUrl "https://your-tunnel-host.example.com"
```

Local-only isolated mode:

```powershell
cd G:\devspace-copt-lab\devspace
.\scripts\start-agentdesk-isolated.ps1
```

Local-only live Edge mode:

```powershell
cd G:\devspace-copt-lab\devspace
.\scripts\start-agentdesk-live-edge.ps1 -EdgeProfile Default
```
