import assert from "node:assert/strict";
import {
  canUseBrowserTools,
  defaultBrowserDebugPort,
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
