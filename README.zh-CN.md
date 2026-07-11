# AgentDesk

> 把 ChatGPT 变成你的本地 Windows 工程副驾驶。

AgentDesk 是基于 DevSpace 的 Windows-first 二次开发版本。它让 ChatGPT、Claude 或其他支持 MCP 的客户端安全连接到你的本地开发机器，并在原本的本地项目读写、搜索、运行命令能力之上，增强了端口、进程、代理、系统状态、个人 Skill、插件 manifest 和权限档位。

一句话：**不要只让 ChatGPT 写代码，要让它看懂你的电脑为什么炸了。**

## 为什么做 AgentDesk？

很多 Windows 开发问题不是“代码不会写”，而是：

```text
localhost 起不来
8080 被占用
Codex 一直 reconnect
代理端口不对
Node/Python/Docker 进程卡住
MCP 连接不上
```

AgentDesk 的目标就是让 ChatGPT 直接参与这些本地工程诊断。

## 主要特性

- **Windows-first 本地诊断**：系统摘要、代理状态、监听端口、进程搜索、受控结束进程。
- **权限档位**：`safe`、`dev`、`power`、`owner`。
- **个人 Skill Packs**：把你的常用工作流写成 `SKILL.md`，让 ChatGPT 自动遵循。
- **插件 manifest 系统**：声明本地工具能力，为后续插件生态打基础。
- **MCP 本地工作区**：允许 ChatGPT 在授权目录中读、改、查、运行项目。
- **安全默认值**：危险能力默认不开，结束进程必须 owner 模式 + 显式开关 + 精确确认短语。

## 和原版 DevSpace 的区别

| 方向 | 原版 DevSpace | AgentDesk |
| --- | --- | --- |
| 本地 MCP 工作区 | 支持 | 支持 |
| 代码读写搜索 | 支持 | 支持 |
| 权限档位 | 无 | 有 |
| 插件 manifest | 无 | 有 |
| Windows 本地诊断 | 弱 | 强化重点 |
| 端口/进程诊断 | 无 | 有 |
| 受控结束进程 | 无 | owner 模式下支持 |
| 个人 Skill 示例 | 较少 | 内置示例 |

## 快速开始

```bash
npm install -g agentdesk-mcp
agentdesk init
agentdesk serve
```

本地 MCP 地址：

```text
http://127.0.0.1:7676/mcp
```

如果连接 ChatGPT 网页端，一般需要通过 Cloudflare Tunnel、ngrok、Tailscale Funnel 等工具暴露 HTTPS 地址：

```text
https://your-tunnel-host.example.com/mcp
```

## Windows 推荐启动方式

普通深度诊断模式：

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="power"
$env:DEVSPACE_SYSTEM_TOOLS="1"
$env:DEVSPACE_TOOL_MODE="full"
agentdesk serve
```

允许受控结束进程：

```powershell
$env:DEVSPACE_PERMISSION_PROFILE="owner"
$env:DEVSPACE_SYSTEM_TOOLS="1"
$env:DEVSPACE_PROCESS_CONTROL="1"
$env:DEVSPACE_TOOL_MODE="full"
agentdesk serve
```

即使开启了进程控制，也必须传入精确确认短语，例如：

```text
KILL 1234
```

AgentDesk 会拒绝结束自己的进程和父进程。

## 适合做演示的问题

你可以这样问 ChatGPT：

```text
为什么我的 localhost:8080 打不开？帮我查一下。
```

理想流程：

```text
1. 打开项目工作区
2. 调用 system_ports 检查 8080
3. 找到占用 PID
4. 调用 system_find_process 查看进程名和命令
5. 给出解释和修复方案
6. 如需结束进程，在 owner 模式下要求确认 KILL <pid>
```

这就是最适合做 GIF 的场景。

## 路线图

- [x] 权限档位
- [x] 插件 manifest
- [x] 个人 Skill 示例
- [x] 系统摘要 / 代理诊断
- [x] 端口 / 进程诊断
- [x] 受控结束进程
- [ ] Docker 诊断
- [ ] Codex 修复医生
- [ ] 浏览器截图 / localhost 页面检测
- [ ] 真正的插件执行适配器
- [ ] Windows 一键安装向导

## 致谢

AgentDesk 基于 [Waishnav/devspace](https://github.com/Waishnav/devspace) 二次开发。原项目是一个优秀的自托管 MCP 本地工作区服务器，可以让 ChatGPT / Claude 以类似 Codex 的方式操作本地项目。

AgentDesk 保留原项目 MIT License 和署名，并专注于 Windows-first 本地诊断、权限档位、个人 Skill 和插件化自动化。

## 许可证

MIT。详见 [LICENSE](LICENSE)。
