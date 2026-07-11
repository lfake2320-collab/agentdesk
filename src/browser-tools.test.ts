import assert from "node:assert/strict";
import { join } from "node:path";
import {
  browserAttachOnly,
  browserProfileDirectory,
  browserProfileMode,
  canUseBrowserTools,
  defaultBrowserDebugPort,
  defaultEdgeUserDataDir,
  formatBrowserSnapshot,
} from "./browser-tools.js";

assert.equal(canUseBrowserTools("safe"), false);
assert.equal(canUseBrowserTools("dev"), false);
assert.equal(canUseBrowserTools("power"), false);
assert.equal(canUseBrowserTools("owner"), true);

assert.equal(defaultBrowserDebugPort({}), 9222);
assert.equal(defaultBrowserDebugPort({ DEVSPACE_BROWSER_DEBUG_PORT: "9333" }), 9333);
assert.throws(
  () => defaultBrowserDebugPort({ DEVSPACE_BROWSER_DEBUG_PORT: "80" }),
  /Invalid DEVSPACE_BROWSER_DEBUG_PORT/,
);

assert.equal(browserProfileMode({}), "isolated");
assert.equal(browserProfileMode({ DEVSPACE_BROWSER_MODE: "live" }), "live");
assert.equal(browserProfileMode({ AGENTDESK_BROWSER_MODE: "isolated" }), "isolated");
assert.throws(() => browserProfileMode({ DEVSPACE_BROWSER_MODE: "cookies" }), /Invalid DEVSPACE_BROWSER_MODE/);

assert.equal(browserProfileDirectory({}), "Default");
assert.equal(browserProfileDirectory({ DEVSPACE_BROWSER_PROFILE_DIRECTORY: "Profile 2" }), "Profile 2");
assert.equal(browserAttachOnly({}), false);
assert.equal(browserAttachOnly({ DEVSPACE_BROWSER_ATTACH_ONLY: "1" }), true);
assert.equal(browserAttachOnly({ AGENTDESK_BROWSER_ATTACH_ONLY: "true" }), true);

assert.equal(defaultEdgeUserDataDir({ DEVSPACE_BROWSER_USER_DATA_DIR: "D:/EdgeUserData" }), "D:/EdgeUserData");
assert.match(defaultEdgeUserDataDir({ LOCALAPPDATA: join("C:", "Users", "demo", "AppData", "Local") }), /Microsoft.*Edge.*User Data/);

const formatted = formatBrowserSnapshot({
  url: "https://example.com",
  title: "Example",
  text: "Hello browser automation",
  elements: [
    {
      index: 0,
      tag: "button",
      text: "Submit",
      selector: "button:nth-of-type(1)",
    },
  ],
});

assert.match(formatted, /URL: https:\/\/example.com/);
assert.match(formatted, /Title: Example/);
assert.match(formatted, /Interactive elements/);
assert.match(formatted, /button:nth-of-type\(1\)/);
