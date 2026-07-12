#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const runtimeDir = join(projectRoot, ".agentdesk-fixed-runtime");
const configDir = join(runtimeDir, "config");
const logDir = join(runtimeDir, "logs");
const setupFile = join(runtimeDir, "setup.json");
const authFile = join(configDir, "auth.json");
const fileBrowserAuthFile = join(configDir, "file-browser-auth.json");
const tunnelConfigFile = join(runtimeDir, "agentdesk-cloudflared.yml");

let job = {
  running: false,
  done: false,
  ok: false,
  log: "",
  result: null,
};

function main() {
  mkdirSync(configDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/") return sendHtml(res, pageHtml());
      if (req.method === "GET" && url.pathname === "/api/defaults") return sendJson(res, defaults());
      if (req.method === "GET" && url.pathname === "/api/job") return sendJson(res, job);
      if (req.method === "POST" && url.pathname === "/api/install") return startInstall(req, res);
      sendText(res, 404, "Not found");
    } catch (error) {
      sendText(res, 500, error instanceof Error ? error.stack ?? error.message : String(error));
    }
  });

  server.listen(7876, "127.0.0.1", () => {
    const url = "http://127.0.0.1:7876/";
    console.log(`AgentDesk Setup Wizard is running at ${url}`);
    openBrowser(url);
  });
}

function defaults() {
  const setup = readJson(setupFile) ?? {};
  const docs = join(homedir(), "Documents");
  const workspaceRoot = join(docs, "AgentDesk-Workspaces");
  try {
    mkdirSync(workspaceRoot, { recursive: true });
  } catch {
    // The setup page can still render; installation will report filesystem errors later if needed.
  }
  const roots = Array.isArray(setup.allowedRoots) && setup.allowedRoots.length
    ? setup.allowedRoots
    : [projectRoot, workspaceRoot].filter(Boolean);

  return {
    projectRoot,
    nodeVersion: process.version,
    npmAvailable: commandAvailable("npm"),
    cloudflaredAvailable: commandAvailable("cloudflared"),
    hasNodeModules: existsSync(join(projectRoot, "node_modules")),
    hasBuild: existsSync(join(projectRoot, "dist", "cli.js")),
    hasSetup: existsSync(setupFile),
    defaultConfig: {
      port: setup.port ?? 7875,
      browserDebugPort: setup.browserDebugPort ?? 9342,
      publicBaseUrl: setup.publicBaseUrl ?? "http://127.0.0.1:7875",
      edgeProfile: setup.edgeProfile ?? "Default",
      allowedRoots: roots,
      enablePublicFileBrowser: setup.enablePublicFileBrowser ?? false,
      enableTunnel: setup.enableTunnel ?? false,
      allowWideRoots: setup.allowWideRoots ?? false,
      tunnelName: setup.tunnelName ?? "agentdesk",
      tunnelId: setup.tunnelId ?? "",
      tunnelHostname: setup.tunnelHostname ?? "",
      tunnelCredentialsFile: setup.tunnelCredentialsFile ?? "",
    },
  };
}

async function startInstall(req, res) {
  if (job.running) return sendJson(res, { accepted: false, message: "Install is already running." }, 409);
  const body = await readRequestJson(req);
  job = { running: true, done: false, ok: false, log: "", result: null };
  runInstall(body).catch((error) => {
    appendLog(`\n[ERROR] ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    job.running = false;
    job.done = true;
    job.ok = false;
  });
  sendJson(res, { accepted: true });
}

async function runInstall(input) {
  appendLog("AgentDesk first-run setup started.\n");
  const cfg = normalizeConfig(input);

  mkdirSync(configDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });

  writeJson(setupFile, {
    port: cfg.port,
    browserDebugPort: cfg.browserDebugPort,
    publicBaseUrl: cfg.publicBaseUrl,
    edgeProfile: cfg.edgeProfile,
    allowedRoots: cfg.allowedRoots,
    enablePublicFileBrowser: cfg.enablePublicFileBrowser,
    enableTunnel: cfg.enableTunnel,
    allowWideRoots: cfg.allowWideRoots,
    tunnelName: cfg.tunnelName,
    tunnelId: cfg.tunnelId,
    tunnelHostname: cfg.tunnelHostname,
    tunnelCredentialsFile: cfg.tunnelCredentialsFile,
    createdAt: new Date().toISOString(),
  });
  appendLog(`Wrote setup: ${setupFile}\n`);

  const ownerToken = cfg.ownerToken || randomToken("adsk-owner");
  assertStrongToken(ownerToken, "Owner Token");
  writeJson(authFile, { ownerToken });
  appendLog(`Wrote owner token file: ${authFile}\n`);

  const filePassword = cfg.fileBrowserPassword || randomToken("adsk-files");
  assertStrongToken(filePassword, "File browser password");
  writeJson(fileBrowserAuthFile, { username: "agentdesk", password: filePassword });
  appendLog(`Wrote file browser password file: ${fileBrowserAuthFile}\n`);

  if (cfg.enableTunnel) {
    writeTunnelConfig(cfg);
    appendLog(`Wrote Cloudflare tunnel config: ${tunnelConfigFile}\n`);
  } else {
    appendLog("Cloudflare tunnel disabled. Public HTTPS address can be configured later.\n");
  }

  if (cfg.installDeps) {
    await runCommand("npm", ["install"], projectRoot);
  } else {
    appendLog("Skipped npm install.\n");
  }

  if (cfg.build) {
    await runCommand("npm", ["run", "build"], projectRoot);
  } else {
    appendLog("Skipped npm run build.\n");
  }

  if (!existsSync(join(projectRoot, "dist", "cli.js"))) {
    throw new Error("dist\\cli.js was not found. Build failed or was skipped.");
  }

  const psArgs = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    join(projectRoot, "scripts", "install-agentdesk-tasks.ps1"),
    "-ProjectRoot",
    projectRoot,
    "-Start",
  ];
  if (cfg.enableTunnel) psArgs.push("-InstallTunnel");
  await runCommand("powershell.exe", psArgs, projectRoot);

  const localConsole = `http://127.0.0.1:${cfg.port}/console`;
  const publicStatus = `${cfg.publicBaseUrl.replace(/\/$/, "")}/status`;
  appendLog("\nAgentDesk setup completed.\n");
  appendLog(`Local console: ${localConsole}\n`);
  appendLog(`MCP URL: ${cfg.publicBaseUrl.replace(/\/$/, "")}/mcp\n`);
  if (cfg.enableTunnel) appendLog(`Public status: ${publicStatus}\n`);

  job.running = false;
  job.done = true;
  job.ok = true;
  job.result = {
    localConsole,
    mcpUrl: `${cfg.publicBaseUrl.replace(/\/$/, "")}/mcp`,
    publicStatus: cfg.enableTunnel ? publicStatus : null,
  };
  openBrowser(localConsole);
}

function normalizeConfig(input) {
  const port = parseInt(input.port, 10) || 7875;
  const browserDebugPort = parseInt(input.browserDebugPort, 10) || 9342;
  if (port < 1 || port > 65535) throw new Error("Invalid port.");
  if (browserDebugPort < 1 || browserDebugPort > 65535) throw new Error("Invalid browser debug port.");

  const publicBaseUrl = String(input.publicBaseUrl || `http://127.0.0.1:${port}`).trim().replace(/\/$/, "");
  const parsedPublic = new URL(publicBaseUrl);
  if (!/^https?:$/.test(parsedPublic.protocol)) throw new Error("Public base URL must start with http:// or https://");

  const allowedRoots = String(input.allowedRoots || projectRoot)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!allowedRoots.length) throw new Error("At least one allowed root is required.");
  const allowWideRoots = Boolean(input.allowWideRoots);
  const wideRoots = allowedRoots.filter(isWideAllowedRoot);
  if (wideRoots.length && !allowWideRoots) {
    throw new Error(`Allowed roots are too broad: ${wideRoots.join(", ")}. Use a specific project folder, or tick the wide-root acknowledgement checkbox if you really need this.`);
  }

  const enableTunnel = Boolean(input.enableTunnel);
  const tunnelName = String(input.tunnelName || "agentdesk").trim();
  const tunnelId = String(input.tunnelId || "").trim();
  const tunnelHostname = String(input.tunnelHostname || "").trim();
  const tunnelCredentialsFile = String(input.tunnelCredentialsFile || "").trim();

  if (enableTunnel) {
    if (!tunnelName) throw new Error("Tunnel name is required when Cloudflare Tunnel is enabled.");
    if (!tunnelId) throw new Error("Tunnel ID is required when Cloudflare Tunnel is enabled.");
    if (!tunnelHostname) throw new Error("Tunnel hostname is required when Cloudflare Tunnel is enabled.");
    if (!tunnelCredentialsFile) throw new Error("Tunnel credentials file is required when Cloudflare Tunnel is enabled.");
    if (!existsSync(tunnelCredentialsFile)) throw new Error(`Tunnel credentials file does not exist: ${tunnelCredentialsFile}`);
  }

  return {
    port,
    browserDebugPort,
    publicBaseUrl,
    edgeProfile: String(input.edgeProfile || "Default").trim() || "Default",
    allowedRoots,
    enablePublicFileBrowser: Boolean(input.enablePublicFileBrowser),
    enableTunnel,
    allowWideRoots,
    tunnelName,
    tunnelId,
    tunnelHostname,
    tunnelCredentialsFile,
    ownerToken: String(input.ownerToken || "").trim(),
    fileBrowserPassword: String(input.fileBrowserPassword || "").trim(),
    installDeps: input.installDeps !== false,
    build: input.build !== false,
  };
}

function isWideAllowedRoot(root) {
  const value = String(root || "").trim();
  if (!value) return false;
  if (/^[A-Za-z]:[\\/]?$/.test(value)) return true;
  if (value === "/") return true;
  const normalizedHome = homedir().replace(/[\\/]+$/, "").toLowerCase();
  return value.replace(/[\\/]+$/, "").toLowerCase() === normalizedHome;
}

function writeTunnelConfig(cfg) {
  const yaml = [
    `tunnel: ${cfg.tunnelId}`,
    `credentials-file: ${cfg.tunnelCredentialsFile}`,
    "protocol: quic",
    "ingress:",
    `  - hostname: ${cfg.tunnelHostname}`,
    `    service: http://127.0.0.1:${cfg.port}`,
    "  - service: http_status:404",
    "",
  ].join("\n");
  writeFileSync(tunnelConfigFile, yaml, "utf8");
}

function assertStrongToken(token, label) {
  if (!token || token.length < 32) throw new Error(`${label} must be at least 32 characters long.`);
  if (/^(.)\1+$/.test(token)) throw new Error(`${label} cannot be made of one repeated character.`);
}

function randomToken(prefix) {
  return `${prefix}-${randomBytes(32).toString("base64url")}`;
}

function runCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    appendLog(`\n$ ${command} ${args.map(quoteArg).join(" ")}\n`);
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    child.stdout.on("data", (chunk) => appendLog(chunk.toString()));
    child.stderr.on("data", (chunk) => appendLog(chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      appendLog(`\n[exit ${code}] ${command}\n`);
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function quoteArg(value) {
  const s = String(value);
  return /\s/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

function appendLog(text) {
  job.log += text;
  if (job.log.length > 200000) job.log = job.log.slice(-200000);
  process.stdout.write(text);
}

function commandAvailable(command) {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], { windowsHide: true });
  return result.status === 0;
}

function openBrowser(url) {
  if (process.platform === "win32") spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  else spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
}

function readJson(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readRequestJson(req) {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("Request too large"));
    });
    req.on("end", () => {
      try {
        resolvePromise(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value, null, 2));
}

function sendHtml(res, html) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

function pageHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AgentDesk Setup Wizard</title>
<style>
  :root{color-scheme:light dark}body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#0b1020;color:#eef2ff}.wrap{max-width:1040px;margin:0 auto;padding:28px}.hero{padding:24px;border:1px solid rgba(255,255,255,.12);border-radius:22px;background:linear-gradient(135deg,#172554,#111827)}h1{margin:0 0 8px;font-size:30px}.sub{color:#c7d2fe}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}.card{background:#111827;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px}.full{grid-column:1/-1}label{display:block;font-size:13px;color:#cbd5e1;margin:12px 0 6px}input,textarea{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid #334155;background:#020617;color:#e5e7eb;padding:10px;font:inherit}textarea{min-height:92px}button{border:0;border-radius:12px;background:#4f46e5;color:white;padding:12px 16px;font-weight:700;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.hint{font-size:13px;color:#94a3b8}.ok{color:#86efac}.bad{color:#fca5a5}.pill{display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:999px;padding:5px 9px;margin:3px;font-size:12px}.log{white-space:pre-wrap;background:#020617;border:1px solid #334155;border-radius:14px;padding:12px;min-height:200px;max-height:460px;overflow:auto;color:#d1d5db;font-family:Consolas,monospace;font-size:12px}.toggle{display:flex;gap:8px;align-items:center}.toggle input{width:auto}.links a{color:#93c5fd;margin-right:14px}@media(max-width:800px){.grid{grid-template-columns:1fr}.wrap{padding:16px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="hero">
    <h1>AgentDesk Setup Wizard</h1>
    <div class="sub">第一次克隆后，双击 <b>Start-AgentDesk.cmd</b>，在这个网页里完成从零配置。</div>
    <div id="env" class="hint" style="margin-top:10px">Loading environment...</div>
  </div>

  <form id="form" class="grid">
    <section class="card">
      <h2>1. 基础服务</h2>
      <label>本地端口</label><input name="port" value="7875" />
      <label>Public Base URL</label><input name="publicBaseUrl" value="http://127.0.0.1:7875" />
      <div class="hint">本地使用可保持 127.0.0.1；要给 ChatGPT/手机公网访问，填你的 HTTPS 域名。</div>
      <label>Edge Profile</label><input name="edgeProfile" value="Default" />
      <label>浏览器调试端口</label><input name="browserDebugPort" value="9342" />
    </section>

    <section class="card">
      <h2>2. 安全凭据</h2>
      <label>Owner Token</label><input name="ownerToken" placeholder="留空自动生成强 token" />
      <label>公网文件浏览器密码</label><input name="fileBrowserPassword" placeholder="留空自动生成强密码" />
      <label class="toggle"><input type="checkbox" name="enablePublicFileBrowser" /> 启用公网只读文件浏览器 /files</label>
      <div class="hint">不会接受全 A、全 1 等弱口令。文件浏览器和 MCP Owner Token 分开。</div>
    </section>

    <section class="card full">
      <h2>3. 允许访问目录</h2>
      <textarea name="allowedRoots"></textarea>
      <div class="hint">每行一个目录。默认只放当前 AgentDesk 项目和 Documents\\AgentDesk-Workspaces。不要填 C:\\、D:\\、G:\\ 这种整盘根目录，除非你明确知道风险。</div>
      <label class="toggle"><input type="checkbox" name="allowWideRoots" /> 我知道风险，仍允许磁盘根目录 / 用户主目录作为 allowed roots</label>
    </section>

    <section class="card full">
      <h2>4. Cloudflare Tunnel，可选</h2>
      <label class="toggle"><input type="checkbox" name="enableTunnel" id="enableTunnel" /> 启用固定公网域名 Tunnel</label>
      <div id="tunnelFields">
        <label>Tunnel 名称</label><input name="tunnelName" value="agentdesk" />
        <label>Tunnel ID</label><input name="tunnelId" placeholder="例如 e80a8157-..." />
        <label>公网域名 Hostname</label><input name="tunnelHostname" placeholder="例如 agentdesk.example.com" />
        <label>credentials-file 路径</label><input name="tunnelCredentialsFile" placeholder="例如 C:\\Users\\you\\.cloudflared\\<tunnel-id>.json" />
      </div>
      <div class="hint">
        没有 Cloudflare 凭据也可以先跳过，先用本机控制台。公网域名稍后再配。<br />
        小白填写顺序：先运行 <code>cloudflared tunnel create agentdesk</code> 得到 Tunnel ID；再在 <code>C:\\Users\\你\\.cloudflared</code> 找到同名 JSON 作为 credentials-file；最后把 DNS hostname 指到这个 tunnel。完整步骤见 <code>docs/cloudflare-tunnel.md</code>。
      </div>
    </section>

    <section class="card full">
      <h2>5. 安装动作</h2>
      <label class="toggle"><input type="checkbox" name="installDeps" checked /> 运行 npm install</label>
      <label class="toggle"><input type="checkbox" name="build" checked /> 运行 npm run build</label>
      <div class="row" style="margin-top:14px"><button id="installBtn" type="submit">开始安装并启动 AgentDesk</button><span id="state" class="hint"></span></div>
      <div class="links" id="links" style="margin-top:12px"></div>
    </section>
  </form>

  <section class="card" style="margin-top:16px">
    <h2>安装日志</h2>
    <div id="log" class="log">等待开始...</div>
  </section>
</div>
<script>
const form = document.getElementById('form');
const logEl = document.getElementById('log');
const stateEl = document.getElementById('state');
const linksEl = document.getElementById('links');
const installBtn = document.getElementById('installBtn');
let polling = null;

async function loadDefaults(){
  const data = await fetch('/api/defaults').then(r=>r.json());
  document.getElementById('env').innerHTML = [
    '<span class="pill">Project: '+esc(data.projectRoot)+'</span>',
    '<span class="pill">Node: '+esc(data.nodeVersion)+'</span>',
    '<span class="pill '+(data.npmAvailable?'ok':'bad')+'">npm: '+(data.npmAvailable?'OK':'Missing')+'</span>',
    '<span class="pill '+(data.cloudflaredAvailable?'ok':'bad')+'">cloudflared: '+(data.cloudflaredAvailable?'OK':'Optional')+'</span>',
    '<span class="pill '+(data.hasBuild?'ok':'bad')+'">build: '+(data.hasBuild?'exists':'not built')+'</span>'
  ].join(' ');
  const c=data.defaultConfig;
  for(const [k,v] of Object.entries(c)){
    const el=form.elements[k]; if(!el) continue;
    if(el.type==='checkbox') el.checked=!!v;
    else if(Array.isArray(v)) el.value=v.join('\n');
    else el.value=v ?? '';
  }
}

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const payload={};
  for(const el of form.elements){
    if(!el.name) continue;
    payload[el.name]=el.type==='checkbox'?el.checked:el.value;
  }
  installBtn.disabled=true; stateEl.textContent='安装中...'; linksEl.textContent=''; logEl.textContent='Starting...';
  const res=await fetch('/api/install',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  if(!res.ok){ stateEl.textContent=await res.text(); installBtn.disabled=false; return; }
  polling=setInterval(poll,1000); poll();
});

async function poll(){
  const j=await fetch('/api/job').then(r=>r.json());
  logEl.textContent=j.log||''; logEl.scrollTop=logEl.scrollHeight;
  if(j.done){
    clearInterval(polling); installBtn.disabled=false; stateEl.textContent=j.ok?'安装完成':'安装失败'; stateEl.className=j.ok?'ok':'bad';
    if(j.result){ linksEl.innerHTML = '<a target="_blank" href="'+escAttr(j.result.localConsole)+'">打开本机控制台</a><a target="_blank" href="'+escAttr(j.result.mcpUrl)+'">MCP 地址</a>'+(j.result.publicStatus?'<a target="_blank" href="'+escAttr(j.result.publicStatus)+'">公网状态页</a>':''); }
  }
}
function esc(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
function escAttr(s){return esc(s).replace(/'/g,'&#39;');}
loadDefaults().catch(err=>{document.getElementById('env').textContent=err.stack||err.message||String(err)});
</script>
</body>
</html>`;
}

main();
