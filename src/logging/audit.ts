import { appendFileSync, statSync } from 'node:fs';
import { ensureConfigDir } from '../config/loader.js';
import { AUDIT_LOG_FILE } from '../config/paths.js';
import type { AuditConfig } from '../config/schema.js';

export interface AuditEntry {
  timestamp: string;
  userId: string;
  action: string;
  details: Record<string, unknown>;
}

/**
 * Append-only audit log writer. Each entry is a JSON object written as a
 * single line to ~/.cc-ms-teams/audit.jsonl.
 *
 * The audit log is never truncated on restart -- it grows monotonically.
 * Rotation is based on a max file size; once exceeded, new writes are skipped
 * and a warning is logged.
 */
export class AuditLogger {
  private readonly logPath: string;
  private readonly maxBytes: number;
  private readonly enabled: boolean;

  constructor(config: AuditConfig = { enabled: true, logPath: AUDIT_LOG_FILE, maxFileSizeMb: 100 }) {
    this.enabled = config.enabled;
    this.logPath = config.logPath.replace(/^~/, process.env['HOME'] ?? '');
    this.maxBytes = config.maxFileSizeMb * 1024 * 1024;
  }

  /**
   * Append an audit entry to the log file.
   */
  log(entry: Omit<AuditEntry, 'timestamp'>): void {
    if (!this.enabled) return;

    // Check file size before writing
    if (this.isOverLimit()) return;

    ensureConfigDir();

    const fullEntry: AuditEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    appendFileSync(this.logPath, JSON.stringify(fullEntry) + '\n', { mode: 0o600 });
  }

  private isOverLimit(): boolean {
    try {
      const stat = statSync(this.logPath);
      return stat.size >= this.maxBytes;
    } catch {
      // File doesn't exist yet, that's fine
      return false;
    }
  }
}
