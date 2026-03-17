/**
 * Tool permission tiers and helpers.
 *
 * Defines which tools are available at each permission tier
 * and provides a helper to check whether a tool is allowed.
 */

// ── Tool tiers ────────────────────────────────────────────────────────

export type ToolTier = 'plan' | 'readonly' | 'standard' | 'full';

/** Tools available at each tier (cumulative from lower tiers). */
const TIER_TOOLS: Record<ToolTier, readonly string[]> = {
  plan: [],
  readonly: ['Read', 'Grep', 'Glob', 'Bash:ls'],
  standard: ['Read', 'Grep', 'Glob', 'Bash:ls', 'Write', 'Edit'],
  full: ['Read', 'Grep', 'Glob', 'Bash:ls', 'Write', 'Edit', 'Bash'],
};

/**
 * Get the list of allowed tools for a given tier.
 */
export function getToolsForTier(tier: ToolTier): string[] {
  return [...TIER_TOOLS[tier]];
}

/**
 * Check whether a specific tool is allowed under a given tier.
 *
 * Special handling: "Bash:ls" matches tool name "Bash" only when the
 * command argument starts with "ls". For the general permission check,
 * "Bash:ls" means the Bash tool is not broadly allowed -- only the
 * specific "ls" sub-command is. The full check including arguments
 * happens in the permission handler.
 */
export function isToolAllowed(
  toolName: string,
  tier: ToolTier,
  overrides?: Set<string>,
): boolean {
  // Check user overrides first (from "always allow")
  if (overrides?.has(toolName)) {
    return true;
  }

  const tools = TIER_TOOLS[tier];

  // Direct match
  if (tools.includes(toolName)) {
    return true;
  }

  // Check Bash:ls special case: if tier includes "Bash:ls" but not "Bash",
  // then "Bash" is NOT broadly allowed (caller must check args for "ls").
  // So we return false here; the permission handler does the fine-grained check.

  return false;
}

/**
 * Map a permission mode string to the corresponding tool tier.
 */
export function permissionModeToTier(mode: string): ToolTier {
  switch (mode) {
    case 'plan':
      return 'plan';
    case 'default':
      return 'readonly';
    case 'acceptEdits':
      return 'standard';
    case 'bypassPermissions':
    case 'dontAsk':
      return 'full';
    default:
      return 'readonly';
  }
}

/**
 * Map a tool tier to the corresponding permission mode.
 */
export function tierToPermissionMode(tier: ToolTier): string {
  switch (tier) {
    case 'plan':
      return 'plan';
    case 'readonly':
      return 'default';
    case 'standard':
      return 'acceptEdits';
    case 'full':
      return 'bypassPermissions';
  }
}

/**
 * Paths that are always blocked from tool access, regardless of tier.
 */
export const BLOCKED_PATHS: readonly string[] = [
  '~/.ssh',
  '~/.aws',
  '~/.azure',
  '~/.claude',
  '~/.cc-ms-teams/config.json',
  '**/.env',
  '**/.env.*',
  '**/credentials.json',
  '**/secrets.json',
];

/**
 * Check if a file path matches any blocked path pattern.
 */
export function isBlockedPath(filePath: string): boolean {
  const home = process.env['HOME'] ?? '';
  const normalised = filePath.replace(/^~/, home);

  for (const pattern of BLOCKED_PATHS) {
    const expanded = pattern.replace(/^~/, home);

    // Glob-style matching for ** prefix
    if (expanded.startsWith('**/')) {
      const suffix = expanded.slice(3);
      if (normalised.endsWith(suffix) || normalised.includes(`/${suffix}`)) {
        return true;
      }
    } else if (normalised.startsWith(expanded) || normalised === expanded) {
      return true;
    }
  }

  return false;
}
