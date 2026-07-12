# Windows 小白首次 clone 安装指南

这份文档假设你是第一次从 GitHub 克隆 AgentDesk，目标是把 ChatGPT 连接到你的 Windows 电脑，让它能在你允许的目录里读文件、改代码、跑测试、查端口和诊断本地环境。

## 0. 你最终会得到什么

安装完成后，你会有这些地址：

```text
本机控制台：http://127.0.0.1:7875/console
本机健康检查：http://127.0.0.1:7875/healthz
本机 MCP 地址：http://127.0.0.1:7875/mcp
公网 MCP 地址：https://你的域名/mcp
```

ChatGPT 网页端通常不能直接访问你的 `127.0.0.1`，所以要接入 ChatGPT，推荐再配置 Cloudflare Tunnel，把 `https://你的域名` 转发到本机 `http://127.0.0.1:7875`。

## 1. 安装前准备

先安装这些东西：

| 工具 | 用途 | 检查命令 |
| --- | --- | --- |
| Git | 克隆 GitHub 仓库 | `git --version` |
| Node.js 22.19 或更新版本 | 运行 AgentDesk | `node -v` |
| npm | 安装依赖和构建 | `npm -v` |
| PowerShell | 运行 Windows 脚本 | Windows 自带 |
| cloudflared，可选 | 给 ChatGPT 提供公网 HTTPS 地址 | `cloudflared --version` |

Node.js 版本必须满足：

```text
>=22.19 <27
```

## 2. 克隆项目

打开 PowerShell，执行：

```powershell
git clone https://github.com/lfake2320-collab/agentdesk.git
cd agentdesk
```

## 3. 第一次安装依赖并构建

```powershell
npm install
npm run build
```

构建成功后，项目里会出现 `dist` 目录。

你也可以运行完整检查：

```powershell
.\scripts\verify-first-clone.ps1
```

如果只想检查环境，不跑测试：

```powershell
.\scripts\verify-first-clone.ps1 -SkipTests
```

## 4. 打开首次设置向导

双击项目根目录里的：

```text
Start-AgentDesk.cmd
```

它会打开：

```text
http://127.0.0.1:7876/
```

这是首次设置向导，不是正式 MCP 服务端口。正式服务默认是 `7875`。

## 5. 设置向导怎么填

### 5.1 基础服务

| 字段 | 推荐值 | 说明 |
| --- | --- | --- |
| 本地端口 | `7875` | AgentDesk 正式服务端口 |
| Public Base URL | 本地测试填 `http://127.0.0.1:7875`；接 ChatGPT 填 `https://你的域名` | 不要在末尾加 `/mcp` |
| Edge Profile | `Default` | 用默认 Edge 配置即可 |
| 浏览器调试端口 | `9342` | 浏览器控制功能使用 |

### 5.2 安全凭据

Owner Token 和文件浏览器密码可以留空，向导会自动生成强随机值。

### 5.3 允许访问目录 allowed roots

默认值会是：

```text
当前 agentdesk 项目目录
C:\Users\你的用户名\Documents\AgentDesk-Workspaces
```

建议你把以后要给 ChatGPT 操作的项目都放进：

```text
Documents\AgentDesk-Workspaces
```

不要直接填这些：

```text
C:\
D:\
G:\
C:\Users\你的用户名
```

如果你强行填整盘根目录，向导会要求你勾选风险确认框。

### 5.4 Cloudflare Tunnel，可选

第一次可以先不启用，先把本机控制台跑通。

要接入 ChatGPT 网页端，再参考：

```text
docs/cloudflare-tunnel.md
```

### 5.5 安装动作

保持默认勾选：

```text
运行 npm install
运行 npm run build
```

然后点：

```text
开始安装并启动 AgentDesk
```

向导会自动注册 Windows 隐藏计划任务：

```text
AgentDesk Fixed MCP
AgentDesk Named Tunnel，如果你启用了 Tunnel
```

## 6. 验证是否启动成功

打开：

```text
http://127.0.0.1:7875/healthz
```

看到 `ok` 或 HTTP 200，就说明本机服务起来了。

再打开控制台：

```text
http://127.0.0.1:7875/console
```

控制台里会显示 MCP URL、状态、allowed roots、日志和常用操作。

## 7. 连接 ChatGPT

在 ChatGPT 的 MCP/连接器设置中新增：

```text
名称：AgentDesk
Server URL：https://你的域名/mcp
认证方式：OAuth
```

然后浏览器会跳转到 AgentDesk 授权页面，输入 Owner Token。

连接成功后，你可以问：

```text
@AgentDesk 打开我的项目，帮我检查 npm test 为什么失败
```

或者：

```text
@AgentDesk 为什么我的 localhost:8080 打不开？请检查端口、进程和项目脚本
```

## 8. 常见错误

### node 版本太低

现象：`npm install` 或 `npm run build` 报 Node 版本不符合。

解决：安装 Node.js 22.19 或更新版本。

### healthz 打不开

检查：

```powershell
Get-NetTCPConnection -LocalPort 7875 -ErrorAction SilentlyContinue
```

如果端口被占用，换端口或结束占用进程。

### ChatGPT 连不上

优先检查：

```text
https://你的域名/healthz
https://你的域名/.well-known/openid-configuration
https://你的域名/mcp
```

`/mcp` 未登录时返回 401 是正常的；完全访问不了才是隧道问题。

### Cloudflare 配置看不懂

看：

```text
docs/cloudflare-tunnel.md
```

## 9. 一句话流程

```text
安装 Git/Node → git clone → npm install → npm run build → 双击 Start-AgentDesk.cmd → 设置 allowed roots → 启动 7875 → 配 Cloudflare → ChatGPT 填 https://你的域名/mcp
```
