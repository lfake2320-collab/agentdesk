import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { loadConfig } from "./config.js";
import { formatAgentsNotice, WorkspaceRegistry } from "./workspaces.js";

const root = await mkdtemp(join(tmpdir(), "pi-on-mcp-workspace-test-"));

try {
  await writeFile(join(root, "AGENTS.md"), "root instructions\n");
  await mkdir(join(root, "nested"));
  await writeFile(join(root, "nested", "AGENTS.md"), "nested instructions\n");
  await writeFile(join(root, "nested", "file.txt"), "hello\n");

  const registry = new WorkspaceRegistry(
    loadConfig({
      PI_ON_MCP_ALLOWED_ROOTS: root,
      PORT: "1",
    }),
  );
  const { workspace, agentsFiles } = await registry.openWorkspace(root);

  assert.match(formatAgentsNotice(agentsFiles) ?? "", /root instructions/);

  const missingWorkspaceRoot = join(root, "missing", "workspace");
  const missingWorkspace = await registry.openWorkspace(missingWorkspaceRoot);
  assert.equal(missingWorkspace.workspace.root, missingWorkspaceRoot);
  assert.equal((await stat(missingWorkspaceRoot)).isDirectory(), true);

  const rootAgain = await registry.loadAgentsForDirectory(workspace, root);
  assert.equal(formatAgentsNotice(rootAgain), undefined);

  const nestedPath = registry.resolvePath(workspace, "nested/file.txt");
  const nestedFirst = await registry.loadAgentsForPath(workspace, nestedPath);
  const nestedFirstNotice = formatAgentsNotice(nestedFirst) ?? "";
  assert.doesNotMatch(nestedFirstNotice, /root instructions/);
  assert.match(nestedFirstNotice, /nested instructions/);

  const nestedAgain = await registry.loadAgentsForPath(workspace, nestedPath);
  assert.equal(formatAgentsNotice(nestedAgain), undefined);
} finally {
  await rm(root, { recursive: true, force: true });
}
