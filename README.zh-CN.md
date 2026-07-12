# AgentDesk

> 把 ChatGPT 或 Claude 变成类似 Codex / Claude Code 的 Windows 本地编程 Agent。

AgentDesk 是一个 Windows-first 本地 MCP 服务，可以让 ChatGPT、Claude 或其他支持 MCP 的客户端安全连接到你的真实 Windows 电脑。它能给你的 AI 助手加上类似 Codex、Claude Code、Cursor Agent 的本地工程能力：打开项目、读文件、改代码、跑测试、查端口、看进程、检查代理、操控 Edge，并帮你诊断 localhost、Node、Docker、Codex、MCP 连接这类本地开发问题。

**搜索关键词：** ChatGPT MCP 本地编程 Agent、Claude MCP Server、Claude Code 类似工具、Codex 类似工具、Windows AI 编程助手、本地 MCP 工作区、AI Agent 改代码、ChatGPT 连接本地文件、Claude 操作本地终端。

说明：AgentDesk 不是 OpenAI Codex 或 Anthropic Claude Code 的官方产品，而是一个独立的 MCP 桥接工具，用来把类似的本地编程 Agent 工作流接入 ChatGPT、Claude 和其他 MCP 客户端。

一句话：**不要只让 ChatGPT 写代码，要让它看懂你的电脑为什么炸了。**

## 第一次 clone 的小白路线

最短流程已经改成真正的一键入口：

```text
双击：Start-AgentDesk.cmd
```

如果你在 `G:\devspace-copt-lab` 这一层，也可以双击外层入口：

```text
一键启动-AgentDesk.cmd
```

这个入口会自动判断当前状态：

| 情况 | 它会怎么做 |
| --- | --- |
| AgentDesk 已经活着 | 只打开控制台，不重复折腾 |
| 缺少 node_modules | 自动执行 `npm install` |
| 缺少 dist 构建 | 自动执行 `npm run build` |
| 后台任务没启动 | 自动注册并启动 `AgentDesk Fixed MCP` |
| 首次没有配置 | 自动写入默认配置，再拉起服务 |
| 启动失败 | 显示端口占用、日志目录，并打开设置向导 |
| 自定义凭据 | 只要求非空，不再检查长度、字符种类或重复字符 |

一句话：现在不是“照着教程敲命令”，而是“你双击，它自己体检、自己穿衣服、自己出门”。

完整教程仍然放在：

```text
docs/first-clone-windows.md
```

账号与收费高级功能机制见：

```text
docs/commercial-features.md
```

高级设置向导地址：

```text
http://127.0.0.1:7876/
```

设置向导里也新增了 **小白极速安装：用推荐配置直接启动** 按钮。你不想看参数，就点它；想微调，再用高级安装。

安装完成后的常用地址：

```text
本机控制台：http://127.0.0.1:7875/console
健康检查：http://127.0.0.1:7875/healthz
本机 MCP：http://127.0.0.1:7875/mcp
```

首次 clone 后仍然可以跑验收脚本：

```powershell
.\scripts\verify-first-clone.ps1 -SkipTests
```

## 连接 ChatGPT

ChatGPT 网页端通常不能直接访问你的 `127.0.0.1`，所以要用公网 HTTPS 隧道。推荐 Cloudflare Tunnel。

Cloudflare 填写教程：

```text
docs/cloudflare-tunnel.md
```

ChatGPT 连接器里填：

```text
名称：AgentDesk
Server URL：https://你的域名/mcp
认证方式：OAuth
```

设置向导里的 `Public Base URL` 不要带 `/mcp`。

正确：

```text
https://agentdesk.example.com
```

错误：

```text
https://agentdesk.example.com/mcp
```

## allowed roots 怎么填

allowed roots 是 ChatGPT 能访问的本地目录范围。

推荐：

```text
C:\Users\你\Documents\AgentDesk-Workspaces
D:\Code\某个具体项目
G:\devspace-copt-lab\devspace
```

不推荐：

```text
C:\
D:\
G:\
C:\Users\你
```

首次设置向导默认只放：

```text
当前 AgentDesk 项目目录
Documents\AgentDesk-Workspaces
```

如果你强行添加 `C:\`、`D:\`、`G:\` 这种整盘根目录，向导会要求你勾选风险确认框。别把整台电脑都塞进来，不然权限就像裤腰带没系，风一吹很尴尬。

## AgentDesk 主要能力

| 能力 | 说明 |
| --- | --- |
| 本地 MCP 工作区 | 读、搜、改、写、运行命令 |
| Windows 诊断 | 系统摘要、代理、端口、进程、doctor 检查 |
| 权限档位 | `safe`、`dev`、`power`、`owner` |
| 进程控制 | owner 模式下显式启用，且必须确认 `KILL <pid>` |
| 浏览器控制 | 可选 isolated/live Edge 自动化 |
| 首次设置向导 | 双击 `Start-AgentDesk.cmd` 打开网页配置 |
| 公网访问 | 支持 Cloudflare named tunnel |
| 隐藏自启 | Windows 计划任务后台启动 |
| 发布打包 | release zip 脚本和发布检查清单 |

## 常用命令

```powershell
npm test
npm run typecheck
npm run build
npm run verify:first-clone
npm run release:zip
```

生成 Windows source release zip：

```powershell
.\scripts\create-release-zip.ps1 -Version 0.1.0
```

发布检查清单：

```text
docs/release-checklist.md
```

## 文档入口

- [Windows 首次 clone 安装指南](docs/first-clone-windows.md)
- [Cloudflare Tunnel 配置指南](docs/cloudflare-tunnel.md)
- [发布检查清单](docs/release-checklist.md)
- [Getting Started](docs/getting-started.md)
- [配置参考](docs/configuration.md)
- [ChatGPT 设置](docs/chatgpt-setup.md)
- [安全说明](SECURITY.md)
- [更新日志](CHANGELOG.md)

## 适合测试的问题

连接成功后，可以问 ChatGPT：

```text
@AgentDesk 打开我的项目，帮我检查 npm test 为什么失败
```

或者：

```text
@AgentDesk 为什么我的 localhost:8080 打不开？请检查端口、进程、代理和项目脚本
```

理想流程：

```text
1. 打开工作区
2. 读取项目配置和脚本
3. 检查端口
4. 找到占用进程
5. 解释原因
6. 风险操作前先问你确认
```

## 安全模型

AgentDesk 本质上是把本地开发能力暴露给 MCP 客户端。请把它当成“远程访问你的电脑”。

建议：

```text
allowed roots 尽量窄
Owner Token 不要发给别人
公网访问必须走你信任的隧道
不需要时不要开启进程控制
```

结束进程必须同时满足：

```text
DEVSPACE_PERMISSION_PROFILE=owner
DEVSPACE_PROCESS_CONTROL=1
精确确认短语：KILL <pid>
```

AgentDesk 会拒绝结束自己的进程和父进程。

## 当前状态

当前版本：

```text
v0.1.0 Windows-first Preview
```

它已经适合从 GitHub clone 后安装测试，但还不是商业级无脑安装器。现在的目标是让 Windows 用户能顺利完成：

```text
clone → build → 设置向导 → healthz → Cloudflare → ChatGPT MCP 连接
```

## 致谢

AgentDesk 基于 [Waishnav/devspace](https://github.com/Waishnav/devspace) 二次开发。

本 fork 专注于 Windows-first 本地诊断、首次安装向导、权限档位、个人 Skill 和插件化自动化。

## 许可证

MIT。详见 [LICENSE](LICENSE)。
