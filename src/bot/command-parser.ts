/**
 * Slash command parser for Teams bot messages.
 *
 * Parses messages starting with `/` into structured command objects.
 * Returns null for non-command messages (regular chat).
 */

/** Known bot slash commands with descriptions. */
export const COMMANDS: ReadonlyMap<string, string> = new Map([
  ['new', 'Start a new Claude Code session'],
  ['stop', 'Stop the current session'],
  ['status', 'Show current session status'],
  ['help', 'Show available commands'],
  ['permissions', 'View or change tool permission tier'],
  ['project', 'Set or show the working directory'],
  ['model', 'Set or show the Claude model'],
  ['sessions', 'List recent sessions'],
  ['handoff', 'Resume a previous session by ID'],
]);

/** Result of parsing a slash command. */
export interface ParsedCommand {
  /** The command name (lowercase, without the leading slash). */
  command: string;
  /** The raw argument string after the command name. */
  args: string;
  /** Individual arguments split by whitespace. */
  argv: string[];
}

/** Result when parsing finds an unknown command. */
export interface UnknownCommand {
  /** Always 'unknown' for unknown commands. */
  command: 'unknown';
  /** The original unknown command name. */
  original: string;
  /** Helpful message listing valid commands. */
  helpText: string;
}

/** Union type for all parse results. */
export type ParseResult = ParsedCommand | UnknownCommand | null;

/**
 * Parse a message string for slash commands.
 *
 * @param text - The raw message text from Teams.
 * @returns A ParsedCommand for known commands, UnknownCommand for unrecognised
 *          slash commands, or null for regular chat messages.
 */
export function parseCommand(text: string): ParseResult {
  const trimmed = text.trim();

  // Not a command if it doesn't start with /
  if (!trimmed.startsWith('/')) {
    return null;
  }

  // Split into command and args
  const spaceIndex = trimmed.indexOf(' ');
  const rawCommand = spaceIndex === -1
    ? trimmed.slice(1)
    : trimmed.slice(1, spaceIndex);
  const argsStr = spaceIndex === -1
    ? ''
    : trimmed.slice(spaceIndex + 1).trim();

  const commandName = rawCommand.toLowerCase();

  // Check if it's a known command
  if (COMMANDS.has(commandName)) {
    return {
      command: commandName,
      args: argsStr,
      argv: argsStr ? argsStr.split(/\s+/) : [],
    };
  }

  // Unknown command
  return {
    command: 'unknown',
    original: rawCommand,
    helpText: formatHelpText(),
  };
}

/**
 * Generate formatted help text listing all available commands.
 */
export function formatHelpText(): string {
  const lines: string[] = [
    '**Available Commands**',
    '',
  ];

  for (const [cmd, desc] of COMMANDS) {
    lines.push(`  \`/${cmd}\` - ${desc}`);
  }

  lines.push('');
  lines.push('Send any other message to chat with Claude Code.');

  return lines.join('\n');
}

/**
 * Type guard: is the parse result a known command?
 */
export function isParsedCommand(result: ParseResult): result is ParsedCommand {
  return result !== null && result.command !== 'unknown';
}

/**
 * Type guard: is the parse result an unknown command?
 */
export function isUnknownCommand(result: ParseResult): result is UnknownCommand {
  return result !== null && result.command === 'unknown';
}
