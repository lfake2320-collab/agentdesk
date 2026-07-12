import { spawn } from "node:child_process";
import {
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  type BashToolInput,
  type EditToolInput,
  type EditToolDetails,
  type FindToolInput,
  type GrepToolInput,
  type LsToolInput,
  type ReadToolInput,
  type WriteToolInput,
  type AgentToolResult,
} from "@earendil-works/pi-coding-agent";
import { resolveShellCommand, terminateProcessTree } from "./process-platform.js";
import { resolveAllowedPath } from "./roots.js";

type McpContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export type ToolResponse<TDetails = unknown> = {
  content: McpContent[];
  details?: TDetails;
  isError?: boolean;
};

interface ToolContext {
  cwd: string;
  root: string;
  readRoots?: string[];
}

function toMcpContent(result: AgentToolResult<unknown>): McpContent[] {
  return result.content.map((content) => {
    if (content.type === "text") {
      return { type: "text", text: content.text };
    }

    return {
      type: "image",
      data: content.data,
      mimeType: content.mimeType,
    };
  });
}

function formatToolError(error: unknown): McpContent[] {
  const message = error instanceof Error ? error.message : String(error);
  return [{ type: "text", text: message }];
}

async function runTool<TInput, TDetails = unknown>(
  execute: (input: TInput) => Promise<AgentToolResult<TDetails>>,
  input: TInput,
  context: ToolContext,
): Promise<ToolResponse<TDetails>> {
  try {
    const result = await execute(input);
    return {
      content: toMcpContent(result),
      details: result.details,
    };
  } catch (error) {
    return { content: formatToolError(error), isError: true };
  }
}

export async function readFileTool(input: ReadToolInput, context: ToolContext): Promise<ToolResponse> {
  const path = resolveAllowedPath(input.path, context.cwd, context.readRoots ?? [context.root]);
  const tool = createReadTool(context.cwd);

  return runTool((params) => tool.execute("read_file", params), {
    path,
    offset: input.offset,
    limit: input.limit,
  }, context);
}

export async function writeFileTool(input: WriteToolInput, context: ToolContext): Promise<ToolResponse> {
  const path = resolveAllowedPath(input.path, context.cwd, [context.root]);
  const tool = createWriteTool(context.cwd);

  return runTool((params) => tool.execute("write_file", params), {
    path,
    content: input.content,
  }, context);
}

export async function editFileTool(input: EditToolInput, context: ToolContext): Promise<ToolResponse<EditToolDetails>> {
  const path = resolveAllowedPath(input.path, context.cwd, [context.root]);
  const tool = createEditTool(context.cwd);

  return runTool((params) => tool.execute("edit_file", params), {
    path,
    edits: input.edits,
  }, context);
}

export async function grepFilesTool(input: GrepToolInput, context: ToolContext): Promise<ToolResponse> {
  if (input.path) resolveAllowedPath(input.path, context.cwd, [context.root]);
  const tool = createGrepTool(context.cwd);

  return runTool((params) => tool.execute("grep_files", params), input, context);
}

export async function findFilesTool(input: FindToolInput, context: ToolContext): Promise<ToolResponse> {
  if (input.path) resolveAllowedPath(input.path, context.cwd, [context.root]);
  const tool = createFindTool(context.cwd);

  return runTool((params) => tool.execute("find_files", params), input, context);
}

export async function listDirectoryTool(input: LsToolInput, context: ToolContext): Promise<ToolResponse> {
  if (input.path) resolveAllowedPath(input.path, context.cwd, [context.root]);
  const tool = createLsTool(context.cwd);

  return runTool((params) => tool.execute("list_directory", params), input, context);
}

export async function runShellTool(input: BashToolInput, context: ToolContext): Promise<ToolResponse> {
  const timeout = input.timeout === undefined ? 30 : Math.min(input.timeout, 300);
  const shell = resolveShellCommand(input.command);

  return new Promise<ToolResponse>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const maxOutputBytes = 256 * 1024;

    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") <= maxOutputBytes) return next;
      return next.slice(Math.max(0, next.length - maxOutputBytes));
    };

    const child = spawn(shell.executable, shell.args, {
      cwd: context.cwd,
      env: process.env,
      windowsHide: true,
      detached: process.platform !== "win32",
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminateProcessTree(child, "SIGTERM", process.platform !== "win32");
      const text = `${stdout}${stderr ? `\n${stderr}` : ""}\nCommand timed out after ${timeout} seconds.`.trim();
      resolve({ content: [{ type: "text", text }], isError: true });
    }, timeout * 1000);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ content: [{ type: "text", text: error.message }], isError: true });
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = `${stdout}${stderr ? `${stdout ? "\n" : ""}${stderr}` : ""}`.trimEnd();
      const suffix = code === 0 ? "" : `${output ? "\n" : ""}Command exited with code ${code}${signal ? `, signal ${signal}` : ""}.`;
      resolve({
        content: [{ type: "text", text: output + suffix }],
        isError: code !== 0,
      });
    });
  });
}
