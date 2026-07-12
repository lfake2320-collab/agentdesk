# AgentDesk 发布检查清单

这份清单用于把当前仓库从“能跑”推进到“可以给别人下载测试”。

## 1. 版本定位

当前版本：

```text
v0.1.0 Windows-first Preview
```

定位：

```text
Windows-first 本地 MCP 工程副驾驶内测版
```

不是完整商业安装器，也不是无脑双击全自动产品。它面向愿意安装 Git、Node.js、cloudflared 的测试用户。

## 2. 发布前必须通过

在项目根目录运行：

```powershell
.\scripts\verify-first-clone.ps1
```

等价核心检查：

```powershell
npm install
npm test
npm run typecheck
npm run build
```

必须确认：

```text
npm test 通过
npm run typecheck 通过
npm run build 通过
dist\cli.js 存在
Start-AgentDesk.cmd 存在
scripts\setup-wizard.mjs 存在
```

## 3. 小白安装验收路径

从一个新目录重新 clone：

```powershell
git clone https://github.com/lfake2320-collab/agentdesk.git
cd agentdesk
.\scripts\verify-first-clone.ps1 -SkipTests
Start-AgentDesk.cmd
```

验收点：

```text
浏览器自动打开 http://127.0.0.1:7876/
默认 allowed roots 不包含 C:\、D:\、G:\ 整盘根目录
点击安装后能生成 .agentdesk-fixed-runtime
本机 http://127.0.0.1:7875/healthz 返回 200
本机 http://127.0.0.1:7875/console 可打开
```

## 4. Cloudflare Tunnel 验收路径

参考：

```text
docs/cloudflare-tunnel.md
```

验收点：

```text
.agentdesk-fixed-runtime\agentdesk-cloudflared.yml 生成正确
公网 https://你的域名/healthz 返回 200
公网 https://你的域名/status 可打开
公网 https://你的域名/mcp 未登录时返回 401
ChatGPT OAuth 授权页可打开
ChatGPT MCP session 可创建
```

## 5. 打包 release zip

生成 Windows source release zip：

```powershell
.\scripts\create-release-zip.ps1 -Version 0.1.0
```

输出：

```text
release\agentdesk-v0.1.0-windows-source.zip
```

zip 不应包含：

```text
node_modules
.git
.agentdesk-fixed-runtime
任何 token
任何 Cloudflare credentials json
```

## 6. GitHub Release 文案

标题：

```text
AgentDesk v0.1.0 — Windows-first Preview
```

建议正文：

```markdown
AgentDesk v0.1.0 is the first Windows-first preview for connecting ChatGPT to a local Windows development machine through MCP.

Highlights:
- First-run setup wizard through Start-AgentDesk.cmd
- Local control center at http://127.0.0.1:7875/console
- Fixed AgentDesk MCP line on port 7875
- Optional Cloudflare named tunnel support
- Safer default allowed roots
- Windows hidden scheduled tasks
- System, proxy, port, and process diagnostics
- Browser automation support when explicitly enabled

Start here:
- docs/first-clone-windows.md
- docs/cloudflare-tunnel.md
```

## 7. 发布后验证

发布后用一个干净目录重新下载 zip 或 clone 仓库，至少跑一遍：

```powershell
.\scripts\verify-first-clone.ps1 -SkipTests
Start-AgentDesk.cmd
```

再检查 GitHub 上 README 里的安装路径是否仍然准确。
