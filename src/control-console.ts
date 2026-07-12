import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Express, Request, Response } from "express";
import type { ServerConfig } from "./config.js";

const FILE_BROWSER_TOKEN_ENV = "DEVSPACE_FILE_BROWSER_TOKEN";
const PUBLIC_FILE_BROWSER_ENV = "DEVSPACE_PUBLIC_FILE_BROWSER";

export function registerControlConsoleRoutes(app: Express, config: ServerConfig): void {
  app.get("/console", (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    res.type("html").send(renderConsolePage(config));
  });

  app.get("/console/api/status", (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    res.json(buildStatus(config, { local: true }));
  });

  app.get("/console/api/logs", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    const name = typeof req.query.name === "string" ? req.query.name : "agentdesk";
    const log = await readSafeLog(config, name);
    res.json(log);
  });

  app.post("/console/api/rotate-owner-token", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    const token = newOwnerToken();
    config.oauth.ownerToken = token;
    process.env.DEVSPACE_OAUTH_OWNER_TOKEN = token;
    await writeJsonNoBom(authFilePath(config), { ownerToken: token });
    res.json({ ok: true, token, fingerprint: fingerprint(token), message: "Owner Token 已更新。已有 OAuth access token 不会被立即撤销；下次重新授权请使用新 token。" });
  });

  app.post("/console/api/rotate-file-browser-password", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    const password = newFileBrowserToken();
    process.env[FILE_BROWSER_TOKEN_ENV] = password;
    await writeJsonNoBom(fileBrowserAuthPath(config), { username: "agentdesk", password });
    res.json({ ok: true, username: "agentdesk", password, fingerprint: fingerprint(password), message: "文件浏览器密码已更新，公网 /files 立即使用新密码。" });
  });

  app.post("/console/api/restart", (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    res.json({ ok: true, message: "AgentDesk 正在重启，隐藏守护脚本会自动拉起。" });
    setTimeout(() => process.exit(0), 250);
  });

  app.get("/status", (_req, res) => {
    res.type("html").send(renderPublicStatusPage(config));
  });

  app.get("/status.json", (_req, res) => {
    res.json(buildStatus(config, { local: false }));
  });
}

function buildStatus(config: ServerConfig, options: { local: boolean }) {
  const publicBaseUrl = config.publicBaseUrl.replace(/\/$/, "");
  const ownerToken = config.oauth.ownerToken;
  const fileBrowserToken = process.env[FILE_BROWSER_TOKEN_ENV] ?? "";
  const issues = securityIssues(config, ownerToken, fileBrowserToken);
  const base = {
    ok: true,
    name: "AgentDesk",
    mode: options.local ? "local-console" : "public-status",
    uptimeSeconds: Math.floor(process.uptime()),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    local: {
      healthUrl: `http://${config.host}:${config.port}/healthz`,
      consoleUrl: `http://127.0.0.1:${config.port}/console`,
      fileBrowserUrl: `http://127.0.0.1:${config.port}/local-files`,
    },
    public: {
      baseUrl: publicBaseUrl,
      mcpUrl: `${publicBaseUrl}/mcp`,
      fileBrowserUrl: `${publicBaseUrl}/files`,
      statusUrl: `${publicBaseUrl}/status`,
      publicFileBrowser: process.env[PUBLIC_FILE_BROWSER_ENV] === "1",
    },
    features: {
      toolMode: config.toolMode,
      permissionProfile: config.permissionProfile,
      systemTools: config.systemToolsEnabled,
      processControl: config.processControlEnabled,
      browserTools: config.browserToolsEnabled,
      browserMode: process.env.DEVSPACE_BROWSER_MODE ?? "unknown",
      browserDebugPort: Number(process.env.DEVSPACE_BROWSER_DEBUG_PORT ?? "0"),
      plugins: config.pluginsEnabled,
      skills: config.skillsEnabled,
    },
    oauth: {
      accessTokenTtlSeconds: config.oauth.accessTokenTtlSeconds,
      refreshTokenTtlSeconds: config.oauth.refreshTokenTtlSeconds,
      ownerTokenFingerprint: fingerprint(ownerToken),
      ownerTokenStrength: tokenStrength(ownerToken),
    },
    fileBrowser: {
      username: "agentdesk",
      passwordFingerprint: fingerprint(fileBrowserToken),
      passwordStrength: tokenStrength(fileBrowserToken),
    },
    security: {
      level: securityLevel(issues.length),
      issues,
    },
  };

  if (!options.local) return base;

  return {
    ...base,
    paths: {
      stateDir: config.stateDir,
      configDir: configDir(config),
      allowedRoots: config.allowedRoots,
      logsDir: logsDir(config),
      authFile: authFilePath(config),
      fileBrowserAuthFile: fileBrowserAuthPath(config),
    },
  };
}

function securityIssues(config: ServerConfig, ownerToken: string, fileBrowserToken: string): string[] {
  const issues: string[] = [];
  if (tokenStrength(ownerToken) === "weak") issues.push("Owner Token 过弱，建议在控制台中重新生成。 ");
  if (tokenStrength(fileBrowserToken) === "weak") issues.push("公网文件浏览器密码过弱，建议重新生成。 ");
  if (config.allowedRoots.some((root) => /^([A-Za-z]:\\|[A-Za-z]:\/$)/.test(root.trim()))) {
    issues.push("允许目录包含整盘根目录，公网文件浏览器开启时风险较高。 ");
  }
  if (process.env[PUBLIC_FILE_BROWSER_ENV] === "1") {
    issues.push("公网文件浏览器已开启，请确保密码足够强并只给可信设备使用。 ");
  }
  return issues;
}

function securityLevel(issueCount: number): "high" | "medium" | "low" {
  if (issueCount >= 3) return "low";
  if (issueCount >= 1) return "medium";
  return "high";
}

async function readSafeLog(config: ServerConfig, name: string): Promise<{ ok: boolean; name: string; path?: string; content: string; error?: string }> {
  const allow: Record<string, string> = {
    agentdesk: "agentdesk-fixed.log",
    supervisor: "agentdesk-fixed-supervisor.log",
    tunnel: "agentdesk-cloudflared.log",
    tunnelSupervisor: "agentdesk-cloudflared-supervisor.log",
  };
  const fileName = allow[name] ?? allow.agentdesk;
  const filePath = join(logsDir(config), fileName);
  try {
    if (!existsSync(filePath)) return { ok: true, name, path: filePath, content: "日志文件还不存在。" };
    const text = await readFile(filePath, "utf8");
    const tail = text.split(/\r?\n/).slice(-180).join("\n");
    return { ok: true, name, path: filePath, content: redactSecrets(tail) };
  } catch (error) {
    return { ok: false, name, path: filePath, content: "", error: error instanceof Error ? error.message : String(error) };
  }
}

function renderConsolePage(config: ServerConfig): string {
  const publicBaseUrl = config.publicBaseUrl.replace(/\/$/, "");
  return layout(
    "AgentDesk Control Center",
    `<header class="hero">
      <div><div class="eyebrow">本机管理台</div><h1>AgentDesk Control Center</h1><p>配置、观察和管理你的本地 Agent 桌面，不再依赖命令行。</p></div>
      <div class="hero-actions"><a class="button" href="${publicBaseUrl}/mcp">MCP</a><a class="button secondary" href="/local-files">本机文件</a><a class="button secondary" href="${publicBaseUrl}/files">公网文件</a></div>
    </header>
    <section class="grid cards">
      <article class="card"><span class="label">运行状态</span><strong id="status-ok">加载中</strong><small id="status-uptime"></small></article>
      <article class="card"><span class="label">安全等级</span><strong id="security-level">加载中</strong><small id="security-issues"></small></article>
      <article class="card"><span class="label">MCP 地址</span><code id="mcp-url"></code><button onclick="copyText('mcp-url')">复制</button></article>
      <article class="card"><span class="label">文件浏览器</span><strong id="files-state"></strong><small>公网入口需要独立密码</small></article>
    </section>

    <section class="panel">
      <h2>一键操作</h2>
      <div class="actions">
        <button onclick="rotateOwnerToken()">重新生成 Owner Token</button>
        <button onclick="rotateFilePassword()">重新生成文件浏览器密码</button>
        <button onclick="restartAgentDesk()" class="danger">重启 AgentDesk</button>
      </div>
      <pre id="action-result" class="result">操作结果会显示在这里。敏感 token 只在本机页面显示一次，请自己保存。</pre>
    </section>

    <section class="grid two">
      <article class="panel"><h2>连接向导</h2><dl id="connection-guide"></dl></article>
      <article class="panel"><h2>功能状态</h2><dl id="feature-list"></dl></article>
    </section>

    <section class="panel"><h2>允许访问目录</h2><div id="roots" class="roots"></div></section>

    <section class="panel"><h2>日志查看</h2><div class="actions"><button onclick="loadLog('agentdesk')">AgentDesk</button><button onclick="loadLog('supervisor')">守护脚本</button><button onclick="loadLog('tunnel')">Tunnel</button><button onclick="loadLog('tunnelSupervisor')">Tunnel 守护</button></div><pre id="log-box" class="logs">选择一个日志。</pre></section>

    <script>
      async function fetchJson(url, options){ const r = await fetch(url, options); const j = await r.json(); if(!r.ok) throw new Error(j.error || r.statusText); return j; }
      function setText(id, value){ document.getElementById(id).textContent = value == null ? '' : String(value); }
      function fmtUptime(seconds){ const h=Math.floor(seconds/3600), m=Math.floor((seconds%3600)/60), s=seconds%60; return h+'小时 '+m+'分 '+s+'秒'; }
      function copyText(id){ navigator.clipboard.writeText(document.getElementById(id).textContent); }
      function dl(items){ return Object.entries(items).map(([k,v]) => '<dt>'+k+'</dt><dd>'+v+'</dd>').join(''); }
      async function loadStatus(){
        const s = await fetchJson('/console/api/status');
        setText('status-ok', s.ok ? '运行中' : '异常');
        setText('status-uptime', '已运行 ' + fmtUptime(s.uptimeSeconds));
        setText('security-level', s.security.level === 'high' ? '高' : s.security.level === 'medium' ? '中' : '低');
        setText('security-issues', s.security.issues.length ? s.security.issues.join(' / ') : '暂无明显风险');
        setText('mcp-url', s.public.mcpUrl);
        setText('files-state', s.public.publicFileBrowser ? '公网已开启' : '仅本机');
        document.getElementById('connection-guide').innerHTML = dl({ 'GPT 名称':'AgentDesk', 'Server URL':'<code>'+s.public.mcpUrl+'</code>', '认证方式':'OAuth', '本机控制台':'<code>'+s.local.consoleUrl+'</code>', '公网状态页':'<code>'+s.public.statusUrl+'</code>' });
        document.getElementById('feature-list').innerHTML = dl({ '权限档位':s.features.permissionProfile, '浏览器模式':s.features.browserMode + ' / ' + s.features.browserDebugPort, '系统工具':s.features.systemTools ? '开启' : '关闭', '进程控制':s.features.processControl ? '开启' : '关闭', '插件':s.features.plugins ? '开启' : '关闭', 'Owner Token':s.oauth.ownerTokenFingerprint + ' / ' + s.oauth.ownerTokenStrength, '文件密码':s.fileBrowser.passwordFingerprint + ' / ' + s.fileBrowser.passwordStrength });
        document.getElementById('roots').innerHTML = s.paths.allowedRoots.map(r => '<a class="pill" href="/local-files?p='+encodeURIComponent(r)+'">'+r+'</a>').join('');
      }
      async function rotateOwnerToken(){ const r = await fetchJson('/console/api/rotate-owner-token',{method:'POST'}); setText('action-result','新的 Owner Token：\\n'+r.token+'\\n\\n'+r.message); await loadStatus(); }
      async function rotateFilePassword(){ const r = await fetchJson('/console/api/rotate-file-browser-password',{method:'POST'}); setText('action-result','公网文件浏览器用户名：'+r.username+'\\n新密码：\\n'+r.password+'\\n\\n'+r.message); await loadStatus(); }
      async function restartAgentDesk(){ const r = await fetchJson('/console/api/restart',{method:'POST'}); setText('action-result', r.message + '\\n请等待 5-10 秒后刷新页面。'); }
      async function loadLog(name){ const r = await fetchJson('/console/api/logs?name='+encodeURIComponent(name)); setText('log-box', r.content || r.error || '空日志'); }
      loadStatus(); setInterval(loadStatus, 10000);
    </script>`,
  );
}

function renderPublicStatusPage(config: ServerConfig): string {
  const s = buildStatus(config, { local: false }) as any;
  return layout(
    "AgentDesk Status",
    `<header class="hero"><div><div class="eyebrow">公网只读状态页</div><h1>AgentDesk Status</h1><p>这里只显示连接状态和公开入口，不提供修改能力。</p></div><div class="hero-actions"><a class="button" href="${s.public.fileBrowserUrl}">公网文件浏览器</a></div></header>
    <section class="grid cards">
      <article class="card"><span class="label">服务</span><strong>${s.ok ? "运行中" : "异常"}</strong><small>uptime ${s.uptimeSeconds}s</small></article>
      <article class="card"><span class="label">MCP</span><code>${escapeHtml(s.public.mcpUrl)}</code></article>
      <article class="card"><span class="label">文件浏览器</span><strong>${s.public.publicFileBrowser ? "已开启" : "未开启"}</strong><small>需要独立密码</small></article>
      <article class="card"><span class="label">安全等级</span><strong>${s.security.level}</strong><small>${escapeHtml(s.security.issues.length ? s.security.issues.join(" / ") : "暂无明显风险")}</small></article>
    </section>
    <section class="panel"><h2>提示</h2><p>完整管理台只允许在电脑本机打开：<code>http://127.0.0.1:${config.port}/console</code></p></section>`,
  );
}

function layout(title: string, body: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title><style>
  :root{color-scheme:light dark;--bg:#f6f7fb;--card:#fff;--text:#141824;--muted:#667085;--line:#e5e7eb;--brand:#155eef;--danger:#b42318;--soft:#eef4ff} @media(prefers-color-scheme:dark){:root{--bg:#0b1020;--card:#121a2b;--text:#eef2ff;--muted:#9aa4b2;--line:#273246;--soft:#14213d}}
  *{box-sizing:border-box}body{margin:0;padding:28px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}a{color:var(--brand)}.hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:22px;padding:22px;border-radius:20px;background:linear-gradient(135deg,var(--card),var(--soft));border:1px solid var(--line)}.eyebrow{color:var(--brand);font-weight:700;font-size:13px;letter-spacing:.08em;text-transform:uppercase}h1{margin:.2em 0;font-size:30px}h2{margin:0 0 14px;font-size:18px}p{color:var(--muted)}.grid{display:grid;gap:14px}.cards{grid-template-columns:repeat(4,minmax(0,1fr))}.two{grid-template-columns:1fr 1fr}.card,.panel{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 8px 24px rgba(15,23,42,.05)}.label{display:block;color:var(--muted);font-size:13px;margin-bottom:8px}.card strong{display:block;font-size:24px}.card small,dd{color:var(--muted)}code,pre{background:rgba(127,127,127,.12);border-radius:8px;padding:3px 6px;word-break:break-all}.button,button{border:0;border-radius:10px;background:var(--brand);color:white;padding:9px 12px;text-decoration:none;cursor:pointer;font-weight:650}.button.secondary,button.secondary{background:rgba(127,127,127,.18);color:var(--text)}button.danger{background:var(--danger)}.hero-actions,.actions{display:flex;gap:8px;flex-wrap:wrap}.panel{margin-top:14px}.result,.logs{white-space:pre-wrap;max-height:360px;overflow:auto;padding:12px}dl{display:grid;grid-template-columns:130px 1fr;gap:8px 12px}dt{color:var(--muted)}dd{margin:0}.pill{display:inline-block;margin:4px;padding:7px 10px;background:var(--soft);border:1px solid var(--line);border-radius:999px;text-decoration:none}@media(max-width:900px){.cards,.two{grid-template-columns:1fr}.hero{display:block}.hero-actions{margin-top:12px}}
  </style></head><body>${body}</body></html>`;
}

function isLocalConsoleRequest(req: Request): boolean {
  const host = req.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function denyLocalOnly(res: Response) {
  return res.status(403).type("text/plain").send("AgentDesk console is only available from localhost / 127.0.0.1");
}

function newOwnerToken(): string {
  return "adsk-owner-" + randomBytes(32).toString("base64url");
}

function newFileBrowserToken(): string {
  return "adsk-files-" + randomBytes(32).toString("base64url");
}

function tokenStrength(token: string): "weak" | "medium" | "strong" {
  if (!token || token.length < 32) return "weak";
  if (/^(.)\1+$/.test(token)) return "weak";
  let classes = 0;
  if (/[A-Z]/.test(token)) classes++;
  if (/[a-z]/.test(token)) classes++;
  if (/[0-9]/.test(token)) classes++;
  if (/[^A-Za-z0-9]/.test(token)) classes++;
  if (token.length >= 40 && classes >= 2) return "strong";
  return "medium";
}

function fingerprint(secret: string): string {
  if (!secret) return "not configured";
  if (secret.length <= 12) return "configured";
  return `${secret.slice(0, 8)}...${secret.slice(-4)}`;
}

function authFilePath(config: ServerConfig): string {
  return join(configDir(config), "auth.json");
}

function fileBrowserAuthPath(config: ServerConfig): string {
  return join(configDir(config), "file-browser-auth.json");
}

function configDir(config: ServerConfig): string {
  return process.env.DEVSPACE_CONFIG_DIR ?? resolve(dirname(config.stateDir), "config");
}

function logsDir(config: ServerConfig): string {
  return resolve(dirname(config.stateDir), "logs");
}

async function writeJsonNoBom(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2), { encoding: "utf8" });
}

function redactSecrets(text: string): string {
  return text
    .replace(/adsk-(?:fixed|owner|files)-[A-Za-z0-9_-]{12,}/g, "[REDACTED_TOKEN]")
    .replace(/("password"\s*:\s*")[^"]+/g, "$1[REDACTED]")
    .replace(/("ownerToken"\s*:\s*")[^"]+/g, "$1[REDACTED]");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}
