import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { PermissionProfile } from "./permissions.js";

export type BrowserProfileMode = "isolated" | "live";

export interface BrowserToolOptions {
  profileDir: string;
  executablePath?: string;
  port?: number;
  mode?: BrowserProfileMode;
  liveUserDataDir?: string;
  profileDirectory?: string;
  attachOnly?: boolean;
}

export interface BrowserElementSummary {
  index: number;
  tag: string;
  text: string;
  selector: string;
  href?: string;
  type?: string;
  placeholder?: string;
  ariaLabel?: string;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
  elements: BrowserElementSummary[];
}

interface CdpTarget {
  id?: string;
  type?: string;
  url?: string;
  title?: string;
  webSocketDebuggerUrl?: string;
}

interface CdpResponse {
  id?: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export function canUseBrowserTools(profile: PermissionProfile): boolean {
  return profile === "owner";
}

export function defaultBrowserProfileDir(stateDir: string): string {
  return join(stateDir, "browser-profile");
}

export function defaultBrowserDebugPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.DEVSPACE_BROWSER_DEBUG_PORT ?? env.AGENTDESK_BROWSER_DEBUG_PORT;
  if (!raw) return 9222;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
    throw new Error(`Invalid DEVSPACE_BROWSER_DEBUG_PORT: ${raw}`);
  }
  return parsed;
}

export function browserProfileMode(env: NodeJS.ProcessEnv = process.env): BrowserProfileMode {
  const raw = (env.DEVSPACE_BROWSER_MODE ?? env.AGENTDESK_BROWSER_MODE ?? "isolated").toLowerCase();
  if (raw === "isolated" || raw === "live") return raw;
  throw new Error(`Invalid DEVSPACE_BROWSER_MODE: ${raw}. Expected isolated or live.`);
}

export function defaultEdgeUserDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DEVSPACE_BROWSER_USER_DATA_DIR ?? env.AGENTDESK_BROWSER_USER_DATA_DIR;
  if (configured) return configured;

  const current = platform();
  if (current === "win32") {
    const localAppData = env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
    return join(localAppData, "Microsoft", "Edge", "User Data");
  }
  if (current === "darwin") {
    return join(homedir(), "Library", "Application Support", "Microsoft Edge");
  }
  return join(homedir(), ".config", "microsoft-edge");
}

export function browserProfileDirectory(env: NodeJS.ProcessEnv = process.env): string {
  return env.DEVSPACE_BROWSER_PROFILE_DIRECTORY ?? env.AGENTDESK_BROWSER_PROFILE_DIRECTORY ?? "Default";
}

export function browserAttachOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.DEVSPACE_BROWSER_ATTACH_ONLY ?? env.AGENTDESK_BROWSER_ATTACH_ONLY;
  return raw === "1" || raw?.toLowerCase() === "true";
}

export function resolveBrowserExecutable(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DEVSPACE_BROWSER_EXECUTABLE ?? env.AGENTDESK_BROWSER_EXECUTABLE;
  if (configured) return configured;

  const candidates = browserExecutableCandidates();
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;

  return platform() === "win32" ? "msedge.exe" : "microsoft-edge";
}

export class BrowserController {
  private readonly profileDir: string;
  private readonly executablePath?: string;
  private readonly port: number;
  private readonly mode: BrowserProfileMode;
  private readonly liveUserDataDir: string;
  private readonly profileDirectory: string;
  private readonly attachOnly: boolean;
  private process?: ChildProcessWithoutNullStreams;
  private pageWsUrl?: string;

  constructor(options: BrowserToolOptions) {
    this.profileDir = options.profileDir;
    this.executablePath = options.executablePath;
    this.port = options.port ?? defaultBrowserDebugPort();
    this.mode = options.mode ?? browserProfileMode();
    this.liveUserDataDir = options.liveUserDataDir ?? defaultEdgeUserDataDir();
    this.profileDirectory = options.profileDirectory ?? browserProfileDirectory();
    this.attachOnly = options.attachOnly ?? browserAttachOnly();
  }

  async start(url = "about:blank", headless = false): Promise<string> {
    if (this.attachOnly) {
      await this.waitUntilReady();
      const target = await this.firstPageTarget();
      if (!target.webSocketDebuggerUrl) throw new Error("Attached browser has no debuggable page target.");
      this.pageWsUrl = target.webSocketDebuggerUrl;
      if (url && url !== "about:blank") await this.navigate(url);
      return target.url ?? url;
    }

    await mkdir(this.activeUserDataDir(), { recursive: true });
    if (!this.process || this.process.killed) {
      const executable = this.executablePath ?? resolveBrowserExecutable();
      const args = this.launchArgs(url, headless);
      this.process = spawn(executable, args, {
        stdio: "pipe",
        windowsHide: false,
        detached: false,
      });
    }

    await this.waitUntilReady();
    const target = await this.firstPageTarget();
    if (!target.webSocketDebuggerUrl) {
      throw new Error("Browser started but no debuggable page target was found.");
    }
    this.pageWsUrl = target.webSocketDebuggerUrl;
    if (url && url !== "about:blank") {
      await this.navigate(url);
    }
    return target.url ?? url;
  }

  async navigate(url: string): Promise<string> {
    const normalizedUrl = normalizeUrl(url);
    const wsUrl = await this.ensurePageWsUrl(normalizedUrl);
    await cdpCommand(wsUrl, "Page.enable");
    await cdpCommand(wsUrl, "Page.navigate", { url: normalizedUrl });
    await delay(500);
    return normalizedUrl;
  }

  async snapshot(): Promise<BrowserSnapshot> {
    const wsUrl = await this.ensurePageWsUrl();
    const result = await cdpCommand(wsUrl, "Runtime.evaluate", {
      expression: snapshotExpression(),
      returnByValue: true,
      awaitPromise: true,
    });
    const value = runtimeValue(result);
    if (!isBrowserSnapshot(value)) {
      throw new Error("Browser snapshot returned an unexpected shape.");
    }
    return value;
  }

  async click(input: { selector?: string; text?: string }): Promise<string> {
    if (!input.selector && !input.text) {
      throw new Error("Provide either selector or text for browser_click.");
    }
    const wsUrl = await this.ensurePageWsUrl();
    const result = await cdpCommand(wsUrl, "Runtime.evaluate", {
      expression: clickExpression(input),
      returnByValue: true,
      awaitPromise: true,
    });
    const value = runtimeValue(result);
    if (typeof value !== "string") throw new Error("Click returned an unexpected result.");
    await delay(300);
    return value;
  }

  async type(input: { selector: string; text: string; clear?: boolean }): Promise<string> {
    const wsUrl = await this.ensurePageWsUrl();
    const result = await cdpCommand(wsUrl, "Runtime.evaluate", {
      expression: typeExpression(input),
      returnByValue: true,
      awaitPromise: true,
    });
    const value = runtimeValue(result);
    if (typeof value !== "string") throw new Error("Type returned an unexpected result.");
    return value;
  }

  async close(): Promise<void> {
    if (this.mode === "isolated" && this.process && !this.process.killed) {
      this.process.kill();
    }
    this.process = undefined;
    this.pageWsUrl = undefined;
  }

  private activeUserDataDir(): string {
    return this.mode === "live" ? this.liveUserDataDir : this.profileDir;
  }

  private launchArgs(url: string, headless: boolean): string[] {
    const args = [
      `--remote-debugging-port=${this.port}`,
      `--user-data-dir=${this.activeUserDataDir()}`,
      "--no-first-run",
      "--no-default-browser-check",
      ...(headless ? ["--headless=new", "--disable-gpu"] : []),
    ];
    if (this.mode === "isolated") {
      args.push("--disable-background-networking");
    } else {
      args.push(`--profile-directory=${this.profileDirectory}`);
    }
    args.push(url);
    return args;
  }

  private async ensurePageWsUrl(url = "about:blank"): Promise<string> {
    if (this.attachOnly) {
      await this.waitUntilReady();
    } else if (!this.process || this.process.killed) {
      await this.start(url);
    }
    if (this.pageWsUrl) return this.pageWsUrl;
    await this.waitUntilReady();
    const target = await this.firstPageTarget();
    if (!target.webSocketDebuggerUrl) throw new Error("No debuggable page target found.");
    this.pageWsUrl = target.webSocketDebuggerUrl;
    return this.pageWsUrl;
  }

  private async waitUntilReady(): Promise<void> {
    const deadline = Date.now() + 10_000;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.port}/json/version`);
        if (response.ok) return;
      } catch (error) {
        lastError = error;
      }
      await delay(150);
    }
    const modeHelp = this.mode === "live"
      ? " In live mode, close existing Edge windows that already use the same profile, or start Edge yourself with --remote-debugging-port and set DEVSPACE_BROWSER_ATTACH_ONLY=1."
      : "";
    throw new Error(`Browser debugging endpoint did not become ready: ${lastError instanceof Error ? lastError.message : "timeout"}.${modeHelp}`);
  }

  private async firstPageTarget(): Promise<CdpTarget> {
    const response = await fetch(`http://127.0.0.1:${this.port}/json/list`);
    if (!response.ok) throw new Error(`Could not list browser targets: HTTP ${response.status}`);
    const targets = (await response.json()) as CdpTarget[];
    const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
    if (page) return page;
    const newPage = await fetch(`http://127.0.0.1:${this.port}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" });
    if (!newPage.ok) throw new Error(`Could not create browser page: HTTP ${newPage.status}`);
    return (await newPage.json()) as CdpTarget;
  }
}

export function formatBrowserSnapshot(snapshot: BrowserSnapshot): string {
  const elementLines = snapshot.elements.slice(0, 40).map((element) => {
    const label = [element.text, element.ariaLabel, element.placeholder].find(Boolean) ?? "";
    const meta = [
      `#${element.index}`,
      element.tag,
      element.selector,
      label ? `text=\"${truncate(label, 80)}\"` : undefined,
      element.href ? `href=${truncate(element.href, 80)}` : undefined,
    ].filter(Boolean).join(" ");
    return `  - ${meta}`;
  });

  return [
    `URL: ${snapshot.url}`,
    `Title: ${snapshot.title || "(untitled)"}`,
    "Text:",
    truncate(snapshot.text, 4_000) || "(no visible text)",
    snapshot.elements.length > 0 ? `Interactive elements (${snapshot.elements.length}, showing ${elementLines.length}):` : "Interactive elements: none detected",
    ...elementLines,
  ].join("\n");
}

async function cdpCommand(wsUrl: string, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1_000_000_000);
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error(`CDP command timed out: ${method}`));
    }, 10_000);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.addEventListener("message", (event) => {
      const text = typeof event.data === "string" ? event.data : Buffer.from(event.data as ArrayBuffer).toString("utf8");
      const message = JSON.parse(text) as CdpResponse;
      if (message.id !== id) return;
      clearTimeout(timer);
      ws.close();
      if (message.error) {
        reject(new Error(`${method} failed: ${message.error.message}`));
        return;
      }
      resolve(message.result);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`Could not connect to browser CDP target for ${method}.`));
    });
  });
}

function runtimeValue(result: unknown): unknown {
  const record = result as { result?: { value?: unknown } };
  return record.result?.value;
}

function snapshotExpression(): string {
  return `(() => {
    function cssPath(el) {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      let current = el;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4) {
        let part = current.tagName.toLowerCase();
        if (current.getAttribute('name')) part += '[name="' + CSS.escape(current.getAttribute('name')) + '"]';
        else {
          const parent = current.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
            if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
          }
        }
        parts.unshift(part);
        current = current.parentElement;
      }
      return parts.join(' > ');
    }
    const elements = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]')).slice(0, 80).map((el, index) => ({
      index,
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      selector: cssPath(el),
      href: el.href || undefined,
      type: el.type || undefined,
      placeholder: el.placeholder || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
    }));
    return {
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 6000),
      elements,
    };
  })()`;
}

function clickExpression(input: { selector?: string; text?: string }): string {
  return `(() => {
    const selector = ${JSON.stringify(input.selector ?? null)};
    const text = ${JSON.stringify(input.text ?? null)};
    let el = selector ? document.querySelector(selector) : null;
    if (!el && text) {
      const needle = text.toLowerCase();
      el = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"],[contenteditable="true"]'))
        .find((item) => ((item.innerText || item.value || item.getAttribute('aria-label') || '').toLowerCase()).includes(needle));
    }
    if (!el) throw new Error('No matching element found.');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return 'Clicked ' + (selector || text);
  })()`;
}

function typeExpression(input: { selector: string; text: string; clear?: boolean }): string {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(input.selector)});
    if (!el) throw new Error('No matching input found.');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.focus();
    if (${input.clear ? "true" : "false"}) el.value = '';
    if ('value' in el) el.value = (el.value || '') + ${JSON.stringify(input.text)};
    else el.textContent = (el.textContent || '') + ${JSON.stringify(input.text)};
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'Typed into ' + ${JSON.stringify(input.selector)};
  })()`;
}

function normalizeUrl(url: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return url;
  return `https://${url}`;
}

function isBrowserSnapshot(value: unknown): value is BrowserSnapshot {
  const snapshot = value as Partial<BrowserSnapshot>;
  return typeof snapshot?.url === "string" && typeof snapshot.title === "string" && typeof snapshot.text === "string" && Array.isArray(snapshot.elements);
}

function browserExecutableCandidates(): string[] {
  const current = platform();
  if (current === "win32") {
    const home = homedir();
    return [
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      join(home, "AppData", "Local", "Microsoft", "Edge", "Application", "msedge.exe"),
      join(home, "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
  }
  if (current === "darwin") {
    return [
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  return ["/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
