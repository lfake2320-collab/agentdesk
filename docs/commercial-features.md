# AgentDesk 账号与收费功能机制

AgentDesk 可以发布在 GitHub 上，同时保留一套账号 / 授权门控机制，用来控制部分高级功能。

## 现实边界

如果项目完整开源，任何人都可以 fork 后删除本地门控代码。因此，本仓库内置的是“客户端授权框架”，不是不可绕过的 DRM。

更可靠的商业模式是：

1. AgentDesk 本体保持开源，方便传播和安装。
2. 付费、续费、退款、订单管理放到你的服务端。
3. 服务端向用户发放 license / account plan。
4. 本地 AgentDesk 读取 license，然后启用对应高级功能。
5. 真正无法开源的云端能力、模型额度、同步服务、团队后台等放在服务端。

一句话：GitHub 上放壳和本地执行器，收费价值尽量放在你控制的服务端。

## 启用账号门控

默认不开启账号门控，所有功能按开发者模式放行：

```powershell
$env:DEVSPACE_ACCOUNT_GATING = "0"
```

开启门控：

```powershell
$env:DEVSPACE_ACCOUNT_GATING = "1"
```

开启后，如果没有 plan 或 license，高级功能按 `free` 处理。

## 账号和 license 环境变量

| 变量 | 说明 |
| --- | --- |
| `DEVSPACE_ACCOUNT_GATING` | 是否启用账号 / 授权门控，`1` 开启，`0` 关闭 |
| `DEVSPACE_ACCOUNT_ID` | 用户账号 ID，例如 `user_123` |
| `DEVSPACE_ACCOUNT_EMAIL` | 用户邮箱 |
| `DEVSPACE_ACCOUNT_PLAN` / `DEVSPACE_LICENSE_PLAN` | 账号方案：`free`、`pro`、`team`、`enterprise`、`lifetime` |
| `DEVSPACE_LICENSE_KEY` | 授权码，本地只在状态页显示指纹 |
| `DEVSPACE_LICENSE_FEATURES` | 额外解锁的功能，逗号分隔或换行分隔 |
| `DEVSPACE_PREMIUM_FEATURES` | 哪些功能属于付费功能；留空使用默认付费列表 |
| `DEVSPACE_LICENSE_EXPIRES_AT` | 到期时间，例如 `2027-01-01T00:00:00Z` |
| `DEVSPACE_LICENSE_FILE` | 可选，本地 license JSON 文件路径 |

## 本地 license 文件格式

```json
{
  "accountId": "user_123",
  "email": "buyer@example.com",
  "plan": "pro",
  "licenseKey": "license-from-your-server",
  "features": ["browser_tools", "plugins"],
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

启动时指定：

```powershell
$env:DEVSPACE_ACCOUNT_GATING = "1"
$env:DEVSPACE_LICENSE_FILE = "C:\\Users\\you\\.agentdesk-license.json"
```

## 可门控功能

| 功能 ID | 显示名称 | 默认是否属于付费功能 |
| --- | --- | --- |
| `public_file_browser` | 公网文件浏览器 | 是 |
| `browser_tools` | 浏览器工具 | 是 |
| `system_tools` | 系统工具 | 是 |
| `process_control` | 进程控制 | 是 |
| `plugins` | 插件 | 是 |
| `subagents` | Subagents | 是 |
| `codex_tool_mode` | codex 工具模式 | 是 |
| `skills` | Skills | 否，可通过 `DEVSPACE_PREMIUM_FEATURES` 改成付费 |
| `full_tool_mode` | full 工具模式 | 否，可通过 `DEVSPACE_PREMIUM_FEATURES` 改成付费 |

## 内置方案

| 方案 | 默认解锁 |
| --- | --- |
| `free` | 只开放非付费功能 |
| `pro` | 开放默认付费功能 |
| `team` | 开放全部已知功能 |
| `enterprise` | 开放全部已知功能 |
| `lifetime` | 开放全部已知功能 |
| `developer` | 门控关闭时的本地开发者模式，开放全部功能 |

## setup.json 示例

固定启动器会读取 `.agentdesk-fixed-runtime/setup.json` 中的账号字段，并转换成环境变量：

```json
{
  "accountGating": true,
  "accountId": "user_123",
  "accountEmail": "buyer@example.com",
  "accountPlan": "pro",
  "licenseKey": "license-from-your-server",
  "licenseFeatures": ["browser_tools", "plugins"],
  "premiumFeatures": ["public_file_browser", "browser_tools", "plugins"],
  "licenseExpiresAt": "2027-01-01T00:00:00Z"
}
```

## 推荐商业落地路径

第一阶段可以手工发 license：用户付款后，你给他一段 license JSON 或 license key，让他贴进控制台。

第二阶段做一个授权服务：AgentDesk 登录你的账号系统，拿到 plan、features 和 expiresAt。

第三阶段把真正高价值能力放到云端：例如远程同步、团队审计、云端任务队列、模型额度、模板市场。这样即使本地代码开源，收费价值也不会像糖葫芦裸奔一样被一口薅完。
