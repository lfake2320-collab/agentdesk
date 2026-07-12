import assert from "node:assert/strict";
import { loadAccountStatus, isFeatureAllowed } from "./accounts.js";

const disabled = loadAccountStatus({});
assert.equal(disabled.enabled, false);
assert.equal(disabled.plan, "developer");
assert.equal(isFeatureAllowed(disabled, "browser_tools"), true);
assert.equal(isFeatureAllowed(disabled, "public_file_browser"), true);

const free = loadAccountStatus({ DEVSPACE_ACCOUNT_GATING: "1" });
assert.equal(free.enabled, true);
assert.equal(free.plan, "free");
assert.equal(isFeatureAllowed(free, "browser_tools"), false);
assert.equal(isFeatureAllowed(free, "skills"), true, "skills are not premium by default");

const pro = loadAccountStatus({ DEVSPACE_ACCOUNT_GATING: "1", DEVSPACE_ACCOUNT_PLAN: "pro" });
assert.equal(pro.plan, "pro");
assert.equal(isFeatureAllowed(pro, "browser_tools"), true);
assert.equal(isFeatureAllowed(pro, "codex_tool_mode"), true);

const explicit = loadAccountStatus({
  DEVSPACE_ACCOUNT_GATING: "1",
  DEVSPACE_LICENSE_FEATURES: "browser_tools,plugins",
});
assert.equal(isFeatureAllowed(explicit, "browser_tools"), true);
assert.equal(isFeatureAllowed(explicit, "plugins"), true);
assert.equal(isFeatureAllowed(explicit, "process_control"), false);

const narrowedPremium = loadAccountStatus({
  DEVSPACE_ACCOUNT_GATING: "1",
  DEVSPACE_PREMIUM_FEATURES: "public_file_browser",
});
assert.equal(isFeatureAllowed(narrowedPremium, "public_file_browser"), false);
assert.equal(isFeatureAllowed(narrowedPremium, "browser_tools"), true);

const expired = loadAccountStatus({
  DEVSPACE_ACCOUNT_GATING: "1",
  DEVSPACE_ACCOUNT_PLAN: "pro",
  DEVSPACE_LICENSE_EXPIRES_AT: "2000-01-01T00:00:00Z",
});
assert.equal(expired.expired, true);
assert.equal(isFeatureAllowed(expired, "browser_tools"), false);
