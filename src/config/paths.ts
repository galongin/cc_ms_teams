import { homedir } from 'node:os';
import { join } from 'node:path';

/** Root configuration directory: ~/.cc-ms-teams/ */
export const CONFIG_DIR = join(homedir(), '.cc-ms-teams');

/** Main config file: ~/.cc-ms-teams/config.json */
export const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/** PID file for the running bot process: ~/.cc-ms-teams/bot.pid */
export const PID_FILE = join(CONFIG_DIR, 'bot.pid');

/** Audit log file: ~/.cc-ms-teams/audit.jsonl */
export const AUDIT_LOG_FILE = join(CONFIG_DIR, 'audit.jsonl');

/** Tunnel persistence file: ~/.cc-ms-teams/tunnel.json */
export const TUNNEL_FILE = join(CONFIG_DIR, 'tunnel.json');

/** Conversation store file: ~/.cc-ms-teams/conversations.json */
export const CONVERSATIONS_FILE = join(CONFIG_DIR, 'conversations.json');

/** Sessions store file: ~/.cc-ms-teams/sessions.json */
export const SESSIONS_FILE = join(CONFIG_DIR, 'sessions.json');
