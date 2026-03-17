/**
 * Adaptive Card types for rich Teams output.
 *
 * Defines the IAdaptiveCardRenderer interface, AdaptiveCard structure,
 * and supporting types for all card templates.
 */

// ── Adaptive Card base types ────────────────────────────────────────

/** A single element in an Adaptive Card body. */
export type AdaptiveCardElement = Record<string, unknown>;

/** An action on an Adaptive Card. */
export type AdaptiveCardAction = Record<string, unknown>;

/** Full Adaptive Card JSON structure (schema v1.5+). */
export interface AdaptiveCard {
  $schema: string;
  type: 'AdaptiveCard';
  version: string;
  body: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
}

// ── Card body element helpers ───────────────────────────────────────

/** CodeBlock element for syntax-highlighted code in Adaptive Cards. */
export interface CodeBlockElement {
  type: 'CodeBlock';
  codeSnippet: string;
  language: string;
  startLineNumber?: number;
}

/** TextBlock element. */
export interface TextBlockElement {
  type: 'TextBlock';
  text: string;
  style?: string;
  size?: string;
  color?: string;
  weight?: string;
  wrap?: boolean;
  isSubtle?: boolean;
  horizontalAlignment?: string;
}

/** FactSet element. */
export interface FactSetElement {
  type: 'FactSet';
  facts: Array<{ title: string; value: string }>;
}

/** ColumnSet element. */
export interface ColumnSetElement {
  type: 'ColumnSet';
  columns: ColumnElement[];
}

/** Column element. */
export interface ColumnElement {
  type: 'Column';
  width: string;
  style?: string;
  items: AdaptiveCardElement[];
}

/** Container element. */
export interface ContainerElement {
  type: 'Container';
  style?: string;
  items: AdaptiveCardElement[];
}

// ── Options & input types ───────────────────────────────────────────

/** Options for renderCodeBlock. */
export interface CodeBlockOptions {
  filePath?: string;
  startLine?: number;
  endLine?: number;
  showOpenInVSCode?: boolean;
}

/** Error info for renderError. */
export interface ErrorInfo {
  type: string;
  message: string;
  stack?: string;
  recoverable: boolean;
}

/** Permission request for renderPermissionRequest. */
export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

/** Session summary for renderSessionSummary. */
export interface SessionSummary {
  sessionId: string;
  duration: number;
  cost: number;
  turns: number;
  result: string;
}

// ── Renderer interface ──────────────────────────────────────────────

/** The Adaptive Card Renderer contract. */
export interface IAdaptiveCardRenderer {
  renderCodeBlock(
    code: string,
    language: string,
    options?: CodeBlockOptions,
  ): AdaptiveCard;
  renderDiff(
    filePath: string,
    before: string,
    after: string,
    language: string,
  ): AdaptiveCard;
  renderUnifiedDiff(filePath: string, unifiedDiff: string): AdaptiveCard;
  renderProgress(
    status: string,
    percent?: number,
    elapsed?: string,
  ): AdaptiveCard;
  renderError(error: ErrorInfo): AdaptiveCard;
  renderPermissionRequest(request: PermissionRequest): AdaptiveCard;
  renderSessionSummary(summary: SessionSummary): AdaptiveCard;
  renderToolUseSummary(toolName: string, input: unknown): AdaptiveCard;
  detectLanguage(filePath: string): string;
}

// ── Template registry ───────────────────────────────────────────────

/** Registry mapping content types to template render functions. */
export type TemplateRegistry = Record<
  string,
  (...args: unknown[]) => AdaptiveCard
>;

// ── Constants ───────────────────────────────────────────────────────

/** Adaptive Card schema URL. */
export const ADAPTIVE_CARD_SCHEMA =
  'https://adaptivecards.io/schemas/adaptive-card.json';

/** Adaptive Card version. */
export const ADAPTIVE_CARD_VERSION = '1.5';

/** Maximum card size in bytes (28 KB). */
export const MAX_CARD_SIZE_BYTES = 28 * 1024;
