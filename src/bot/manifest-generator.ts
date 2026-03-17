/**
 * Teams app manifest generator.
 *
 * Generates a Teams app manifest.json and packages it into a .zip file
 * suitable for sideloading into Microsoft Teams.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { CONFIG_DIR } from '../config/paths.js';
import { getLogger } from '../logging/logger.js';

/** Options for generating the manifest. */
export interface ManifestOptions {
  /** Azure Bot App Registration Client ID (UUID). */
  botId: string;
  /** Display name for the bot in Teams. */
  botName?: string;
  /** Short description of the bot. */
  shortDescription?: string;
  /** Long description of the bot. */
  longDescription?: string;
  /** Developer name. */
  developerName?: string;
  /** Developer website URL. */
  developerUrl?: string;
  /** Privacy URL. */
  privacyUrl?: string;
  /** Terms of use URL. */
  termsOfUseUrl?: string;
  /** Teams app manifest version. */
  version?: string;
}

/** The generated Teams app manifest structure. */
export interface TeamsManifest {
  $schema: string;
  manifestVersion: string;
  version: string;
  id: string;
  developer: {
    name: string;
    websiteUrl: string;
    privacyUrl: string;
    termsOfUseUrl: string;
  };
  name: {
    short: string;
    full: string;
  };
  description: {
    short: string;
    full: string;
  };
  icons: {
    color: string;
    outline: string;
  };
  accentColor: string;
  bots: Array<{
    botId: string;
    scopes: string[];
    supportsFiles: boolean;
    commandLists: Array<{
      scopes: string[];
      commands: Array<{ title: string; description: string }>;
    }>;
  }>;
  permissions: string[];
  validDomains: string[];
}

/**
 * Generate the Teams app manifest JSON.
 */
export function generateManifest(options: ManifestOptions): TeamsManifest {
  const {
    botId,
    botName = 'Claude Code',
    shortDescription = 'Interact with Claude Code from Microsoft Teams',
    longDescription = 'A bidirectional bridge between Claude Code and Microsoft Teams. Send messages, review code changes, and manage Claude Code sessions directly from your Teams chat.',
    developerName = 'cc-ms-teams',
    developerUrl = 'https://github.com/anthropics/claude-code',
    privacyUrl = 'https://www.anthropic.com/privacy',
    termsOfUseUrl = 'https://www.anthropic.com/terms',
    version = '1.0.0',
  } = options;

  return {
    $schema: 'https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json',
    manifestVersion: '1.17',
    version,
    id: botId,
    developer: {
      name: developerName,
      websiteUrl: developerUrl,
      privacyUrl,
      termsOfUseUrl,
    },
    name: {
      short: botName,
      full: `${botName} for Teams`,
    },
    description: {
      short: shortDescription,
      full: longDescription,
    },
    icons: {
      color: 'icon-color.png',
      outline: 'icon-outline.png',
    },
    accentColor: '#6B4FBB',
    bots: [
      {
        botId,
        scopes: ['personal'],
        supportsFiles: false,
        commandLists: [
          {
            scopes: ['personal'],
            commands: [
              { title: 'new', description: 'Start a new Claude Code session' },
              { title: 'stop', description: 'Stop the current session' },
              { title: 'status', description: 'Show current session status' },
              { title: 'help', description: 'Show available commands' },
              { title: 'project', description: 'Set the working directory' },
              { title: 'model', description: 'Set the Claude model' },
              { title: 'permissions', description: 'View or change tool permissions' },
            ],
          },
        ],
      },
    ],
    permissions: ['identity', 'messageTeamMembers'],
    validDomains: [],
  };
}

/**
 * Generate the manifest and package it into a .zip file.
 *
 * The zip contains:
 * - manifest.json
 * - icon-color.png
 * - icon-outline.png
 *
 * @returns The path to the generated zip file.
 */
export async function generateManifestZip(options: ManifestOptions): Promise<string> {
  const logger = getLogger().child({ component: 'manifest-generator' });
  const manifest = generateManifest(options);

  // Ensure output directory exists
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  const zipPath = join(CONFIG_DIR, 'manifest.zip');
  const manifestJson = JSON.stringify(manifest, null, 2);

  // Get icon file paths
  const assetsDir = resolveAssetsDir();
  const colorIconPath = join(assetsDir, 'icon-color.png');
  const outlineIconPath = join(assetsDir, 'icon-outline.png');

  // Dynamic import of archiver (it might not be installed yet)
  let createArchive: (format: 'zip', options?: { zlib?: { level: number } }) => import('archiver').Archiver;
  try {
    const archiverModule = await import('archiver');
    // Handle both ESM default export and CJS-style export
    createArchive = typeof archiverModule.default === 'function'
      ? archiverModule.default as unknown as typeof createArchive
      : (archiverModule as unknown as { default: { default: typeof createArchive } }).default.default;
  } catch {
    // If archiver is not available, write just the manifest JSON
    logger.warn('archiver package not available, writing manifest.json only');
    const manifestPath = join(CONFIG_DIR, 'manifest.json');
    writeFileSync(manifestPath, manifestJson, { mode: 0o600 });
    return manifestPath;
  }

  return new Promise<string>((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = createArchive('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      logger.info({ path: zipPath, size: archive.pointer() }, 'Manifest zip created');
      resolve(zipPath);
    });

    archive.on('error', (err: Error) => {
      logger.error({ err }, 'Failed to create manifest zip');
      reject(err);
    });

    archive.pipe(output);

    // Add manifest.json
    archive.append(manifestJson, { name: 'manifest.json' });

    // Add icons if they exist
    if (existsSync(colorIconPath)) {
      archive.append(readFileSync(colorIconPath), { name: 'icon-color.png' });
    } else {
      logger.warn({ path: colorIconPath }, 'Color icon not found, using placeholder');
      archive.append(createPlaceholderPng(), { name: 'icon-color.png' });
    }

    if (existsSync(outlineIconPath)) {
      archive.append(readFileSync(outlineIconPath), { name: 'icon-outline.png' });
    } else {
      logger.warn({ path: outlineIconPath }, 'Outline icon not found, using placeholder');
      archive.append(createPlaceholderPng(), { name: 'icon-outline.png' });
    }

    archive.finalize().catch(reject);
  });
}

/**
 * Resolve the assets directory path.
 * Works from both src/ (development) and dist/ (production).
 */
function resolveAssetsDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Try common locations
  const candidates = [
    join(__dirname, '..', '..', 'assets'),      // from src/bot/
    join(__dirname, '..', 'assets'),             // from dist/bot/
    join(__dirname, '..', '..', '..', 'assets'), // deeper nesting
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }

  // Default to project root/assets
  return join(__dirname, '..', '..', 'assets');
}

/**
 * Create a minimal valid 1x1 PNG as placeholder for missing icons.
 * This is a valid PNG with a single transparent pixel.
 */
function createPlaceholderPng(): Buffer {
  // Minimal 1x1 transparent PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
}
