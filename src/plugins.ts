import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ServerConfig } from "./config.js";
import { expandHomePath } from "./roots.js";

export interface DevspacePluginToolManifest {
  name: string;
  description?: string;
}

export interface DevspacePluginManifest {
  name: string;
  description: string;
  version?: string;
  permissions?: string[];
  skills?: string[];
  tools?: DevspacePluginToolManifest[];
  path: string;
}

export interface LoadedPlugins {
  plugins: DevspacePluginManifest[];
  diagnostics: string[];
}

function defaultPluginPaths(config: ServerConfig, cwd: string): string[] {
  return [
    join(homedir(), ".agents", "plugins"),
    resolve(cwd, ".agents", "plugins"),
    config.devspacePluginsDir,
    resolve(cwd, ".devspace", "plugins"),
  ];
}

export function effectivePluginPaths(config: ServerConfig, cwd: string): string[] {
  const seen = new Set<string>();
  return [...defaultPluginPaths(config, cwd), ...config.pluginPaths]
    .map((entry) => resolve(cwd, expandHomePath(entry)))
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

export function loadWorkspacePlugins(config: ServerConfig, cwd: string): LoadedPlugins {
  if (!config.pluginsEnabled) return { plugins: [], diagnostics: [] };

  const plugins: DevspacePluginManifest[] = [];
  const diagnostics: string[] = [];
  const seenManifestPaths = new Set<string>();

  for (const pluginPath of effectivePluginPaths(config, cwd)) {
    for (const manifestPath of discoverManifestPaths(pluginPath)) {
      const resolvedManifestPath = resolve(manifestPath);
      if (seenManifestPaths.has(resolvedManifestPath)) continue;
      seenManifestPaths.add(resolvedManifestPath);

      try {
        plugins.push(readManifest(resolvedManifestPath));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        diagnostics.push(`${resolvedManifestPath}: ${reason}`);
      }
    }
  }

  plugins.sort((a, b) => a.name.localeCompare(b.name));
  return { plugins, diagnostics };
}

function discoverManifestPaths(pluginPath: string): string[] {
  if (!existsSync(pluginPath)) return [];

  const stats = statSync(pluginPath);
  if (stats.isFile()) {
    return pluginPath.endsWith("plugin.json") ? [pluginPath] : [];
  }
  if (!stats.isDirectory()) return [];

  const directManifest = join(pluginPath, "plugin.json");
  const manifests = existsSync(directManifest) ? [directManifest] : [];

  for (const entry of readdirSync(pluginPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nestedManifest = join(pluginPath, entry.name, "plugin.json");
    if (existsSync(nestedManifest)) manifests.push(nestedManifest);
  }

  return manifests;
}

function readManifest(manifestPath: string): DevspacePluginManifest {
  const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const description = typeof raw.description === "string" ? raw.description.trim() : "";

  if (!name) throw new Error("plugin.json must include a non-empty name");
  if (!description) throw new Error("plugin.json must include a non-empty description");

  return {
    name,
    description,
    version: typeof raw.version === "string" ? raw.version : undefined,
    permissions: parseStringArray(raw.permissions),
    skills: parseStringArray(raw.skills),
    tools: parseTools(raw.tools),
    path: manifestPath,
  };
}

function parseStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return entries.length > 0 ? entries : undefined;
}

function parseTools(value: unknown): DevspacePluginToolManifest[] | undefined {
  if (value === undefined || !Array.isArray(value)) return undefined;

  const tools = value
    .map((entry): DevspacePluginToolManifest | undefined => {
      if (!entry || typeof entry !== "object") return undefined;
      const record = entry as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      if (!name) return undefined;
      const tool: DevspacePluginToolManifest = { name };
      if (typeof record.description === "string") tool.description = record.description;
      return tool;
    })
    .filter((entry): entry is DevspacePluginToolManifest => entry !== undefined);

  return tools.length > 0 ? tools : undefined;
}
