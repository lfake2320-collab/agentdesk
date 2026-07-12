import { timingSafeEqual } from "node:crypto";
import { readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { Express, Request, Response } from "express";
import type { ServerConfig } from "./config.js";
import { assertAllowedPath } from "./roots.js";
import { blockedFeatureMessage, isFeatureAllowed } from "./accounts.js";

const PUBLIC_FILE_BROWSER_ENV = "DEVSPACE_PUBLIC_FILE_BROWSER";
const FILE_BROWSER_TOKEN_ENV = "DEVSPACE_FILE_BROWSER_TOKEN";

export function registerFileBrowserRoutes(app: Express, config: ServerConfig): void {
  app.get("/local-files", async (req, res) => {
    if (!isLocalBrowserRequest(req)) {
      res.status(403).type("text/plain").send("local-files is only available from localhost / 127.0.0.1");
      return;
    }

    await renderFileBrowser(req, res, config, {
      basePath: "/local-files",
      title: "AgentDesk 本机文件浏览器",
      description: "本机只读模式：只能从这台电脑打开，不经过公网。",
      publicMode: false,
    });
  });

  app.get("/files", async (req, res) => {
    if (process.env[PUBLIC_FILE_BROWSER_ENV] !== "1") {
      res.status(404).type("text/plain").send("public file browser is disabled");
      return;
    }

    if (!isFeatureAllowed(config.account, "public_file_browser")) {
      res.status(402).type("text/plain").send(blockedFeatureMessage(config.account, "public_file_browser"));
      return;
    }

    const token = process.env[FILE_BROWSER_TOKEN_ENV];
    if (!token) {
      res.status(503).type("text/plain").send("public file browser token is not configured");
      return;
    }

    if (!checkBasicAuth(req, "agentdesk", token)) {
      res.setHeader("WWW-Authenticate", 'Basic realm="AgentDesk files", charset="UTF-8"');
      res.status(401).type("text/plain").send("Authentication required");
      return;
    }

    await renderFileBrowser(req, res, config, {
      basePath: "/files",
      title: "AgentDesk 公网文件浏览器",
      description: "公网只读模式：可用手机访问，需要独立文件浏览器密码。",
      publicMode: true,
    });
  });
}

async function renderFileBrowser(
  req: Request,
  res: Response,
  config: ServerConfig,
  options: { basePath: string; title: string; description: string; publicMode: boolean },
): Promise<void> {
  try {
    const currentPath = await resolveRequestedPath(req, config);
    const currentStat = await stat(currentPath);

    if (req.query.download === "1") {
      if (!currentStat.isFile()) {
        res.status(400).type("text/plain").send("Only files can be downloaded");
        return;
      }
      res.download(currentPath, basename(currentPath));
      return;
    }

    if (!currentStat.isDirectory()) {
      res.type("html").send(renderFilePage(options, currentPath, currentStat.size));
      return;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name, "zh-Hans-CN");
    });

    const rows = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = `${currentPath.replace(/[\\/]$/, "")}\\${entry.name}`;
        let size = "";
        let type = "其他";
        let href = hrefFor(options.basePath, entryPath);
        let action = "打开";

        if (entry.isDirectory()) {
          type = "目录";
        } else if (entry.isFile()) {
          type = "文件";
          action = "下载";
          href = hrefFor(options.basePath, entryPath, { download: "1" });
          try {
            size = formatBytes((await stat(entryPath)).size);
          } catch {
            size = "";
          }
        }

        return `<tr><td>${entry.isDirectory() ? "📁" : "📄"}</td><td>${escapeHtml(entry.name)}</td><td>${type}</td><td class="num">${size}</td><td><a href="${escapeAttr(href)}">${action}</a></td></tr>`;
      }),
    );

    const parentPath = dirname(currentPath);
    const parentAllowed = parentPath !== currentPath && isAllowed(parentPath, config.allowedRoots);
    res.type("html").send(renderDirectoryPage(options, config, currentPath, parentAllowed ? parentPath : undefined, rows.join("\n")));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).type("html").send(renderErrorPage(options.title, message));
  }
}

async function resolveRequestedPath(req: Request, config: ServerConfig): Promise<string> {
  const requested = typeof req.query.p === "string" && req.query.p.trim() ? req.query.p : config.allowedRoots[0];
  if (!requested) throw new Error("No allowed roots are configured");

  const allowed = assertAllowedPath(requested, config.allowedRoots);
  const resolvedRealPath = await realpath(allowed);
  return assertAllowedPath(resolvedRealPath, config.allowedRoots);
}

function isAllowed(path: string, allowedRoots: string[]): boolean {
  try {
    assertAllowedPath(path, allowedRoots);
    return true;
  } catch {
    return false;
  }
}

function isLocalBrowserRequest(req: Request): boolean {
  const host = req.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function checkBasicAuth(req: Request, username: string, password: string): boolean {
  const header = req.header("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;

  let decoded = "";
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return false;
  }

  const splitAt = decoded.indexOf(":");
  if (splitAt < 0) return false;

  const suppliedUser = decoded.slice(0, splitAt);
  const suppliedPassword = decoded.slice(splitAt + 1);
  return safeEqual(suppliedUser, username) && safeEqual(suppliedPassword, password);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function renderDirectoryPage(
  options: { basePath: string; title: string; description: string; publicMode: boolean },
  config: ServerConfig,
  currentPath: string,
  parentPath: string | undefined,
  rows: string,
): string {
  const rootLinks = config.allowedRoots
    .map((root) => `<a class="pill" href="${escapeAttr(hrefFor(options.basePath, root))}">${escapeHtml(root)}</a>`)
    .join(" ");
  const parentLink = parentPath ? `<a class="pill" href="${escapeAttr(hrefFor(options.basePath, parentPath))}">⬆ 上一级</a>` : "";
  return layout(
    options.title,
    `<p class="desc">${escapeHtml(options.description)}</p>
     <p class="warn">${options.publicMode ? "公网入口只读：可以查看目录和下载文件，不能删除、上传、修改或执行命令。" : "本机入口只读：只允许 localhost/127.0.0.1 访问。"}</p>
     <div class="roots"><strong>允许目录：</strong> ${rootLinks}</div>
     <div class="path"><strong>当前路径：</strong><code>${escapeHtml(currentPath)}</code></div>
     <div class="nav">${parentLink}</div>
     <table>
       <thead><tr><th></th><th>名称</th><th>类型</th><th>大小</th><th>操作</th></tr></thead>
       <tbody>${rows || `<tr><td colspan="5">这个目录是空的。</td></tr>`}</tbody>
     </table>`,
  );
}

function renderFilePage(
  options: { basePath: string; title: string; description: string },
  filePath: string,
  size: number,
): string {
  return layout(
    options.title,
    `<p class="desc">${escapeHtml(options.description)}</p>
     <div class="path"><strong>文件：</strong><code>${escapeHtml(filePath)}</code></div>
     <p>大小：${formatBytes(size)}</p>
     <p><a class="button" href="${escapeAttr(hrefFor(options.basePath, filePath, { download: "1" }))}">下载文件</a></p>
     <p><a href="${escapeAttr(hrefFor(options.basePath, dirname(filePath)))}">返回目录</a></p>`,
  );
}

function renderErrorPage(title: string, message: string): string {
  return layout(title, `<p class="error">${escapeHtml(message)}</p>`);
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;line-height:1.5;color:#111;background:#fafafa}
  h1{font-size:22px;margin:0 0 12px}
  .desc{color:#444}.warn{padding:10px 12px;background:#fff7e6;border:1px solid #ffd58a;border-radius:8px}.error{padding:12px;background:#ffecec;border:1px solid #ffb1b1;border-radius:8px;color:#9b111e}
  .roots,.path,.nav{margin:12px 0}.pill,.button{display:inline-block;margin:3px;padding:6px 10px;border-radius:999px;background:#eaf1ff;text-decoration:none;color:#174ea6}.button{border-radius:8px;background:#174ea6;color:white}
  code{word-break:break-all;background:#eee;padding:2px 4px;border-radius:4px}
  table{width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden}th,td{border-bottom:1px solid #eee;padding:9px;text-align:left}th{background:#f2f4f7}.num{text-align:right;color:#555;white-space:nowrap}
  a{color:#174ea6}
</style>
</head>
<body><h1>${escapeHtml(title)}</h1>${body}</body>
</html>`;
}

function hrefFor(basePath: string, path: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ p: path, ...extra });
  return `${basePath}?${params.toString()}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  for (const unit of units) {
    if (value < 1024) return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`;
    value /= 1024;
  }
  return `${value.toFixed(1)} PB`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
