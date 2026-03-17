import type { Command } from 'commander';
import { loadConfig, saveConfig, ensureConfigDir } from '../../config/loader.js';
import { generateManifestZip } from '../../bot/manifest-generator.js';
import { prompt, promptSecret, confirm, printHeader, printStep, closePrompts } from '../prompts.js';

/**
 * UUID format regex for validating Azure App IDs.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Register the `setup` subcommand.
 *
 * The setup wizard guides the user through Azure Bot registration, credential
 * collection, and Teams app manifest generation.
 */
export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Interactive setup wizard for Azure Bot registration and configuration')
    .action(async () => {
      try {
        await runSetupWizard();
      } finally {
        closePrompts();
      }
    });
}

async function runSetupWizard(): Promise<void> {
  printHeader('cc-ms-teams Setup Wizard');

  console.log('This wizard will guide you through:');
  console.log('  1. Azure Bot App Registration');
  console.log('  2. Anthropic API key configuration');
  console.log('  3. Teams app manifest generation');
  console.log('');

  // Ensure config directory exists
  ensureConfigDir();

  // Load existing config (or defaults)
  const config = loadConfig();

  const isRerun = config.bot.id !== '00000000-0000-0000-0000-000000000000';
  if (isRerun) {
    console.log('Existing configuration detected. Current values shown in brackets.');
    console.log('Press Enter to keep current values.');
    console.log('');
  }

  // Step 1: Azure Bot Registration
  printStep(1, 3, 'Azure Bot App Registration');

  console.log('You need to register a bot in the Azure portal:');
  console.log('  1. Go to https://portal.azure.com');
  console.log('  2. Create a new "Azure Bot" resource');
  console.log('  3. Choose "Multi Tenant" for the bot type');
  console.log('  4. Note down the "Microsoft App ID" (Client ID)');
  console.log('  5. Create a client secret under "Certificates & secrets"');
  console.log('');

  // Bot App ID
  let botId = '';
  while (!botId) {
    const currentId = config.bot.id !== '00000000-0000-0000-0000-000000000000'
      ? config.bot.id
      : undefined;
    const input = await prompt('Azure Bot App ID (UUID)', currentId);
    if (UUID_REGEX.test(input)) {
      botId = input;
    } else if (input) {
      console.log('  Invalid format. Please enter a valid UUID (e.g., 12345678-1234-1234-1234-123456789abc)');
    }
  }
  config.bot.id = botId;

  // Bot Password
  const currentPassword = config.bot.password ? '(current value saved)' : undefined;
  const password = await promptSecret(`Azure Bot App Password${currentPassword ? ' [' + currentPassword + ']' : ''}`);
  if (password) {
    config.bot.password = password;
  }

  // Tenant ID
  const currentTenant = config.bot.tenantId !== '00000000-0000-0000-0000-000000000000'
    ? config.bot.tenantId
    : undefined;
  const tenantInput = await prompt('Azure AD Tenant ID (UUID, or "common" for multi-tenant)', currentTenant);
  if (tenantInput && tenantInput !== 'common' && UUID_REGEX.test(tenantInput)) {
    config.bot.tenantId = tenantInput;
  } else if (tenantInput === 'common') {
    config.bot.tenantId = '00000000-0000-0000-0000-000000000000';
  }

  // Step 2: Anthropic API Key
  printStep(2, 3, 'Anthropic API Key');

  console.log('You need an Anthropic API key for Claude Code sessions.');
  console.log('Get one at: https://console.anthropic.com/');
  console.log('');
  console.log('You can also set the ANTHROPIC_API_KEY environment variable instead.');
  console.log('');

  const currentApiKey = config.claude.apiKey ? '(current value saved)' : undefined;
  const apiKey = await promptSecret(`Anthropic API Key${currentApiKey ? ' [' + currentApiKey + ']' : ''}`);
  if (apiKey) {
    config.claude.apiKey = apiKey;
  }

  // Step 3: Generate manifest
  printStep(3, 3, 'Teams App Manifest');

  const shouldGenerate = await confirm('Generate Teams app manifest zip for sideloading?');

  // Save config
  saveConfig(config);
  console.log('');
  console.log('Configuration saved.');

  if (shouldGenerate) {
    console.log('Generating Teams app manifest...');
    try {
      const zipPath = await generateManifestZip({ botId: config.bot.id });
      console.log(`  Manifest zip created: ${zipPath}`);
      console.log('');
      console.log('To sideload the app in Teams:');
      console.log('  1. Open Microsoft Teams');
      console.log('  2. Go to Apps > Manage your apps > Upload a custom app');
      console.log('  3. Select the manifest.zip file');
      console.log('  4. Click "Add" to install the bot for personal chat');
    } catch (err) {
      console.log(`  Warning: Failed to generate manifest: ${err instanceof Error ? err.message : String(err)}`);
      console.log('  You can generate it later by running "cc-ms-teams setup" again.');
    }
  }

  console.log('');
  console.log('Setup complete! Run "cc-ms-teams start" to start the bot.');
}
