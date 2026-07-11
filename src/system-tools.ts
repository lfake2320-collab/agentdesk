import { execFile } from "node:child_process";
import { arch, cpus, freemem, platform, release, totalmem, type } from "node:os";
import { promisify } from "node:util";
import type { PermissionProfile } from "./permissions.js";

const execFileAsync = promisify(execFile);

export interface SystemSummary {
  os: {
    type: string;
    platform: NodeJS.Platform;
    release: string;
    arch: string;
  };
  node: string;
  cpuCount: number;
  memory: {
    totalMb: number;
    freeMb: number;
  };
}

export interface ProxySummary {
  variables: Record<string, string>;
  hasProxy: boolean;
}

export interface ListeningPort {
  protocol: string;
  localAddress: string;
  port: number;
  state?: string;
  pid?: number;
  process?: string;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  command?: string;
  memoryKb?: number;
  sessionName?: string;
}

export interface SystemDiagnostics {
  summary: SystemSummary;
  proxy: ProxySummary;
  ports: ListeningPort[];
  notes: string[];
}

export interface KillProcessOptions {
  pid: number;
  force?: boolean;
}

const PROXY_ENV_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
];

export function canUseSystemTools(profile: PermissionProfile): boolean {
  return profile === "power" || profile === "owner";
}

export function canUseProcessControl(profile: PermissionProfile, enabled: boolean): boolean {
  return enabled && profile === "owner";
}

export function systemSummary(): SystemSummary {
  return {
    os: {
      type: type(),
      platform: platform(),
      release: release(),
      arch: arch(),
    },
    node: process.version,
    cpuCount: cpus().length,
    memory: {
      totalMb: Math.round(totalmem() / 1024 / 1024),
      freeMb: Math.round(freemem() / 1024 / 1024),
    },
  };
}

export function proxySummary(env: NodeJS.ProcessEnv = process.env): ProxySummary {
  const variables: Record<string, string> = {};
  for (const key of PROXY_ENV_KEYS) {
    const value = env[key];
    if (!value) continue;
    variables[key] = redactProxyValue(value);
  }

  return {
    variables,
    hasProxy: Object.keys(variables).length > 0,
  };
}

export function redactProxyValue(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? "***" : "";
      parsed.password = parsed.password ? "***" : "";
    }
    return parsed.toString();
  } catch {
    return value.replace(/\/\/([^/@\s]+)@/, "//***:***@");
  }
}

export async function listListeningPorts(filterPort?: number): Promise<ListeningPort[]> {
  const currentPlatform = platform();
  if (currentPlatform === "win32") {
    return filterPorts(parseWindowsNetstat(await runNetstatWindows()), filterPort);
  }

  const unixOutput = await runUnixListeningCommand();
  return filterPorts(parseUnixListeningOutput(unixOutput), filterPort);
}

export async function listProcesses(query?: string, limit = 80): Promise<ProcessInfo[]> {
  const processes = platform() === "win32"
    ? parseWindowsTasklist(await runTasklistWindows())
    : parseUnixPs(await runUnixProcessCommand());
  return filterProcesses(processes, query).slice(0, Math.max(1, Math.min(limit, 500)));
}

export async function killProcess(options: KillProcessOptions): Promise<string> {
  assertKillablePid(options.pid);
  if (platform() === "win32") {
    const args = ["/PID", String(options.pid), "/T"];
    if (options.force) args.push("/F");
    const { stdout, stderr } = await execFileAsync("taskkill", args, { timeout: 10_000, windowsHide: true });
    return (stdout || stderr || `Sent taskkill to PID ${options.pid}`).trim();
  }

  const signal = options.force ? "-9" : "-TERM";
  await execFileAsync("kill", [signal, String(options.pid)], { timeout: 10_000 });
  return `Sent ${signal} to PID ${options.pid}`;
}

export function expectedKillConfirmation(pid: number): string {
  return `KILL ${pid}`;
}

export async function collectSystemDiagnostics(filterPort?: number): Promise<SystemDiagnostics> {
  const notes: string[] = [];
  let ports: ListeningPort[] = [];
  try {
    ports = await listListeningPorts(filterPort);
  } catch (error) {
    notes.push(`Port inspection failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    summary: systemSummary(),
    proxy: proxySummary(),
    ports,
    notes,
  };
}

export function formatSystemDiagnostics(diagnostics: SystemDiagnostics): string {
  const { summary, proxy, ports, notes } = diagnostics;
  const proxyLines = Object.entries(proxy.variables).map(([key, value]) => `  - ${key}=${value}`);
  const portLines = ports.slice(0, 80).map((item) => {
    const pid = item.pid === undefined ? "" : ` pid=${item.pid}`;
    const processName = item.process ? ` process=${item.process}` : "";
    const state = item.state ? ` state=${item.state}` : "";
    return `  - ${item.protocol} ${item.localAddress}:${item.port}${state}${pid}${processName}`;
  });

  return [
    `System: ${summary.os.type} ${summary.os.release} ${summary.os.arch} (${summary.os.platform})`,
    `Node: ${summary.node}`,
    `CPU: ${summary.cpuCount} logical cores`,
    `Memory: ${summary.memory.freeMb} MB free / ${summary.memory.totalMb} MB total`,
    proxy.hasProxy ? "Proxy environment:" : "Proxy environment: none detected",
    ...proxyLines,
    ports.length > 0 ? `Listening ports (${ports.length}${ports.length > portLines.length ? `, showing ${portLines.length}` : ""}):` : "Listening ports: none found or not available",
    ...portLines,
    ...notes.map((note) => `Note: ${note}`),
  ].join("\n");
}

export function formatProcessList(processes: ProcessInfo[]): string {
  if (!processes.length) return "Processes: none found";
  return [
    `Processes (${processes.length}):`,
    ...processes.map((item) => {
      const memory = item.memoryKb === undefined ? "" : ` memory=${Math.round(item.memoryKb / 1024)}MB`;
      const session = item.sessionName ? ` session=${item.sessionName}` : "";
      const command = item.command && item.command !== item.name ? ` command=${truncate(item.command, 160)}` : "";
      return `  - pid=${item.pid} name=${item.name}${memory}${session}${command}`;
    }),
  ].join("\n");
}

function filterPorts(ports: ListeningPort[], filterPort: number | undefined): ListeningPort[] {
  const filtered = filterPort === undefined ? ports : ports.filter((item) => item.port === filterPort);
  return filtered.sort((a, b) => a.port - b.port || String(a.localAddress).localeCompare(String(b.localAddress)));
}

function filterProcesses(processes: ProcessInfo[], query: string | undefined): ProcessInfo[] {
  if (!query?.trim()) return processes.sort(compareProcess);
  const needle = query.trim().toLowerCase();
  return processes
    .filter((item) => [String(item.pid), item.name, item.command ?? "", item.sessionName ?? ""].some((value) => value.toLowerCase().includes(needle)))
    .sort(compareProcess);
}

function compareProcess(a: ProcessInfo, b: ProcessInfo): number {
  return a.name.localeCompare(b.name) || a.pid - b.pid;
}

function assertKillablePid(pid: number): void {
  if (!Number.isInteger(pid) || pid < 1) throw new Error(`Invalid PID: ${pid}`);
  if (pid === process.pid) throw new Error("Refusing to terminate the DevSpace server process itself.");
  if (pid === process.ppid) throw new Error("Refusing to terminate DevSpace's parent process.");
}

async function runNetstatWindows(): Promise<string> {
  const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"], { timeout: 10_000, windowsHide: true });
  return stdout;
}

async function runUnixListeningCommand(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("ss", ["-ltnp"], { timeout: 10_000 });
    return stdout;
  } catch {
    const { stdout } = await execFileAsync("netstat", ["-ltnp"], { timeout: 10_000 });
    return stdout;
  }
}

async function runTasklistWindows(): Promise<string> {
  const { stdout } = await execFileAsync("tasklist", ["/fo", "csv", "/nh"], { timeout: 10_000, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
  return stdout;
}

async function runUnixProcessCommand(): Promise<string> {
  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,comm=,args="], { timeout: 10_000, maxBuffer: 1024 * 1024 * 8 });
  return stdout;
}

export function parseWindowsNetstat(output: string): ListeningPort[] {
  const ports: ListeningPort[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("TCP")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    const [protocol, localAddress, , state, pidText] = parts;
    if (!localAddress || state !== "LISTENING") continue;
    const endpoint = parseEndpoint(localAddress);
    if (!endpoint) continue;
    const pid = Number(pidText);
    ports.push({
      protocol: protocol.toLowerCase(),
      localAddress: endpoint.address,
      port: endpoint.port,
      state,
      ...(Number.isInteger(pid) ? { pid } : {}),
    });
  }
  return ports;
}

export function parseUnixListeningOutput(output: string): ListeningPort[] {
  const ports: ListeningPort[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^(State|Proto|Active)/.test(trimmed)) continue;
    const parts = trimmed.split(/\s+/);
    const local = parts.find((part) => /:\d+$/.test(part));
    if (!local) continue;
    const endpoint = parseEndpoint(local);
    if (!endpoint) continue;
    const processMatch = trimmed.match(/pid=(\d+),[^)]*|\/(\d+)\//);
    const processNameMatch = trimmed.match(/users:\(\("([^"]+)"/);
    const pid = processMatch?.[1] ?? processMatch?.[2];
    ports.push({
      protocol: trimmed.toLowerCase().startsWith("tcp6") ? "tcp6" : "tcp",
      localAddress: endpoint.address,
      port: endpoint.port,
      state: parts[0],
      ...(pid ? { pid: Number(pid) } : {}),
      ...(processNameMatch?.[1] ? { process: processNameMatch[1] } : {}),
    });
  }
  return ports;
}

export function parseWindowsTasklist(output: string): ProcessInfo[] {
  const processes: ProcessInfo[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line);
    const [name, pidText, sessionName, , memoryText] = fields;
    const pid = Number(pidText);
    if (!name || !Number.isInteger(pid)) continue;
    const memoryKb = parseWindowsMemoryKb(memoryText ?? "");
    processes.push({
      pid,
      name,
      ...(sessionName ? { sessionName } : {}),
      ...(memoryKb !== undefined ? { memoryKb } : {}),
    });
  }
  return processes;
}

export function parseUnixPs(output: string): ProcessInfo[] {
  const processes: ProcessInfo[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\d+)\s+(\S+)\s*(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const name = match[2] ?? "unknown";
    const command = (match[3] ?? "").trim();
    if (!Number.isInteger(pid)) continue;
    processes.push({ pid, name, ...(command ? { command } : {}) });
  }
  return processes;
}

function parseEndpoint(value: string): { address: string; port: number } | null {
  if (value.startsWith("[")) {
    const closing = value.lastIndexOf("]:");
    if (closing < 0) return null;
    const address = value.slice(1, closing) || "*";
    const port = Number(value.slice(closing + 2));
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { address, port };
  }

  const index = value.lastIndexOf(":");
  if (index < 0) return null;
  const address = value.slice(0, index) || "*";
  const port = Number(value.slice(index + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { address, port };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function parseWindowsMemoryKb(value: string): number | undefined {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const parsed = Number(digits);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
