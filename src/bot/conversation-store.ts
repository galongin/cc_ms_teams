/**
 * Conversation store for proactive messaging.
 *
 * Persists userId -> conversation reference mappings to a JSON file.
 * Used by the proactive sender to send messages to users outside the
 * normal request/response cycle.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ensureConfigDir } from '../config/loader.js';
import { CONVERSATIONS_FILE } from '../config/paths.js';
import { getLogger } from '../logging/logger.js';

/**
 * Stored conversation reference for a user.
 * Contains everything needed to send proactive messages.
 */
export interface ConversationReference {
  /** Teams conversation ID. */
  conversationId: string;
  /** Teams user AAD object ID. */
  userId: string;
  /** The service URL for the Bot Framework endpoint. */
  serviceUrl: string;
  /** The bot's ID in the conversation. */
  botId: string;
  /** Tenant ID for the conversation. */
  tenantId: string;
  /** Timestamp of last activity. */
  lastActivity: string;
}

/**
 * In-memory + file-backed store mapping userId to ConversationReference.
 */
export class ConversationStore {
  private data: Map<string, ConversationReference>;
  private filePath: string;
  private logger = getLogger().child({ component: 'conversation-store' });

  constructor(filePath?: string) {
    this.filePath = filePath ?? CONVERSATIONS_FILE;
    this.data = new Map();
    this.loadFromDisk();
  }

  /**
   * Get the conversation reference for a user.
   * Returns undefined if the user is not in the store.
   */
  get(userId: string): ConversationReference | undefined {
    return this.data.get(userId);
  }

  /**
   * Store or update a conversation reference for a user.
   * Persists to disk immediately.
   */
  set(userId: string, ref: ConversationReference): void {
    this.data.set(userId, ref);
    this.saveToDisk();
  }

  /**
   * Remove a user's conversation reference.
   * Persists to disk immediately.
   */
  delete(userId: string): boolean {
    const existed = this.data.delete(userId);
    if (existed) {
      this.saveToDisk();
    }
    return existed;
  }

  /**
   * List all stored conversation references.
   */
  list(): ReadonlyMap<string, ConversationReference> {
    return this.data;
  }

  /**
   * Get the number of stored references.
   */
  get size(): number {
    return this.data.size;
  }

  /**
   * Check if a user has a stored conversation reference.
   */
  has(userId: string): boolean {
    return this.data.has(userId);
  }

  // --- Private ---

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.filePath)) {
        return;
      }
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Record<string, ConversationReference>;
      for (const [key, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object' && 'conversationId' in value) {
          this.data.set(key, value);
        }
      }
      this.logger.debug({ count: this.data.size }, 'Loaded conversation store from disk');
    } catch (err) {
      this.logger.warn({ err }, 'Failed to load conversation store, starting empty');
    }
  }

  private saveToDisk(): void {
    try {
      ensureConfigDir();
      const obj: Record<string, ConversationReference> = {};
      for (const [key, value] of this.data) {
        obj[key] = value;
      }
      const content = JSON.stringify(obj, null, 2) + '\n';

      // Write to temp file first, then rename for atomicity
      const tmpPath = join(dirname(this.filePath), `.conversations.${Date.now()}.tmp`);
      writeFileSync(tmpPath, content, { mode: 0o600 });
      renameSync(tmpPath, this.filePath);
    } catch (err) {
      this.logger.error({ err }, 'Failed to save conversation store');
    }
  }
}
