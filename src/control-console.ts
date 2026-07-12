import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Express, Request, Response } from "express";
import type { ServerConfig, ToolMode } from "./config.js";
import type { PermissionProfile } from "./permissions.js";
import { ACCOUNT_FEATURE_LABELS, blockedFeatureMessage, isFeatureAllowed, type AccountFeature } from "./accounts.js";

const FILE_BROWSER_TOKEN_ENV = "DEVSPACE_FILE_BROWSER_TOKEN";
const PUBLIC_FILE_BROWSER_ENV = "DEVSPACE_PUBLIC_FILE_BROWSER";

type BrowserMode = "isolated" | "live";

interface ConsoleConfigForm {
  port: number;
  publicBaseUrl: string;
  allowedRoots: string[];
  permissionProfile: PermissionProfile;
  toolMode: ToolMode;
  systemTools: boolean;
  processControl: boolean;
  browserTools: boolean;
  browserMode: BrowserMode;
  browserDebugPort: number;
  edgeProfile: string;
  enablePublicFileBrowser: boolean;
  plugins: boolean;
  skills: boolean;
  accountGating: boolean;
  accountId: string;
  accountEmail: string;
  accountPlan: string;
  licenseKey: string;
  licenseFeatures: string[];
  premiumFeatures: string[];
  licenseExpiresAt: string;
}

export function registerControlConsoleRoutes(app: Express, config: ServerConfig): void {
  app.get("/console", (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    res.type("html").send(renderConsolePage(config));
  });

  app.get("/console/api/status", (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    res.json(buildStatus(config, { local: true }));
  });

  app.get("/console/api/config", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    res.json({ ok: true, config: await readConsoleConfig(config), runtime: runtimeConfig(config) });
  });

  app.post("/console/api/config", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    try {
      const body = await readRequestJson(req);
      const next = await normalizeConsoleConfigInput(config, body);
      await saveConsoleConfig(config, next);
      applyImmediateConfig(config, next);
      res.json({
        ok: true,
        config: next,
        runtime: runtimeConfig(config),
        restartRequired: true,
        message: "配置已保存到 setup.json。allowed roots、公网文件浏览器和 Public Base URL 已尽量即时同步；权限档位、工具开关、浏览器模式、端口等请点击“保存并重启”后完整生效。",
      });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/console/api/logs", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    const name = typeof req.query.name === "string" ? req.query.name : "agentdesk";
    const log = await readSafeLog(config, name);
    res.json(log);
  });

  app.post("/console/api/allowed-roots", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    try {
      const body = await readRequestJson(req);
      const roots = await normalizeAllowedRootsInput(body.allowedRoots ?? body.roots);
      config.allowedRoots.splice(0, config.allowedRoots.length, ...roots);
      process.env.DEVSPACE_ALLOWED_ROOTS = roots.join(",");
      await updateSetupFile(config, { allowedRoots: roots, updatedAt: new Date().toISOString() });
      res.json({ ok: true, allowedRoots: roots, message: "可访问目录已保存，并已对当前运行中的 AgentDesk 生效。下次重启也会继续使用这些目录。" });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/console/api/rotate-owner-token", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    const token = newOwnerToken();
    config.oauth.ownerToken = token;
    process.env.DEVSPACE_OAUTH_OWNER_TOKEN = token;
    await writeJsonNoBom(authFilePath(config), { ownerToken: token });
    res.json({ ok: true, token, fingerprint: fingerprint(token), message: "Owner Token 已更新。已有 OAuth access token 不会被立即撤销；下次重新授权请使用新 token。" });
  });

  app.post("/console/api/owner-token", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    try {
      const body = await readRequestJson(req);
      const token = normalizeCustomSecret(body.ownerToken ?? body.token, "Owner Token");
      config.oauth.ownerToken = token;
      process.env.DEVSPACE_OAUTH_OWNER_TOKEN = token;
      await writeJsonNoBom(authFilePath(config), { ownerToken: token });
      res.json({ ok: true, fingerprint: fingerprint(token), strength: tokenStrength(token), message: "Owner Token 已设置为自定义值。已有 OAuth access token 不会被立即撤销；下次重新授权请使用新 token。" });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/console/api/rotate-file-browser-password", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    const password = newFileBrowserToken();
    process.env[FILE_BROWSER_TOKEN_ENV] = password;
    await writeJsonNoBom(fileBrowserAuthPath(config), { username: "agentdesk", password });
    res.json({ ok: true, username: "agentdesk", password, fingerprint: fingerprint(password), message: "文件浏览器密码已更新，公网 /files 立即使用新密码。" });
  });

  app.post("/console/api/file-browser-password", async (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    try {
      const body = await readRequestJson(req);
      const password = normalizeCustomSecret(body.password ?? body.fileBrowserPassword, "文件浏览器密码");
      process.env[FILE_BROWSER_TOKEN_ENV] = password;
      await writeJsonNoBom(fileBrowserAuthPath(config), { username: "agentdesk", password });
      res.json({ ok: true, username: "agentdesk", fingerprint: fingerprint(password), strength: tokenStrength(password), message: "文件浏览器密码已设置为自定义值，公网 /files 立即使用新密码。" });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/console/api/restart", (req, res) => {
    if (!isLocalConsoleRequest(req)) return denyLocalOnly(res);
    res.json({ ok: true, message: "AgentDesk 正在重启。守护脚本会重新读取 setup.json 并拉起最新配置。" });
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
  const issues = securityIssues(config);
  const accountIssues = accountMessages(config);
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
    account: {
      enabled: config.account.enabled,
      plan: config.account.plan,
      accountId: config.account.accountId ?? "",
      email: config.account.email ?? "",
      licenseSource: config.account.licenseSource,
      licenseKeyFingerprint: config.account.licenseKeyFingerprint ?? "not configured",
      expiresAt: config.account.expiresAt ?? "",
      expired: config.account.expired,
      premiumFeatures: config.account.premiumFeatures,
      features: config.account.features,
      notes: config.account.notes,
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
    diagnostics: {
      generatedAt: new Date().toISOString(),
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      pid: process.pid,
      cwd: process.cwd(),
      memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    security: {
      level: securityLevel(issues.length),
      issues: [...issues, ...accountIssues],
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

function securityIssues(config: ServerConfig): string[] {
  const issues: string[] = [];
  if (config.allowedRoots.some((root) => /^([A-Za-z]:\\|[A-Za-z]:\/$)/.test(root.trim()))) {
    issues.push("允许目录包含整盘根目录，公网文件浏览器开启时风险较高。 ");
  }
  if (process.env[PUBLIC_FILE_BROWSER_ENV] === "1") {
    issues.push("公网文件浏览器已开启，请确认只给可信设备使用。 ");
  }
  return issues;
}

function accountMessages(config: ServerConfig): string[] {
  const messages: string[] = [];
  for (const note of config.account.notes) messages.push(note);
  if (!isFeatureAllowed(config.account, "public_file_browser") && process.env[PUBLIC_FILE_BROWSER_ENV] === "1") {
    messages.push(blockedFeatureMessage(config.account, "public_file_browser"));
  }
  return messages;
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
      <div><div class="eyebrow">本机管理台</div><h1>AgentDesk Control Center</h1><p>配置、观察和管理你的本地 Agent 桌面。少敲命令，多看状态，别让小黑窗当老板。</p></div>
      <div class="hero-actions"><a class="button" href="${publicBaseUrl}/mcp">MCP</a><a class="button secondary" href="/local-files">本机文件</a><a class="button secondary" href="${publicBaseUrl}/files">公网文件</a><button class="secondary" onclick="loadStatus(this)">刷新状态</button></div>
    </header>
    <section class="grid cards">
      <article class="card"><span class="label">运行状态</span><strong id="status-ok">加载中</strong><small id="status-uptime"></small></article>
      <article class="card"><span class="label">安全等级</span><strong id="security-level">加载中</strong><small id="security-issues"></small></article>
      <article class="card"><span class="label">MCP 地址</span><code id="mcp-url"></code><button class="mini" onclick="copyText('mcp-url')">复制</button></article>
      <article class="card"><span class="label">文件浏览器</span><strong id="files-state"></strong><small id="files-hint">公网入口需要独立密码</small></article>
    </section>

    <details class="panel health-panel">
      <summary class="health-summary">
        <span><strong>健康检查</strong><small id="last-refresh">等待刷新</small></span>
        <span class="summary-hint">点击展开</span>
      </summary>
      <div class="health-body">
        <div id="issue-list" class="issue-list">正在读取运行状态。</div>
        <div class="actions"><button onclick="loadStatus(this)">重新检查</button><button class="secondary" onclick="copyStatusSummary()">复制状态摘要</button><button class="secondary" onclick="openJson('/status.json')">打开状态 JSON</button></div>
      </div>
    </details>

    <section class="panel">
      <h2>核心配置</h2>
      <p>这些配置会保存到 <code>.agentdesk-fixed-runtime/setup.json</code>。目录和部分 URL 会即时同步，权限档位、工具开关、浏览器模式、端口等请保存后重启生效。</p>
      <form id="core-config-form" class="form-grid">
        <label>服务端口<input name="port" type="number" min="1" max="65535" /></label>
        <label>Public Base URL<input name="publicBaseUrl" placeholder="https://agentdesk.example.com" /></label>
        <label>权限档位<select name="permissionProfile"><option value="safe">safe</option><option value="dev">dev</option><option value="power">power</option><option value="owner">owner</option></select></label>
        <label>工具模式<select name="toolMode"><option value="minimal">minimal</option><option value="full">full</option><option value="codex">codex</option></select></label>
        <label>浏览器模式<select name="browserMode"><option value="isolated">isolated</option><option value="live">live</option></select></label>
        <label>浏览器调试端口<input name="browserDebugPort" type="number" min="1" max="65535" /></label>
        <label>Edge Profile<input name="edgeProfile" placeholder="Default" /></label>
        <div class="checks">
          <label><input name="systemTools" type="checkbox" /> 系统工具</label>
          <label><input name="processControl" type="checkbox" /> 进程控制</label>
          <label><input name="browserTools" type="checkbox" /> 浏览器工具</label>
          <label><input name="enablePublicFileBrowser" type="checkbox" /> 公网文件浏览器</label>
          <label><input name="plugins" type="checkbox" /> 插件</label>
          <label><input name="skills" type="checkbox" /> Skills</label>
          <label><input name="accountGating" type="checkbox" /> 启用账号/授权门控</label>
        </div>
        <label>账号 ID<input name="accountId" placeholder="例如 user_123" /></label>
        <label>账号邮箱<input name="accountEmail" placeholder="例如 user@example.com" /></label>
        <label>账号方案<input name="accountPlan" placeholder="free / pro / team / enterprise / lifetime" /></label>
        <label>License Key<input name="licenseKey" type="password" autocomplete="new-password" placeholder="由你的收费系统发放" /></label>
        <label>License 到期时间<input name="licenseExpiresAt" placeholder="例如 2027-01-01T00:00:00Z" /></label>
        <label class="full">已解锁功能<textarea name="licenseFeatures" class="editor" spellcheck="false" placeholder="每行一个，例如：browser_tools&#10;plugins"></textarea></label>
        <label class="full">需要付费的功能<textarea name="premiumFeatures" class="editor" spellcheck="false" placeholder="留空使用默认高级功能列表；也可每行一个覆盖"></textarea></label>
        <label class="full">允许访问目录<textarea id="allowed-roots-editor" name="allowedRoots" class="editor" spellcheck="false" placeholder="每行一个目录，例如：G:\\devspace-copt-lab\\devspace"></textarea></label>
      </form>
      <div class="actions root-actions"><button class="secondary" onclick="addRuntimeCwdToRoots()">加入当前工作目录</button><button class="secondary" onclick="normalizeRootsEditor()">整理目录列表</button><button class="secondary" onclick="copyAllowedRoots()">复制目录列表</button><button onclick="saveAllowedRootsOnly(this)">只保存允许目录并立即生效</button></div>
      <div id="config-hints" class="hint-box">正在比较保存配置与运行配置。</div>
      <div class="actions"><button onclick="saveConfig(false,this)">保存全部配置</button><button onclick="saveConfig(true,this)">保存全部配置并重启 AgentDesk</button><button class="secondary" onclick="loadConfigPanel(this)">恢复当前配置</button><button class="secondary" onclick="copyConfigPayload()">复制当前表单 JSON</button></div>
      <pre id="config-result" class="result">配置操作结果会显示在这里。</pre>
    </section>

    <section class="panel">
      <h2>一键操作</h2>
      <div class="actions">
        <button onclick="rotateOwnerToken(this)">重新生成 Owner Token</button>
        <button onclick="rotateFilePassword(this)">重新生成文件浏览器密码</button>
        <button onclick="restartAgentDesk(undefined,this)" class="danger">重启 AgentDesk</button>
      </div>
      <div class="credential-grid">
        <label>自定义 Owner Token<input id="custom-owner-token" type="password" autocomplete="new-password" placeholder="任意非空内容" /></label>
        <button class="secondary" onclick="setOwnerToken(this)">保存自定义 Token</button>
        <label>自定义文件浏览器密码<input id="custom-file-password" type="password" autocomplete="new-password" placeholder="任意非空内容" /></label>
        <button class="secondary" onclick="setFilePassword(this)">保存自定义文件密码</button>
      </div>
      <pre id="action-result" class="result">操作结果会显示在这里。随机生成的敏感值只在本机页面显示一次；自定义值不会回显。</pre>
    </section>

    <section class="grid two">
      <article class="panel"><div class="panel-title"><h2>连接向导</h2><button class="mini secondary" onclick="copyConnectionGuide()">复制向导</button></div><dl id="connection-guide"></dl></article>
      <article class="panel"><h2>运行诊断</h2><dl id="runtime-diagnostics"></dl></article>
    </section>

    <section class="panel"><h2>运行中功能状态</h2><dl id="feature-list"></dl></section>

    <section class="panel">
      <h2>当前可访问目录</h2>
      <p>点击目录可以打开本机文件浏览器。建议只添加需要的项目目录，不要轻易开放整盘。</p>
      <div id="roots" class="roots"></div>
    </section>

    <section class="panel"><div class="panel-title"><h2>日志查看</h2><button class="mini secondary" onclick="copyText('log-box')">复制当前日志</button></div><div class="actions"><button onclick="loadLog('agentdesk',this)">AgentDesk</button><button onclick="loadLog('supervisor',this)">守护脚本</button><button onclick="loadLog('tunnel',this)">Tunnel</button><button onclick="loadLog('tunnelSupervisor',this)">Tunnel 守护</button></div><pre id="log-box" class="logs">选择一个日志。</pre></section>

    <div id="toast" class="toast" role="status" aria-live="polite"></div>

    <script>
      const RESTART_KEYS = ['port','permissionProfile','toolMode','systemTools','processControl','browserTools','browserMode','browserDebugPort','edgeProfile','plugins','skills'];
      let latestStatus = null;
      let latestConfigResponse = null;
      let toastTimer = 0;
      async function fetchJson(url, options){
        const r = await fetch(url, options);
        const raw = await r.text();
        let j = {};
        try { j = raw ? JSON.parse(raw) : {}; } catch (_err) { j = { error: raw || r.statusText }; }
        if(!r.ok) throw new Error(j.error || r.statusText);
        return j;
      }
      function setText(id, value){ const el = document.getElementById(id); if(el) el.textContent = value == null ? '' : String(value); }
      function esc(value){ return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch] || ch; }); }
      function code(value){ return '<code>'+esc(value)+'</code>'; }
      function fmtUptime(seconds){ const h=Math.floor(seconds/3600), m=Math.floor((seconds%3600)/60), s=seconds%60; return h+'小时 '+m+'分 '+s+'秒'; }
      function boolText(value){ return value ? '<span class="status-pill good">开启</span>' : '<span class="status-pill muted">关闭</span>'; }
      function strengthText(value){ const tone = value === 'configured' ? 'good' : 'muted'; return '<span class="status-pill '+tone+'">'+esc(value)+'</span>'; }
      function dl(items){ return Object.entries(items).map(function(entry){ return '<dt>'+esc(entry[0])+'</dt><dd>'+entry[1]+'</dd>'; }).join(''); }
      function toast(message){ const el=document.getElementById('toast'); if(!el) return; el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(function(){ el.classList.remove('show'); }, 1800); }
      function form(){ return document.getElementById('core-config-form'); }
      function setBusy(button, busy, label){ if(!button) return; if(busy){ button.dataset.oldText = button.textContent || ''; button.textContent = label || '处理中'; button.disabled = true; } else { button.disabled = false; if(button.dataset.oldText) button.textContent = button.dataset.oldText; } }
      async function copyValue(value, message){ try{ await navigator.clipboard.writeText(String(value == null ? '' : value)); toast(message || '已复制'); } catch(err){ toast('复制失败：' + (err.message || String(err))); } }
      function copyText(id){ const el=document.getElementById(id); copyValue(el ? el.textContent : '', '已复制'); }
      function openJson(url){ window.open(url, '_blank', 'noopener'); }
      function setFormValue(name, value){ const el=form().elements[name]; if(!el) return; if(el.type==='checkbox') el.checked=!!value; else if(Array.isArray(value)) el.value=value.join('\\n'); else el.value=value ?? ''; }
      function readAllowedRootsEditor(){ return form().elements.allowedRoots.value.split(/\\r?\\n|,/).map(function(x){ return x.trim(); }).filter(Boolean); }
      function readListField(name){ const el=form().elements[name]; return el ? el.value.split(/\\r?\\n|,/).map(function(x){ return x.trim(); }).filter(Boolean) : []; }
      function writeAllowedRootsEditor(roots){ form().elements.allowedRoots.value = roots.join('\\n'); }
      function uniqueRoots(roots){ return Array.from(new Set(roots.map(function(root){ return root.trim(); }).filter(Boolean))); }
      function getFormPayload(){ const f=form(); return {
        port: Number(f.elements.port.value),
        publicBaseUrl: f.elements.publicBaseUrl.value.trim(),
        permissionProfile: f.elements.permissionProfile.value,
        toolMode: f.elements.toolMode.value,
        systemTools: f.elements.systemTools.checked,
        processControl: f.elements.processControl.checked,
        browserTools: f.elements.browserTools.checked,
        browserMode: f.elements.browserMode.value,
        browserDebugPort: Number(f.elements.browserDebugPort.value),
        edgeProfile: f.elements.edgeProfile.value.trim() || 'Default',
        enablePublicFileBrowser: f.elements.enablePublicFileBrowser.checked,
        plugins: f.elements.plugins.checked,
        skills: f.elements.skills.checked,
        accountGating: f.elements.accountGating.checked,
        accountId: f.elements.accountId.value.trim(),
        accountEmail: f.elements.accountEmail.value.trim(),
        accountPlan: f.elements.accountPlan.value.trim() || 'free',
        licenseKey: f.elements.licenseKey.value.trim(),
        licenseFeatures: readListField('licenseFeatures'),
        premiumFeatures: readListField('premiumFeatures'),
        licenseExpiresAt: f.elements.licenseExpiresAt.value.trim(),
        allowedRoots: readAllowedRootsEditor()
      }; }
      function normalizeRootsEditor(){ const roots = uniqueRoots(readAllowedRootsEditor()); writeAllowedRootsEditor(roots); toast('目录列表已整理'); }
      function addRuntimeCwdToRoots(){
        if(!latestStatus || !latestStatus.diagnostics || !latestStatus.diagnostics.cwd) return toast('运行状态还没加载完');
        const roots = uniqueRoots(readAllowedRootsEditor().concat([latestStatus.diagnostics.cwd]));
        writeAllowedRootsEditor(roots);
        toast('已加入当前工作目录');
      }
      function copyAllowedRoots(){ copyValue(readAllowedRootsEditor().join(String.fromCharCode(10)), '目录列表已复制'); }
      async function saveAllowedRootsOnly(button){
        setBusy(button, true, '保存目录中');
        try{
          const roots = uniqueRoots(readAllowedRootsEditor());
          if(!roots.length) throw new Error('至少保留一个允许访问目录。');
          writeAllowedRootsEditor(roots);
          const r = await fetchJson('/console/api/allowed-roots', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ allowedRoots: roots }) });
          setText('config-result', r.message + '\\n\\n当前允许目录：\\n' + r.allowedRoots.join('\\n'));
          await loadStatus();
          await loadConfigPanel();
        }catch(err){ setText('config-result', err.message || String(err)); }
        finally{ setBusy(button, false); }
      }
      function renderConfigHints(saved, runtime){
        const changed = RESTART_KEYS.filter(function(key){ return JSON.stringify(saved[key]) !== JSON.stringify(runtime[key]); });
        const box = document.getElementById('config-hints');
        if(!box) return;
        if(changed.length){
          box.className = 'hint-box warn';
          box.textContent = '有 ' + changed.length + ' 项保存配置与运行中配置不同，需要重启后完整生效：' + changed.join(', ');
        } else {
          box.className = 'hint-box good';
          box.textContent = '保存配置与运行中配置一致。现在这台小机器很乖。';
        }
      }
      async function loadConfigPanel(button){
        setBusy(button, true, '读取中');
        try{
          const r = await fetchJson('/console/api/config');
          latestConfigResponse = r;
          const c = r.config;
          for(const key of Object.keys(c)) setFormValue(key, c[key]);
          renderConfigHints(r.config, r.runtime);
        }catch(err){ setText('config-result', err.message || String(err)); }
        finally{ setBusy(button, false); }
      }
      async function saveConfig(restart, button){
        setBusy(button, true, restart ? '保存并重启中' : '保存中');
        try{
          const payload = getFormPayload();
          if(!payload.allowedRoots.length) throw new Error('至少保留一个允许访问目录。');
          const r = await fetchJson('/console/api/config', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) });
          setText('config-result', r.message + '\\n\\n保存的配置：\\n' + JSON.stringify(r.config, null, 2));
          await loadStatus();
          await loadConfigPanel();
          if(restart) await restartAgentDesk('config-result');
        }catch(err){ setText('config-result', err.message || String(err)); }
        finally{ setBusy(button, false); }
      }
      function copyConfigPayload(){ copyValue(JSON.stringify(getFormPayload(), null, 2), '表单 JSON 已复制'); }
      function renderIssues(s){
        const box = document.getElementById('issue-list');
        if(!box) return;
        if(!s.security.issues.length){ box.innerHTML = '<div class="issue good">暂无明显风险。继续保持，别把整盘暴露给全世界就行。</div>'; return; }
        box.innerHTML = s.security.issues.map(function(item){ return '<div class="issue warn">'+esc(item)+'</div>'; }).join('');
      }
      async function loadStatus(button){
        setBusy(button, true, '检查中');
        try{
          const s = await fetchJson('/console/api/status');
          latestStatus = s;
          setText('status-ok', s.ok ? '运行中' : '异常');
          setText('status-uptime', '已运行 ' + fmtUptime(s.uptimeSeconds));
          setText('security-level', s.security.level === 'high' ? '高' : s.security.level === 'medium' ? '中' : '低');
          document.getElementById('security-level').className = 'tone-' + s.security.level;
          setText('security-issues', s.security.issues.length ? s.security.issues.join(' / ') : '暂无明显风险');
          setText('mcp-url', s.public.mcpUrl);
          setText('files-state', s.public.publicFileBrowser ? '公网已开启' : '仅本机');
          setText('files-hint', s.public.publicFileBrowser ? '公网入口需要独立密码' : '公网文件浏览器未开启');
          setText('last-refresh', '最后刷新：' + new Date().toLocaleString());
          renderIssues(s);
          document.getElementById('connection-guide').innerHTML = dl({
            'GPT 名称':'AgentDesk',
            'Server URL':code(s.public.mcpUrl)+' <button class="link-button" data-copy-path="public.mcpUrl" data-copy-message="MCP 地址已复制">复制</button>',
            '认证方式':'OAuth / Owner Token',
            '本机控制台':code(s.local.consoleUrl)+' <button class="link-button" data-copy-path="local.consoleUrl" data-copy-message="控制台地址已复制">复制</button>',
            '公网状态页':code(s.public.statusUrl)+' <button class="link-button" data-copy-path="public.statusUrl" data-copy-message="状态页已复制">复制</button>',
            '公网文件':code(s.public.fileBrowserUrl)
          });
          document.getElementById('feature-list').innerHTML = dl({
            '权限档位':code(s.features.permissionProfile),
            '工具模式':code(s.features.toolMode),
            '浏览器模式':code(s.features.browserMode + ' / ' + s.features.browserDebugPort),
            '系统工具':boolText(s.features.systemTools),
            '进程控制':boolText(s.features.processControl),
            '浏览器工具':boolText(s.features.browserTools),
            '插件':boolText(s.features.plugins),
            'Skills':boolText(s.features.skills),
            'Owner Token':code(s.oauth.ownerTokenFingerprint) + ' ' + strengthText(s.oauth.ownerTokenStrength),
            '文件密码':code(s.fileBrowser.passwordFingerprint) + ' ' + strengthText(s.fileBrowser.passwordStrength),
            '账号门控':boolText(s.account.enabled),
            '账号方案':code(s.account.plan),
            '授权来源':code(s.account.licenseSource),
            'License 指纹':code(s.account.licenseKeyFingerprint),
            '授权到期':code(s.account.expiresAt || '未设置')
          });
          document.getElementById('runtime-diagnostics').innerHTML = dl({
            '进程 PID':code(s.diagnostics.pid),
            'Node':code(s.diagnostics.node),
            '平台':code(s.diagnostics.platform),
            '内存 RSS':code(s.diagnostics.memoryRssMb + ' MB'),
            '工作目录':code(s.diagnostics.cwd),
            '状态生成':code(s.diagnostics.generatedAt),
            '配置目录':s.paths ? code(s.paths.configDir) : code('public status'),
            '日志目录':s.paths ? code(s.paths.logsDir) : code('public status')
          });
          const roots = s.paths ? s.paths.allowedRoots : [];
          document.getElementById('roots').innerHTML = roots.length ? roots.map(function(root){ return '<a class="pill" href="/local-files?p='+encodeURIComponent(root)+'">'+esc(root)+'</a>'; }).join('') : '<span class="muted">暂无目录</span>';
        }catch(err){
          setText('status-ok', '异常');
          const message = err.message || String(err);
          setText('security-issues', message);
          const issue = document.getElementById('issue-list');
          if(issue) issue.innerHTML = '<div class="issue danger">读取状态失败：'+esc(message)+'</div>';
        }finally{ setBusy(button, false); }
      }
      function copyStatusSummary(){
        if(!latestStatus) return toast('状态还没加载完');
        const s = latestStatus;
        const nl = String.fromCharCode(10);
        const text = ['AgentDesk 状态摘要','MCP: '+s.public.mcpUrl,'控制台: '+s.local.consoleUrl,'安全等级: '+s.security.level,'问题: '+(s.security.issues.length ? s.security.issues.join(' / ') : '无'),'运行: '+fmtUptime(s.uptimeSeconds),'Node: '+s.diagnostics.node,'PID: '+s.diagnostics.pid].join(nl);
        copyValue(text, '状态摘要已复制');
      }
      function copyConnectionGuide(){
        if(!latestStatus) return toast('连接信息还没加载完');
        const s = latestStatus;
        const nl = String.fromCharCode(10);
        copyValue(['GPT 名称: AgentDesk','Server URL: '+s.public.mcpUrl,'认证方式: OAuth / Owner Token','本机控制台: '+s.local.consoleUrl,'公网状态页: '+s.public.statusUrl].join(nl), '连接向导已复制');
      }
      async function rotateOwnerToken(button){
        if(!confirm('确认重新生成 Owner Token？旧的授权不会立即撤销，但下次重新授权要用新 token。')) return;
        setBusy(button, true, '生成中');
        try{ const r = await fetchJson('/console/api/rotate-owner-token',{method:'POST'}); setText('action-result','新的 Owner Token：\\n'+r.token+'\\n\\n'+r.message); await loadStatus(); }
        catch(err){ setText('action-result', err.message || String(err)); }
        finally{ setBusy(button, false); }
      }
      async function rotateFilePassword(button){
        if(!confirm('确认重新生成公网文件浏览器密码？旧密码会立即失效。')) return;
        setBusy(button, true, '生成中');
        try{ const r = await fetchJson('/console/api/rotate-file-browser-password',{method:'POST'}); setText('action-result','公网文件浏览器用户名：'+r.username+'\\n新密码：\\n'+r.password+'\\n\\n'+r.message); await loadStatus(); }
        catch(err){ setText('action-result', err.message || String(err)); }
        finally{ setBusy(button, false); }
      }
      async function setOwnerToken(button){
        const input = document.getElementById('custom-owner-token');
        const ownerToken = input ? input.value.trim() : '';
        if(!ownerToken) return setText('action-result', '请先输入自定义 Owner Token。');
        if(!confirm('确认设置自定义 Owner Token？下次重新授权要使用这个新 token。')) return;
        setBusy(button, true, '保存中');
        try{
          const r = await fetchJson('/console/api/owner-token', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ ownerToken }) });
          if(input) input.value = '';
          setText('action-result', r.message + '\\n指纹：' + r.fingerprint + '\\n状态：' + r.strength);
          await loadStatus();
        }catch(err){ setText('action-result', err.message || String(err)); }
        finally{ setBusy(button, false); }
      }
      async function setFilePassword(button){
        const input = document.getElementById('custom-file-password');
        const password = input ? input.value.trim() : '';
        if(!password) return setText('action-result', '请先输入自定义文件浏览器密码。');
        if(!confirm('确认设置自定义文件浏览器密码？旧密码会立即失效。')) return;
        setBusy(button, true, '保存中');
        try{
          const r = await fetchJson('/console/api/file-browser-password', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ password }) });
          if(input) input.value = '';
          setText('action-result', r.message + '\\n用户名：' + r.username + '\\n指纹：' + r.fingerprint + '\\n状态：' + r.strength);
          await loadStatus();
        }catch(err){ setText('action-result', err.message || String(err)); }
        finally{ setBusy(button, false); }
      }
      async function restartAgentDesk(targetId, button){
        if(!targetId && !confirm('确认重启 AgentDesk？当前请求会完成，然后服务会短暂断开。')) return;
        setBusy(button, true, '重启中');
        try{ const r = await fetchJson('/console/api/restart',{method:'POST'}); setText(targetId || 'action-result', r.message + '\\n页面短暂断开后刷新即可。'); }
        catch(err){ setText(targetId || 'action-result', err.message || String(err)); }
        finally{ setBusy(button, false); }
      }
      async function loadLog(name, button){
        setBusy(button, true, '读取中');
        try{ const r = await fetchJson('/console/api/logs?name='+encodeURIComponent(name)); setText('log-box', (r.path ? '文件：'+r.path+'\\n\\n' : '') + (r.content || r.error || '空日志')); }
        catch(err){ setText('log-box', err.message || String(err)); }
        finally{ setBusy(button, false); }
      }
      function getByPath(source, path){ return path.split('.').reduce(function(obj, key){ return obj && obj[key]; }, source); }
      document.addEventListener('click', function(event){
        const target = event.target;
        if(!(target instanceof HTMLElement) || !target.dataset.copyPath) return;
        copyValue(getByPath(latestStatus || {}, target.dataset.copyPath), target.dataset.copyMessage || '已复制');
      });
      loadStatus(); loadConfigPanel(); setInterval(loadStatus, 10000);
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
  :root{color-scheme:light dark;--bg:#f6f7fb;--card:#fff;--text:#141824;--muted:#667085;--line:#e5e7eb;--brand:#155eef;--danger:#b42318;--warn:#b54708;--good:#067647;--soft:#eef4ff;--danger-soft:#fef3f2;--warn-soft:#fffaeb;--good-soft:#ecfdf3} @media(prefers-color-scheme:dark){:root{--bg:#0b1020;--card:#121a2b;--text:#eef2ff;--muted:#9aa4b2;--line:#273246;--soft:#14213d;--danger-soft:#2a1212;--warn-soft:#2b2111;--good-soft:#10261c}}
  *{box-sizing:border-box}body{margin:0;padding:28px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at top left,var(--soft),transparent 30%),var(--bg);color:var(--text)}a{color:var(--brand)}.hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:22px;padding:24px;border-radius:22px;background:linear-gradient(135deg,var(--card),var(--soft));border:1px solid var(--line);box-shadow:0 16px 40px rgba(15,23,42,.08)}.eyebrow{color:var(--brand);font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase}h1{margin:.2em 0;font-size:32px}h2{margin:0;font-size:18px}p{color:var(--muted)}.grid{display:grid;gap:14px}.cards{grid-template-columns:repeat(4,minmax(0,1fr))}.two{grid-template-columns:1fr 1fr}.card,.panel{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 8px 24px rgba(15,23,42,.05)}.label{display:block;color:var(--muted);font-size:13px;margin-bottom:8px}.card strong{display:block;font-size:24px}.card small,dd,.muted{color:var(--muted)}code,pre{background:rgba(127,127,127,.12);border-radius:8px;padding:3px 6px;word-break:break-all}.button,button{border:0;border-radius:10px;background:var(--brand);color:white;padding:9px 12px;text-decoration:none;cursor:pointer;font-weight:650;transition:transform .08s ease,opacity .12s ease}.button:hover,button:hover{transform:translateY(-1px)}button:disabled{opacity:.62;cursor:wait;transform:none}.button.secondary,button.secondary{background:rgba(127,127,127,.18);color:var(--text)}button.danger{background:var(--danger)}button.mini,.mini{padding:6px 9px;font-size:12px}.link-button{margin-left:6px;padding:4px 8px;border-radius:8px;background:rgba(127,127,127,.18);color:var(--text);font-size:12px}.hero-actions,.actions{display:flex;gap:8px;flex-wrap:wrap}.panel{margin-top:14px}.panel-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.panel-title small{color:var(--muted)}.health-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;list-style:none}.health-summary::-webkit-details-marker{display:none}.health-summary strong{display:block;font-size:18px}.health-summary small{display:block;color:var(--muted);margin-top:4px}.summary-hint{color:var(--muted);font-size:13px}.health-panel[open] .summary-hint{display:none}.health-body{margin-top:14px}.result,.logs{white-space:pre-wrap;max-height:360px;overflow:auto;padding:12px}.logs{font-size:12px;line-height:1.55}.editor{width:100%;min-height:130px;margin:10px 0;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--text);font:14px ui-monospace,SFMono-Regular,Consolas,monospace;line-height:1.5}.form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.form-grid label{display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:13px}.credential-grid{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end;margin-top:14px}.credential-grid label{display:flex;flex-direction:column;gap:6px;color:var(--muted);font-size:13px}.form-grid input,.form-grid select,.credential-grid input{border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);padding:9px;font:inherit}.form-grid input:focus,.form-grid select:focus,.editor:focus{outline:2px solid color-mix(in srgb,var(--brand) 35%,transparent);border-color:var(--brand)}.form-grid .full{grid-column:1/-1}.checks{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.checks label{flex-direction:row;align-items:center;color:var(--text)}dl{display:grid;grid-template-columns:130px 1fr;gap:8px 12px}dt{color:var(--muted)}dd{margin:0}.pill{display:inline-block;margin:4px;padding:7px 10px;background:var(--soft);border:1px solid var(--line);border-radius:999px;text-decoration:none}.hint-box,.issue{padding:10px 12px;border-radius:12px;border:1px solid var(--line);margin:10px 0;color:var(--text)}.hint-box.good,.issue.good{background:var(--good-soft);border-color:color-mix(in srgb,var(--good) 25%,var(--line))}.hint-box.warn,.issue.warn{background:var(--warn-soft);border-color:color-mix(in srgb,var(--warn) 25%,var(--line))}.issue.danger{background:var(--danger-soft);border-color:color-mix(in srgb,var(--danger) 25%,var(--line))}.issue-list{display:grid;gap:8px}.status-pill{display:inline-block;padding:3px 8px;border-radius:999px;background:rgba(127,127,127,.14);font-size:12px;font-weight:700}.status-pill.good,.tone-high{color:var(--good)}.status-pill.warn,.tone-medium{color:var(--warn)}.status-pill.danger,.tone-low{color:var(--danger)}.toast{position:fixed;right:22px;bottom:22px;padding:10px 14px;border-radius:12px;background:var(--text);color:var(--card);box-shadow:0 10px 30px rgba(0,0,0,.18);opacity:0;pointer-events:none;transform:translateY(8px);transition:.16s ease}.toast.show{opacity:1;transform:translateY(0)}@media(max-width:900px){body{padding:16px}.cards,.two,.form-grid,.credential-grid{grid-template-columns:1fr}.checks{grid-template-columns:1fr}.hero{display:block}.hero-actions{margin-top:12px}dl{grid-template-columns:1fr}.panel-title{align-items:flex-start;flex-direction:column}}
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

function normalizeCustomSecret(value: unknown, label: string): string {
  const secret = typeof value === "string" ? value.trim() : "";
  if (!secret) throw new Error(`${label} 不能为空。`);
  return secret;
}

async function readRequestJson(req: Request): Promise<any> {
  const parsedBody = (req as Request & { body?: unknown }).body;
  if (parsedBody && typeof parsedBody === "object") return parsedBody;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function normalizeAllowedRootsInput(value: unknown): Promise<string[]> {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : [];
  const candidates = Array.from(new Set(raw.map((entry) => String(entry).trim()).filter(Boolean)));
  if (!candidates.length) throw new Error("至少需要保留一个可访问目录。");
  if (candidates.length > 20) throw new Error("可访问目录最多 20 个。请只添加真正需要的目录。");

  const roots: string[] = [];
  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    const info = await stat(resolved).catch(() => undefined);
    if (!info) throw new Error(`目录不存在：${candidate}`);
    if (!info.isDirectory()) throw new Error(`不是目录：${candidate}`);
    roots.push(await realpath(resolved));
  }
  return roots;
}

async function readConsoleConfig(config: ServerConfig): Promise<ConsoleConfigForm> {
  const setup = await readSetupFile(config);
  return {
    port: readPort(setup.port, config.port),
    publicBaseUrl: readString(setup.publicBaseUrl, config.publicBaseUrl),
    allowedRoots: Array.isArray(setup.allowedRoots) ? setup.allowedRoots.map(String) : config.allowedRoots,
    permissionProfile: readPermissionProfile(setup.permissionProfile, config.permissionProfile),
    toolMode: readToolMode(setup.toolMode, config.toolMode),
    systemTools: readBoolean(setup.systemTools, config.systemToolsEnabled),
    processControl: readBoolean(setup.processControl, config.processControlEnabled),
    browserTools: readBoolean(setup.browserTools, config.browserToolsEnabled),
    browserMode: readBrowserMode(setup.browserMode, readBrowserMode(process.env.DEVSPACE_BROWSER_MODE, "isolated")),
    browserDebugPort: readPort(setup.browserDebugPort, Number(process.env.DEVSPACE_BROWSER_DEBUG_PORT ?? "9342")),
    edgeProfile: readString(setup.edgeProfile, process.env.DEVSPACE_BROWSER_PROFILE_DIRECTORY ?? "Default"),
    enablePublicFileBrowser: readBoolean(setup.enablePublicFileBrowser, process.env[PUBLIC_FILE_BROWSER_ENV] === "1"),
    plugins: readBoolean(setup.plugins, config.pluginsEnabled),
    skills: readBoolean(setup.skills, config.skillsEnabled),
    accountGating: readBoolean(setup.accountGating, config.account.enabled),
    accountId: readString(setup.accountId, config.account.accountId ?? ""),
    accountEmail: readString(setup.accountEmail, config.account.email ?? ""),
    accountPlan: readString(setup.accountPlan, config.account.plan),
    licenseKey: readString(setup.licenseKey, ""),
    licenseFeatures: readStringArray(setup.licenseFeatures, enabledAccountFeatures(config)),
    premiumFeatures: readStringArray(setup.premiumFeatures, config.account.premiumFeatures),
    licenseExpiresAt: readString(setup.licenseExpiresAt, config.account.expiresAt ?? ""),
  };
}

function runtimeConfig(config: ServerConfig): ConsoleConfigForm {
  return {
    port: config.port,
    publicBaseUrl: config.publicBaseUrl,
    allowedRoots: config.allowedRoots,
    permissionProfile: config.permissionProfile,
    toolMode: config.toolMode,
    systemTools: config.systemToolsEnabled,
    processControl: config.processControlEnabled,
    browserTools: config.browserToolsEnabled,
    browserMode: readBrowserMode(process.env.DEVSPACE_BROWSER_MODE, "isolated"),
    browserDebugPort: Number(process.env.DEVSPACE_BROWSER_DEBUG_PORT ?? "0"),
    edgeProfile: process.env.DEVSPACE_BROWSER_PROFILE_DIRECTORY ?? "Default",
    enablePublicFileBrowser: process.env[PUBLIC_FILE_BROWSER_ENV] === "1",
    plugins: config.pluginsEnabled,
    skills: config.skillsEnabled,
    accountGating: config.account.enabled,
    accountId: config.account.accountId ?? "",
    accountEmail: config.account.email ?? "",
    accountPlan: config.account.plan,
    licenseKey: "",
    licenseFeatures: enabledAccountFeatures(config),
    premiumFeatures: config.account.premiumFeatures,
    licenseExpiresAt: config.account.expiresAt ?? "",
  };
}

async function normalizeConsoleConfigInput(config: ServerConfig, input: any): Promise<ConsoleConfigForm> {
  const fallback = await readConsoleConfig(config);
  const publicBaseUrl = readString(input.publicBaseUrl, fallback.publicBaseUrl).replace(/\/$/, "");
  const parsedPublic = new URL(publicBaseUrl);
  if (!/^https?:$/.test(parsedPublic.protocol)) throw new Error("Public Base URL 必须以 http:// 或 https:// 开头。");

  return {
    port: readPort(input.port, fallback.port),
    publicBaseUrl,
    allowedRoots: await normalizeAllowedRootsInput(input.allowedRoots ?? fallback.allowedRoots),
    permissionProfile: readPermissionProfile(input.permissionProfile, fallback.permissionProfile),
    toolMode: readToolMode(input.toolMode, fallback.toolMode),
    systemTools: readBoolean(input.systemTools, fallback.systemTools),
    processControl: readBoolean(input.processControl, fallback.processControl),
    browserTools: readBoolean(input.browserTools, fallback.browserTools),
    browserMode: readBrowserMode(input.browserMode, fallback.browserMode),
    browserDebugPort: readPort(input.browserDebugPort, fallback.browserDebugPort),
    edgeProfile: readString(input.edgeProfile, fallback.edgeProfile).trim() || "Default",
    enablePublicFileBrowser: readBoolean(input.enablePublicFileBrowser, fallback.enablePublicFileBrowser),
    plugins: readBoolean(input.plugins, fallback.plugins),
    skills: readBoolean(input.skills, fallback.skills),
    accountGating: readBoolean(input.accountGating, fallback.accountGating),
    accountId: readString(input.accountId, fallback.accountId),
    accountEmail: readString(input.accountEmail, fallback.accountEmail),
    accountPlan: readString(input.accountPlan, fallback.accountPlan),
    licenseKey: typeof input.licenseKey === "string" ? input.licenseKey.trim() : fallback.licenseKey,
    licenseFeatures: readStringArray(input.licenseFeatures, fallback.licenseFeatures),
    premiumFeatures: readStringArray(input.premiumFeatures, fallback.premiumFeatures),
    licenseExpiresAt: readString(input.licenseExpiresAt, fallback.licenseExpiresAt),
  };
}

async function saveConsoleConfig(config: ServerConfig, next: ConsoleConfigForm): Promise<void> {
  await updateSetupFile(config, {
    port: next.port,
    publicBaseUrl: next.publicBaseUrl,
    allowedRoots: next.allowedRoots,
    permissionProfile: next.permissionProfile,
    toolMode: next.toolMode,
    systemTools: next.systemTools,
    processControl: next.processControl,
    browserTools: next.browserTools,
    browserMode: next.browserMode,
    browserDebugPort: next.browserDebugPort,
    edgeProfile: next.edgeProfile,
    enablePublicFileBrowser: next.enablePublicFileBrowser,
    plugins: next.plugins,
    skills: next.skills,
    accountGating: next.accountGating,
    accountId: next.accountId,
    accountEmail: next.accountEmail,
    accountPlan: next.accountPlan,
    licenseKey: next.licenseKey,
    licenseFeatures: next.licenseFeatures,
    premiumFeatures: next.premiumFeatures,
    licenseExpiresAt: next.licenseExpiresAt,
    updatedAt: new Date().toISOString(),
  });
}

function applyImmediateConfig(config: ServerConfig, next: ConsoleConfigForm): void {
  config.publicBaseUrl = next.publicBaseUrl;
  config.allowedRoots.splice(0, config.allowedRoots.length, ...next.allowedRoots);
  process.env.DEVSPACE_PUBLIC_BASE_URL = next.publicBaseUrl;
  process.env.DEVSPACE_ALLOWED_ROOTS = next.allowedRoots.join(",");
  process.env[PUBLIC_FILE_BROWSER_ENV] = next.enablePublicFileBrowser && isFeatureAllowed(config.account, "public_file_browser") ? "1" : "0";
  process.env.DEVSPACE_ACCOUNT_GATING = next.accountGating ? "1" : "0";
  process.env.DEVSPACE_ACCOUNT_ID = next.accountId;
  process.env.DEVSPACE_ACCOUNT_EMAIL = next.accountEmail;
  process.env.DEVSPACE_ACCOUNT_PLAN = next.accountPlan;
  process.env.DEVSPACE_LICENSE_KEY = next.licenseKey;
  process.env.DEVSPACE_LICENSE_FEATURES = next.licenseFeatures.join(",");
  process.env.DEVSPACE_PREMIUM_FEATURES = next.premiumFeatures.join(",");
  process.env.DEVSPACE_LICENSE_EXPIRES_AT = next.licenseExpiresAt;
}

async function readSetupFile(config: ServerConfig): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(setupFilePath(config), "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readPort(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error(`端口无效：${value}`);
  return parsed;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readStringArray(value: unknown, fallback: string[]): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : fallback;
  return Array.from(new Set(raw.map((entry) => String(entry).trim()).filter(Boolean)));
}

function enabledAccountFeatures(config: ServerConfig): string[] {
  return (Object.keys(ACCOUNT_FEATURE_LABELS) as AccountFeature[]).filter((feature) => config.account.features[feature]);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return fallback;
}

function readPermissionProfile(value: unknown, fallback: PermissionProfile): PermissionProfile {
  if (value === "safe" || value === "dev" || value === "power" || value === "owner") return value;
  return fallback;
}

function readToolMode(value: unknown, fallback: ToolMode): ToolMode {
  if (value === "minimal" || value === "full" || value === "codex") return value;
  return fallback;
}

function readBrowserMode(value: unknown, fallback: BrowserMode): BrowserMode {
  if (value === "isolated" || value === "live") return value;
  return fallback;
}

async function updateSetupFile(config: ServerConfig, patch: Record<string, unknown>): Promise<void> {
  const filePath = setupFilePath(config);
  let current: Record<string, unknown> = {};
  try {
    const raw = await readFile(filePath, "utf8");
    current = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    current = {};
  }
  await writeJsonNoBom(filePath, { ...current, ...patch });
}

function setupFilePath(config: ServerConfig): string {
  return resolve(dirname(config.stateDir), "setup.json");
}

function tokenStrength(token: string): "not-configured" | "configured" {
  return token ? "configured" : "not-configured";
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
