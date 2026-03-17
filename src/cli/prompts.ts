/**
 * Interactive prompt helpers using Node.js readline.
 *
 * Provides simple prompt functions for the setup wizard.
 */

import { createInterface, type Interface } from 'node:readline';

let rl: Interface | null = null;

function getReadline(): Interface {
  if (!rl) {
    rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return rl;
}

/**
 * Close the readline interface.
 */
export function closePrompts(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/**
 * Prompt the user for text input.
 *
 * @param question - The prompt text to display.
 * @param defaultValue - Optional default value shown in brackets.
 * @returns The user's input, or the default value if they press Enter.
 */
export function prompt(question: string, defaultValue?: string): Promise<string> {
  return new Promise((resolve) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    getReadline().question(`${question}${suffix}: `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue || '');
    });
  });
}

/**
 * Prompt for a yes/no confirmation.
 *
 * @param question - The question to ask.
 * @param defaultValue - Default answer (default: true = yes).
 * @returns true for yes, false for no.
 */
export function confirm(question: string, defaultValue = true): Promise<boolean> {
  const suffix = defaultValue ? ' [Y/n]' : ' [y/N]';
  return new Promise((resolve) => {
    getReadline().question(`${question}${suffix}: `, (answer) => {
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) {
        resolve(defaultValue);
      } else {
        resolve(trimmed === 'y' || trimmed === 'yes');
      }
    });
  });
}

/**
 * Prompt for a password/secret (input is not masked in terminal,
 * but we note it's sensitive).
 *
 * @param question - The prompt text.
 * @returns The entered value.
 */
export function promptSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    getReadline().question(`${question}: `, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Display a section header.
 */
export function printHeader(title: string): void {
  console.log('');
  console.log(`${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
  console.log('');
}

/**
 * Display a step indicator.
 */
export function printStep(step: number, total: number, description: string): void {
  console.log(`[${step}/${total}] ${description}`);
  console.log('');
}
