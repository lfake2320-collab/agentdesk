export type PermissionProfile = "safe" | "dev" | "power" | "owner";

export interface PermissionProfilePolicy {
  profile: PermissionProfile;
  label: string;
  description: string;
  shellGuidance: string;
  extensionGuidance: string;
  recommendedToolMode: "minimal" | "full" | "codex";
}

export const PERMISSION_PROFILE_POLICIES: Record<PermissionProfile, PermissionProfilePolicy> = {
  safe: {
    profile: "safe",
    label: "Safe",
    description: "Read-heavy workspace access for inspection, review, and low-risk edits.",
    shellGuidance: "Prefer read-only commands. Avoid process, network, package-manager, Docker, or destructive commands unless the user explicitly asks.",
    extensionGuidance: "Only use skills and plugin manifests for guidance; do not assume extra local capabilities are available.",
    recommendedToolMode: "minimal",
  },
  dev: {
    profile: "dev",
    label: "Developer",
    description: "Balanced project development access for normal code edits, tests, builds, and git inspection.",
    shellGuidance: "Use shell for tests, builds, package scripts, git inspection, and project diagnostics. Do not use shell to write files when file tools can do it.",
    extensionGuidance: "Use project and personal skills when they match the task. Treat plugin manifests as optional capability declarations.",
    recommendedToolMode: "full",
  },
  power: {
    profile: "power",
    label: "Power user",
    description: "Expanded local development access for deeper diagnostics such as Docker, ports, browsers, databases, and local services.",
    shellGuidance: "System and service diagnostics are allowed when relevant. Ask for explicit user intent before stopping processes, pruning Docker resources, deleting files, or changing global machine state.",
    extensionGuidance: "Prefer purpose-built plugins for Windows, Docker, browser, and database tasks when their tools are actually exposed by the host.",
    recommendedToolMode: "full",
  },
  owner: {
    profile: "owner",
    label: "Owner",
    description: "Highest-trust local owner profile for broad machine control during an explicitly authorized session.",
    shellGuidance: "You may perform broad local diagnostics and maintenance when the user asks, but destructive, credential-touching, network-exposing, or irreversible actions still require explicit confirmation.",
    extensionGuidance: "Use private skills, subagents, and plugins as the user’s personal automation layer. Never treat presence of a manifest as permission to bypass confirmation.",
    recommendedToolMode: "codex",
  },
};

export function parsePermissionProfile(value: string | undefined): PermissionProfile {
  if (!value || value === "dev") return "dev";
  if (value === "safe" || value === "power" || value === "owner") return value;
  throw new Error(`Invalid DEVSPACE_PERMISSION_PROFILE: ${value}`);
}

export function formatPermissionProfileForPrompt(profile: PermissionProfile): string {
  const policy = PERMISSION_PROFILE_POLICIES[profile];
  return `${policy.label} (${policy.profile}): ${policy.description} ${policy.shellGuidance} ${policy.extensionGuidance}`;
}
