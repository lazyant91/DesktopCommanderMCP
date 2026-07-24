import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { detectCodexCliLaunch } from '../dist/codex-guardrail.js';

const commands = [
  'git status',
  'npm test',
  'node scripts/build.js',
  'echo codex',
  'rg codex README.md',
  'npm view @openai/codex version',
  'node C:\\projects\\codex\\scripts\\build.js',
];
const iterations = 20_000;
const started = performance.now();
let matches = 0;
for (let index = 0; index < iterations; index += 1) {
  for (const command of commands) {
    if (detectCodexCliLaunch(command).matched) matches += 1;
  }
}
const elapsedMs = performance.now() - started;
const decisions = iterations * commands.length;
const averageMs = elapsedMs / decisions;
assert.equal(matches, 0);
assert.ok(averageMs < 0.25, `Average detector cost ${averageMs.toFixed(6)}ms exceeded 0.25ms`);
console.log(`Codex guardrail performance passed: ${decisions} decisions in ${elapsedMs.toFixed(2)}ms (${averageMs.toFixed(6)}ms average).`);
