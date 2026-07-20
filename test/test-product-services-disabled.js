import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  capture,
  captureBase,
  captureRemote,
  capture_call_tool,
  capture_ui_event,
  sanitizeError,
} from '../dist/utils/capture.js';
import { featureFlagManager } from '../dist/utils/feature-flags.js';
import { usageTracker } from '../dist/utils/usageTracker.js';
import { giveFeedbackToDesktopCommander } from '../dist/tools/feedback.js';
import { getPrompts, loadPromptsData } from '../dist/tools/prompts.js';
import { getUsageStats } from '../dist/tools/usage.js';

async function testTelemetryApiIsInert() {
  assert.equal(await capture('test-event', { secret: 'not-sent' }), undefined);
  assert.equal(await captureBase('https://example.invalid', 'test-event'), undefined);
  assert.equal(await captureRemote('test-event', { deviceId: 'private' }), undefined);
  assert.equal(await capture_call_tool('test-event'), undefined);
  assert.equal(await capture_ui_event('test-event'), undefined);

  const sanitized = sanitizeError(new Error('Failed at C:\\Users\\example\\secret.txt'));
  assert.equal(sanitized.message.includes('secret.txt'), false);
}

async function testFeatureFlagsAreLocalAndDisabled() {
  await featureFlagManager.initialize();
  assert.equal(featureFlagManager.get('missing', 'fallback'), 'fallback');
  assert.deepEqual(featureFlagManager.getAll(), {});
  assert.equal(featureFlagManager.wasLoadedFromCache(), false);
  assert.equal(await featureFlagManager.refresh(), false);
  await featureFlagManager.waitForFreshFlags();
  featureFlagManager.destroy();
}

async function testUsageAndOnboardingDoNotPersistOrPrompt() {
  const before = await usageTracker.getStats();
  const afterSuccess = await usageTracker.trackSuccess('read_file');
  const afterFailure = await usageTracker.trackFailure('read_file');

  assert.deepEqual(afterSuccess, before);
  assert.deepEqual(afterFailure, before);
  assert.equal(await usageTracker.shouldPromptForFeedback(), false);
  assert.equal(await usageTracker.shouldPromptForErrorFeedback(), false);
  assert.equal(await usageTracker.shouldShowOnboarding(), false);
  assert.equal((await usageTracker.getFeedbackPromptMessage()).message, '');
  assert.equal((await usageTracker.getOnboardingMessage()).message, '');
}

async function testRemovedToolsHaveNoExternalBehavior() {
  const feedback = await giveFeedbackToDesktopCommander();
  assert.equal(feedback.isError, true);
  assert.equal(feedback.content[0].text.includes('not available'), true);

  const usage = await getUsageStats();
  assert.equal(usage.isError, true);
  assert.equal(usage.content[0].text.includes('not collected'), true);

  const prompts = await getPrompts({ action: 'get_prompt', promptId: 'onb2_01' });
  assert.equal(prompts.isError, true);
  assert.equal(prompts.content[0].text.includes('not available'), true);
  assert.deepEqual(await loadPromptsData(), {
    version: 'removed',
    description: 'Onboarding prompt catalog removed',
    prompts: [],
  });
}

async function testSourceContainsNoOutboundProductEndpoints() {
  const captureSource = await fs.readFile(new URL('../src/utils/capture.ts', import.meta.url), 'utf8');
  const featureFlagSource = await fs.readFile(new URL('../src/utils/feature-flags.ts', import.meta.url), 'utf8');
  const packageJson = JSON.parse(
    await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );

  assert.equal(captureSource.includes('telemetry.desktopcommander.app'), false);
  assert.equal(captureSource.includes('google-analytics.com'), false);
  assert.equal(featureFlagSource.includes('desktopcommander.app/flags'), false);
  assert.equal(featureFlagSource.includes('fetch('), false);
  assert.equal(packageJson.scripts.postinstall.includes('track-installation'), false);
  assert.equal(packageJson.scripts.build.includes('onboarding-prompts.json'), false);
}

await testTelemetryApiIsInert();
await testFeatureFlagsAreLocalAndDisabled();
await testUsageAndOnboardingDoNotPersistOrPrompt();
await testRemovedToolsHaveNoExternalBehavior();
await testSourceContainsNoOutboundProductEndpoints();

console.log('Product service removal contract passed');
