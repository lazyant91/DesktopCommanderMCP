import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

for (const removedPath of [
  '../src/tools/feedback.ts',
  '../src/tools/prompts.ts',
  '../src/tools/usage.ts',
  '../src/utils/dockerPrompt.ts',
  '../src/utils/feature-flags.ts',
  '../src/utils/mcp-ui-ab-test.ts',
  '../src/utils/usageTracker.ts',
  '../src/utils/welcome-onboarding.ts',
  '../src/utils/trackTools.ts',
  '../src/utils/toolHistory.ts',
  '../src/handlers/history-handlers.ts',
]) {
  await assert.rejects(
    fs.access(new URL(removedPath, import.meta.url)),
    undefined,
    `product compatibility source still exists: ${removedPath}`,
  );
}

const schemasSource = await fs.readFile(new URL('../src/tools/schemas.ts', import.meta.url), 'utf8');
for (const removedSchema of [
  'GetUsageStatsArgsSchema',
  'GiveFeedbackArgsSchema',
  'GetPromptsArgsSchema',
  'GetRecentToolCallsArgsSchema',
  'TrackUiEventArgsSchema',
]) {
  assert.equal(
    schemasSource.includes(removedSchema),
    false,
    `product compatibility schema still exists: ${removedSchema}`,
  );
}

const captureSource = await fs.readFile(new URL('../src/utils/capture.ts', import.meta.url), 'utf8');
for (const outboundTerm of [
  'telemetry.desktopcommander.app',
  'google-analytics.com',
  'desktopcommander.app/flags',
  'https.request',
  'fetch(',
]) {
  assert.equal(captureSource.includes(outboundTerm), false, `outbound term remains: ${outboundTerm}`);
}

console.log('Product compatibility removal contract passed');
