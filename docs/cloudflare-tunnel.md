# Cloudflare Tunnel 配置指南

这份文档解释 AgentDesk 设置向导里的 Cloudflare Tunnel 字段到底从哪里来。目标是把：

```text
https://agentdesk.example.com
```

转发到本机：

```text
http://127.0.0.1:7875
```

这样 ChatGPT 网页端才能访问你的本地 MCP 服务：

```text
https://agentdesk.example.com/mcp
```

## 1. 什么时候需要 Cloudflare Tunnel

| 场景 | 是否需要 |
| --- | --- |
| 只在电脑本机测试 `http://127.0.0.1:7875` | 不需要 |
| 让 ChatGPT 网页端连接 AgentDesk | 需要公网 HTTPS，推荐 Cloudflare Tunnel |
| 手机访问公网状态页 / 文件浏览器 | 需要 |

## 2. 安装并登录 cloudflared

先确认：

```powershell
cloudflared --version
```

如果没有安装，先安装 cloudflared。

登录 Cloudflare：

```powershell
cloudflared tunnel login
```

它会打开浏览器，让你选择 Cloudflare 账号和域名。

## 3. 创建 named tunnel

推荐名称：

```powershell
cloudflared tunnel create agentdesk
```

成功后会看到类似输出：

```text
Created tunnel agentdesk with id e80a8157-1111-2222-3333-abcdefabcdef
Credentials written to C:\Users\you\.cloudflared\e80a8157-1111-2222-3333-abcdefabcdef.json
```

这里有两个设置向导要填的东西：

```text
Tunnel ID：e80a8157-1111-2222-3333-abcdefabcdef
credentials-file：C:\Users\you\.cloudflared\e80a8157-1111-2222-3333-abcdefabcdef.json
```

## 4. 准备 hostname

假设你想用：

```text
agentdesk.example.com
```

那设置向导里填：

```text
公网域名 Hostname：agentdesk.example.com
Public Base URL：https://agentdesk.example.com
```

注意：

```text
Public Base URL 不要填 /mcp
正确：https://agentdesk.example.com
错误：https://agentdesk.example.com/mcp
```

## 5. 创建 DNS 路由

执行：

```powershell
cloudflared tunnel route dns agentdesk agentdesk.example.com
```

把 `agentdesk.example.com` 换成你的真实子域名。

## 6. 设置向导里怎么填

| 字段 | 示例 |
| --- | --- |
| Public Base URL | `https://agentdesk.example.com` |
| 启用固定公网域名 Tunnel | 勾选 |
| Tunnel 名称 | `agentdesk` |
| Tunnel ID | `e80a8157-1111-2222-3333-abcdefabcdef` |
| 公网域名 Hostname | `agentdesk.example.com` |
| credentials-file 路径 | `C:\Users\you\.cloudflared\e80a8157-1111-2222-3333-abcdefabcdef.json` |

设置向导会生成：

```text
.agentdesk-fixed-runtime\agentdesk-cloudflared.yml
```

内容类似：

```yaml
tunnel: e80a8157-1111-2222-3333-abcdefabcdef
credentials-file: C:\Users\you\.cloudflared\e80a8157-1111-2222-3333-abcdefabcdef.json
protocol: quic
ingress:
  - hostname: agentdesk.example.com
    service: http://127.0.0.1:7875
  - service: http_status:404
```

## 7. 启动和自启

设置向导安装完成后，会注册计划任务：

```text
AgentDesk Fixed MCP
AgentDesk Named Tunnel
```

你也可以手动启动：

```powershell
Start-ScheduledTask -TaskName "AgentDesk Fixed MCP"
Start-ScheduledTask -TaskName "AgentDesk Named Tunnel"
```

查看状态：

```powershell
Get-ScheduledTask -TaskName "AgentDesk Fixed MCP","AgentDesk Named Tunnel" | Select-Object TaskName,State
```

## 8. 验证

先测本机：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:7875/healthz
```

再测公网：

```powershell
Invoke-WebRequest -UseBasicParsing https://agentdesk.example.com/healthz
```

浏览器打开：

```text
https://agentdesk.example.com/status
```

如果 `/healthz` 是 200，说明隧道通了。

`/mcp` 未登录时返回 401 是正常的，代表服务在保护 MCP 入口。

## 9. ChatGPT 连接填写

ChatGPT 连接器里填：

```text
名称：AgentDesk
Server URL：https://agentdesk.example.com/mcp
认证方式：OAuth
```

授权页面出现后，输入 Owner Token。

## 10. 常见坑

### Public Base URL 填错

正确：

```text
https://agentdesk.example.com
```

错误：

```text
https://agentdesk.example.com/mcp
```

### tunnel 指到了错误端口

AgentDesk 固定线路默认是：

```text
127.0.0.1:7875
```

不是旧的 `7676`。

### DNS 路由没有创建

执行：

```powershell
cloudflared tunnel route dns agentdesk agentdesk.example.com
```

### credentials-file 不存在

检查：

```powershell
Test-Path "C:\Users\you\.cloudflared\<tunnel-id>.json"
```

### cloudflared 没有登录正确账号

重新登录：

```powershell
cloudflared tunnel login
```

## 11. 先跳过也没关系

第一次安装时可以不启用 Cloudflare Tunnel。你可以先跑通：

```text
http://127.0.0.1:7875/console
```

确认本地服务没问题后，再回来配置公网域名。
