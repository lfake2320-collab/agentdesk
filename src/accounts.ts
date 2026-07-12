import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expandHomePath } from "./roots.js";

export type AccountPlan = "developer" | "free" | "pro" | "team" | "enterprise" | "lifetime";

export type AccountFeature =
  | "public_file_browser"
  | "browser_tools"
  | "system_tools"
  | "process_control"
  | "plugins"
  | "skills"
  | "subagents"
  | "full_tool_mode"
  | "codex_tool_mode";

export interface AccountConfigInput {
  gating?: boolean;
  accountId?: string;
  email?: string;
  plan?: string;
  licenseKey?: string;
  licenseFile?: string;
  features?: string[];
  premiumFeatures?: string[];
  expiresAt?: string;
}

export interface AccountStatus {
  enabled: boolean;
  accountId?: string;
  email?: string;
  plan: AccountPlan;
  licenseSource: "disabled" | "env" | "file" | "config";
  licenseKeyFingerprint?: string;
  expiresAt?: string;
  expired: boolean;
  premiumFeatures: AccountFeature[];
  features: Record<AccountFeature, boolean>;
  notes: string[];
}

export const ACCOUNT_FEATURE_LABELS: Record<AccountFeature, string> = {
  public_file_browser: "公网文件浏览器",
  browser_tools: "浏览器工具",
  system_tools: "系统工具",
  process_control: "进程控制",
  plugins: "插件",
  skills: "Skills",
  subagents: "Subagents",
  full_tool_mode: "full 工具模式",
  codex_tool_mode: "codex 工具模式",
};

const ACCOUNT_FEATURES = Object.keys(ACCOUNT_FEATURE_LABELS) as AccountFeature[];

const DEFAULT_PREMIUM_FEATURES: AccountFeature[] = [
  "public_file_browser",
  "browser_tools",
  "system_tools",
  "process_control",
  "plugins",
  "subagents",
  "codex_tool_mode",
];

const PLAN_FEATURES: Record<AccountPlan, AccountFeature[]> = {
  developer: ACCOUNT_FEATURES,
  free: [],
  pro: DEFAULT_PREMIUM_FEATURES,
  team: ACCOUNT_FEATURES,
  enterprise: ACCOUNT_FEATURES,
  lifetime: ACCOUNT_FEATURES,
};

export function loadAccountStatus(
  env: NodeJS.ProcessEnv = process.env,
  fileConfig: AccountConfigInput = {},
): AccountStatus {
  const licenseFile = env.DEVSPACE_LICENSE_FILE ?? fileConfig.licenseFile;
  const license = licenseFile ? readLicenseFile(licenseFile) : {};
  const source: AccountStatus["licenseSource"] = licenseFile && Object.keys(license).length ? "file" : hasAccountEnv(env) ? "env" : Object.keys(fileConfig).length ? "config" : "disabled";
  const enabled = readBoolean(env.DEVSPACE_ACCOUNT_GATING, fileConfig.gating ?? false);
  const rawPlan = env.DEVSPACE_ACCOUNT_PLAN ?? env.DEVSPACE_LICENSE_PLAN ?? license.plan ?? fileConfig.plan;
  const plan = enabled ? normalizePlan(rawPlan) : "developer";
  const expiresAt = env.DEVSPACE_LICENSE_EXPIRES_AT ?? license.expiresAt ?? fileConfig.expiresAt;
  const expired = isExpired(expiresAt);
  const premiumFeatures = parseFeatureList(
    env.DEVSPACE_PREMIUM_FEATURES,
    fileConfig.premiumFeatures ?? DEFAULT_PREMIUM_FEATURES,
  );
  const explicitFeatures = parseFeatureList(
    env.DEVSPACE_LICENSE_FEATURES,
    mergeStringLists(license.features, fileConfig.features),
  );
  const activeFeatureSet = new Set<AccountFeature>();
  if (!expired) {
    for (const feature of PLAN_FEATURES[plan]) activeFeatureSet.add(feature);
    for (const feature of explicitFeatures) activeFeatureSet.add(feature);
  }

  const features = Object.fromEntries(
    ACCOUNT_FEATURES.map((feature) => [feature, !enabled || !premiumFeatures.includes(feature) || activeFeatureSet.has(feature)]),
  ) as Record<AccountFeature, boolean>;

  const notes: string[] = [];
  if (!enabled) notes.push("账号收费开关未开启，所有功能按开发者模式放行。");
  if (enabled && source === "disabled") notes.push("账号收费开关已开启，但没有检测到 license；高级功能按免费版处理。");
  if (expired) notes.push("license 已过期，高级功能按免费版处理。");

  return {
    enabled,
    accountId: env.DEVSPACE_ACCOUNT_ID ?? license.accountId ?? fileConfig.accountId,
    email: env.DEVSPACE_ACCOUNT_EMAIL ?? license.email ?? fileConfig.email,
    plan,
    licenseSource: enabled ? source : "disabled",
    licenseKeyFingerprint: fingerprint(env.DEVSPACE_LICENSE_KEY ?? license.licenseKey ?? fileConfig.licenseKey),
    expiresAt,
    expired,
    premiumFeatures,
    features,
    notes,
  };
}

export function isFeatureAllowed(account: AccountStatus, feature: AccountFeature): boolean {
  return account.features[feature] !== false;
}

export function blockedFeatureMessage(account: AccountStatus, feature: AccountFeature): string {
  const label = ACCOUNT_FEATURE_LABELS[feature] ?? feature;
  return `当前账号方案为 ${account.plan}，未解锁“${label}”。`;
}

function readLicenseFile(filePath: string): AccountConfigInput {
  const resolved = resolve(expandHomePath(filePath));
  if (!existsSync(resolved)) return {};
  try {
    return JSON.parse(readFileSync(resolved, "utf8")) as AccountConfigInput;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { plan: "free", features: [], accountId: `invalid-license:${reason}` };
  }
}

function hasAccountEnv(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.DEVSPACE_ACCOUNT_ID ||
      env.DEVSPACE_ACCOUNT_EMAIL ||
      env.DEVSPACE_ACCOUNT_PLAN ||
      env.DEVSPACE_LICENSE_PLAN ||
      env.DEVSPACE_LICENSE_KEY ||
      env.DEVSPACE_LICENSE_FEATURES ||
      env.DEVSPACE_LICENSE_EXPIRES_AT,
  );
}

function normalizePlan(value: unknown): AccountPlan {
  if (value === "pro" || value === "team" || value === "enterprise" || value === "lifetime") return value;
  if (value === "developer") return "developer";
  return "free";
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(text)) return true;
    if (["0", "false", "no", "off"].includes(text)) return false;
  }
  return fallback;
}

function parseFeatureList(value: unknown, fallback: string[] = []): AccountFeature[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : fallback;
  const features = raw
    .map((entry) => String(entry).trim())
    .filter(Boolean)
    .filter((entry): entry is AccountFeature => ACCOUNT_FEATURES.includes(entry as AccountFeature));
  return Array.from(new Set(features));
}

function mergeStringLists(primary: unknown, fallback: unknown): string[] {
  const a = Array.isArray(primary) ? primary.map(String) : [];
  const b = Array.isArray(fallback) ? fallback.map(String) : [];
  return a.length ? a : b;
}

function isExpired(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  return timestamp <= Date.now();
}

function fingerprint(secret: unknown): string | undefined {
  if (typeof secret !== "string" || !secret) return undefined;
  if (secret.length <= 12) return "configured";
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}
