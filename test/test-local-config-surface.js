import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ConfigManager,
  getDefaultServerConfig,
  sanitizeStoredConfig,
} from '../dist/config-manager.js';
import { CONFIG_FIELD_KEYS } from '../dist/config-field-definitions.js';

const expectedKeys = [
  'blockedCommands',
  'allowedDirectories',
  'defaultShell',
  'fileReadLineLimit',
  'fileWriteLineLimit',
];

assert.deepEqual(CONFIG_FIELD_KEYS, expectedKeys);

const cleaned = sanitizeStoredConfig({
  blockedCommands: ['format'],
  allowedDirectories: ['/workspace'],
  defaultShell: 'powershell.exe',
  fileReadLineLimit: 2000,
  fileWriteLineLimit: 200,
  telemetryEnabled: true,
  clientId: 'tracking-id',
  usageStats: { total: 10 },
  pendingWelcomeOnboarding: true,
  welcomeOnboardingEligible: true,
  onboardingState: { attempts: 1 },
  abTest_example: 'variant',
});

assert.deepEqual(cleaned, {
  blockedCommands: ['format'],
  allowedDirectories: ['/workspace'],
  defaultShell: 'powershell.exe',
  fileReadLineLimit: 2000,
  fileWriteLineLimit: 200,
});

assert.deepEqual(Object.keys(getDefaultServerConfig()), expectedKeys);

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'local-mcp-config-'));
try {
  const configPath = path.join(tempRoot, 'nested', 'config.json');
  const isolatedManager = new ConfigManager(configPath);
  const reset = await isolatedManager.resetConfig();
  assert.deepEqual(Object.keys(reset), expectedKeys);
  assert.deepEqual(JSON.parse(await fs.readFile(configPath, 'utf8')), reset);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

const configToolSource = await fs.readFile(new URL('../src/tools/config.ts', import.meta.url), 'utf8');
for (const removedTerm of [
  'featureFlagManager',
  'structuredContent',
  'telemetryEnabled',
  'uiHints',
  'as never',
]) {
  assert.equal(configToolSource.includes(removedTerm), false, `unexpected config tool term: ${removedTerm}`);
}

const managerSource = await fs.readFile(new URL('../src/config-manager.ts', import.meta.url), 'utf8');
for (const removedTerm of ['telemetry', 'onboarding', 'clientId', 'abTest']) {
  assert.equal(managerSource.toLowerCase().includes(removedTerm.toLowerCase()), false);
}

console.log('Local configuration surface contract passed');
