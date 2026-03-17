/**
 * Permission request Adaptive Card template.
 *
 * Renders a permission prompt showing tool name, input preview,
 * risk level, and Approve/Deny/Always Allow action buttons.
 */

import type {
  AdaptiveCard,
  AdaptiveCardAction,
  AdaptiveCardElement,
  PermissionRequest,
} from '../types.js';
import {
  ADAPTIVE_CARD_SCHEMA,
  ADAPTIVE_CARD_VERSION,
} from '../types.js';

/** Maximum characters for tool input preview. */
const MAX_INPUT_PREVIEW_CHARS = 500;

/** Risk descriptions by tool type. */
const RISK_DESCRIPTIONS: Record<string, string> = {
  Bash: 'This tool can execute arbitrary commands on your machine.',
  Edit: 'This tool can modify files on your filesystem.',
  Write: 'This tool can create or overwrite files on your filesystem.',
  MultiEdit: 'This tool can modify multiple files on your filesystem.',
  NotebookEdit: 'This tool can modify Jupyter notebook files.',
};

/** Default risk descriptions by risk level. */
const RISK_LEVEL_DESCRIPTIONS: Record<string, string> = {
  low: 'This tool has read-only access.',
  medium: 'This tool can make changes to your project.',
  high: 'This tool can execute arbitrary operations on your machine.',
};

/**
 * Render a permission request card.
 *
 * - Warning-colored "Permission Required" heading
 * - Tool name in bold
 * - Tool input preview as CodeBlock (truncated to 500 chars)
 * - Risk description based on tool type or risk level
 * - Three action buttons: Approve (positive), Deny (destructive), Always Allow
 * - Action data includes requestId and toolName for handler routing
 * - Timeout warning text
 */
export function renderPermissionRequest(
  request: PermissionRequest,
): AdaptiveCard {
  const riskLevel = request.riskLevel ?? inferRiskLevel(request.toolName);
  const riskDescription = getRiskDescription(request.toolName, riskLevel);

  // Truncate input preview
  const inputPreview =
    request.input.length > MAX_INPUT_PREVIEW_CHARS
      ? request.input.slice(0, MAX_INPUT_PREVIEW_CHARS) + '...'
      : request.input;

  // Detect language for the input preview
  const inputLanguage = getInputLanguage(request.toolName);

  const body: AdaptiveCardElement[] = [
    {
      type: 'TextBlock',
      text: 'Permission Required',
      style: 'heading',
      color: 'warning',
      size: 'medium',
    },
    {
      type: 'TextBlock',
      text: `Claude Code wants to use the **${request.toolName}** tool:`,
      wrap: true,
    },
    {
      type: 'CodeBlock',
      codeSnippet: inputPreview,
      language: inputLanguage,
    },
    {
      type: 'TextBlock',
      text: riskDescription,
      wrap: true,
      isSubtle: true,
      size: 'small',
    },
    {
      type: 'TextBlock',
      text: 'This request will expire if not acted upon.',
      wrap: true,
      isSubtle: true,
      size: 'small',
    },
  ];

  const actions: AdaptiveCardAction[] = [
    {
      type: 'Action.Submit',
      title: 'Approve',
      style: 'positive',
      data: {
        action: 'approve_tool',
        requestId: request.requestId,
        toolName: request.toolName,
      },
    },
    {
      type: 'Action.Submit',
      title: 'Deny',
      style: 'destructive',
      data: {
        action: 'deny_tool',
        requestId: request.requestId,
        toolName: request.toolName,
      },
    },
    {
      type: 'Action.Submit',
      title: 'Always Allow (this session)',
      data: {
        action: 'always_allow_tool',
        requestId: request.requestId,
        toolName: request.toolName,
      },
    },
  ];

  return {
    $schema: ADAPTIVE_CARD_SCHEMA,
    type: 'AdaptiveCard',
    version: ADAPTIVE_CARD_VERSION,
    body,
    actions,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Infer risk level from tool name. */
function inferRiskLevel(toolName: string): 'low' | 'medium' | 'high' {
  const highRiskTools = ['Bash', 'Execute'];
  const mediumRiskTools = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

  if (highRiskTools.includes(toolName)) return 'high';
  if (mediumRiskTools.includes(toolName)) return 'medium';
  return 'low';
}

/** Get risk description for a tool. */
function getRiskDescription(
  toolName: string,
  riskLevel: 'low' | 'medium' | 'high',
): string {
  return RISK_DESCRIPTIONS[toolName] ?? RISK_LEVEL_DESCRIPTIONS[riskLevel] ?? RISK_LEVEL_DESCRIPTIONS['medium']!;
}

/** Determine the appropriate language for input preview. */
function getInputLanguage(toolName: string): string {
  if (toolName === 'Bash') return 'Bash';
  return 'PlainText';
}
