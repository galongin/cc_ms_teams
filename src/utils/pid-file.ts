import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { ensureConfigDir } from '../config/loader.js';
import { PID_FILE } from '../config/paths.js';

/**
 * Write the current process PID to the PID file.
 * Throws if a PID file already exists for a running process.
 */
export function writePidFile(): void {
  ensureConfigDir();

  const existing = readPidFile();
  if (existing !== null && isProcessAlive(existing)) {
    throw new Error(
      `Another cc-ms-teams instance is already running (PID ${existing}). ` +
      `Use "cc-ms-teams stop" to stop it first.`
    );
  }

  // Clean stale PID file if process is dead
  if (existing !== null) {
    removePidFile();
  }

  writeFileSync(PID_FILE, String(process.pid), { mode: 0o600 });
}

/**
 * Read the PID from the PID file. Returns null if the file does not exist.
 */
export function readPidFile(): number | null {
  if (!existsSync(PID_FILE)) {
    return null;
  }
  const content = readFileSync(PID_FILE, 'utf-8').trim();
  const pid = parseInt(content, 10);
  return Number.isNaN(pid) ? null : pid;
}

/**
 * Remove the PID file.
 */
export function removePidFile(): void {
  try {
    unlinkSync(PID_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}

/**
 * Check if a process with the given PID is alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    // Sending signal 0 doesn't kill the process; it just checks existence
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send SIGTERM to the process, wait up to timeoutMs, then SIGKILL.
 * Returns true if the process was stopped, false if it wasn't running.
 */
export async function stopProcess(timeoutMs: number = 10000): Promise<boolean> {
  const pid = readPidFile();
  if (pid === null) {
    return false;
  }

  if (!isProcessAlive(pid)) {
    removePidFile();
    return false;
  }

  // Send SIGTERM
  process.kill(pid, 'SIGTERM');

  // Wait for process to exit
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      removePidFile();
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Force kill
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process may have exited between check and kill
  }

  removePidFile();
  return true;
}
