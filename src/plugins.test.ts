import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { effectivePluginPaths, loadWorkspacePlugins } from "./plugins.js";

const root = mkdtempSync(join(tmpdir(), "devspace-plugins-root-"));
const configDir = mkdtempSync(join(tmpdir(), "devspace-plugins-config-"));
const customPlugins = mkdtempSync(join(tmpdir(), "devspace-custom-plugins-"));
const env = {
  DEVSPACE_CONFIG_DIR: configDir,
  DEVSPACE_ALLOWED_ROOTS: root,
  DEVSPACE_OAUTH_OWNER_TOKEN: "test-owner-token-that-is-long-enough",
  DEVSPACE_PLUGIN_PATHS: customPlugins,
};

mkdirSync(join(customPlugins, "windows-tools"), { recursive: true });
writeFileSync(join(customPlugins, "windows-tools", "plugin.json"), JSON.stringify({
  name: "windows-tools",
  description: "Windows process, port, service, and PowerShell helpers.",
  version: "0.1.0",
  permissions: ["process:list", "process:kill", "network:ports"],
  skills: ["codex-repair"],
  tools: [{ name: "windows_find_port", description: "Find the process using a local port." }],
}, null, 2));

const config = loadConfig(env);
assert.equal(config.pluginsEnabled, true);
assert.deepEqual(config.pluginPaths, [customPlugins]);
assert.ok(effectivePluginPaths(config, root).includes(customPlugins));

const loaded = loadWorkspacePlugins(config, root);
assert.equal(loaded.diagnostics.length, 0);
assert.equal(loaded.plugins.length, 1);
assert.equal(loaded.plugins[0].name, "windows-tools");
assert.equal(loaded.plugins[0].tools?.[0]?.name, "windows_find_port");
assert.deepEqual(loaded.plugins[0].permissions, ["process:list", "process:kill", "network:ports"]);

assert.equal(loadWorkspacePlugins(loadConfig({ ...env, DEVSPACE_PLUGINS: "0" }), root).plugins.length, 0);

mkdirSync(join(customPlugins, "broken"), { recursive: true });
writeFileSync(join(customPlugins, "broken", "plugin.json"), JSON.stringify({ name: "broken" }));
const withBroken = loadWorkspacePlugins(config, root);
assert.equal(withBroken.plugins.length, 1);
assert.equal(withBroken.diagnostics.length, 1);
assert.match(withBroken.diagnostics[0], /non-empty description/);
