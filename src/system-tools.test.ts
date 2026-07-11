import assert from "node:assert/strict";
import {
  canUseProcessControl,
  canUseSystemTools,
  expectedKillConfirmation,
  formatProcessList,
  parseUnixListeningOutput,
  parseUnixPs,
  parseWindowsNetstat,
  parseWindowsTasklist,
  proxySummary,
  redactProxyValue,
} from "./system-tools.js";

assert.equal(canUseSystemTools("safe"), false);
assert.equal(canUseSystemTools("dev"), false);
assert.equal(canUseSystemTools("power"), true);
assert.equal(canUseSystemTools("owner"), true);
assert.equal(canUseProcessControl("safe", true), false);
assert.equal(canUseProcessControl("power", true), false);
assert.equal(canUseProcessControl("owner", false), false);
assert.equal(canUseProcessControl("owner", true), true);
assert.equal(expectedKillConfirmation(1234), "KILL 1234");

assert.equal(
  redactProxyValue("http://user:secret@127.0.0.1:7890"),
  "http://***:***@127.0.0.1:7890/",
);
assert.equal(redactProxyValue("http://127.0.0.1:7890"), "http://127.0.0.1:7890/");

assert.deepEqual(proxySummary({ HTTP_PROXY: "http://127.0.0.1:7890" }).variables, {
  HTTP_PROXY: "http://127.0.0.1:7890/",
});

const windowsPorts = parseWindowsNetstat(`
  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       37648
  TCP    127.0.0.1:7196         127.0.0.1:8080         ESTABLISHED     26912
  TCP    [::]:3000              [::]:0                 LISTENING       9988
`);
assert.deepEqual(windowsPorts, [
  { protocol: "tcp", localAddress: "0.0.0.0", port: 8080, state: "LISTENING", pid: 37648 },
  { protocol: "tcp", localAddress: "::", port: 3000, state: "LISTENING", pid: 9988 },
]);

const unixPorts = parseUnixListeningOutput(`
State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN 0      511          0.0.0.0:3000      0.0.0.0:*     users:(("node",pid=1234,fd=22))
LISTEN 0      4096            [::]:8080         [::]:*     users:(("docker-proxy",pid=5678,fd=4))
`);
assert.deepEqual(unixPorts, [
  { protocol: "tcp", localAddress: "0.0.0.0", port: 3000, state: "LISTEN", pid: 1234, process: "node" },
  { protocol: "tcp", localAddress: "::", port: 8080, state: "LISTEN", pid: 5678, process: "docker-proxy" },
]);

const windowsProcesses = parseWindowsTasklist(`
"node.exe","1234","Console","1","88,120 K"
"chrome.exe","4321","Console","1","212,008 K"
`);
assert.deepEqual(windowsProcesses, [
  { pid: 1234, name: "node.exe", sessionName: "Console", memoryKb: 88120 },
  { pid: 4321, name: "chrome.exe", sessionName: "Console", memoryKb: 212008 },
]);

const unixProcesses = parseUnixPs(`
  1234 node node server.js
  4321 bash /bin/bash -lc npm run dev
`);
assert.deepEqual(unixProcesses, [
  { pid: 1234, name: "node", command: "node server.js" },
  { pid: 4321, name: "bash", command: "/bin/bash -lc npm run dev" },
]);

assert.match(formatProcessList(windowsProcesses), /pid=1234 name=node\.exe/);
