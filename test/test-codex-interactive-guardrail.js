import assert from 'node:assert/strict';
import { terminalManager } from '../dist/terminal-manager.js';
import { interactWithProcess } from '../dist/tools/improved-process-tools.js';

const originals = {
  getSession: terminalManager.getSession.bind(terminalManager),
  capture: terminalManager.captureOutputSnapshot.bind(terminalManager),
  send: terminalManager.sendInputToProcess.bind(terminalManager),
};
let kind = 'shell';
let sends = 0;

async function run() {
  terminalManager.getSession = () => ({ sessionKind: kind });
  terminalManager.captureOutputSnapshot = () => ({ totalChars: 0, lineCount: 0 });
  terminalManager.sendInputToProcess = () => { sends += 1; return true; };

  sends = 0;
  const refused = await interactWithProcess({ pid: 70001, input: 'codex exec review', wait_for_prompt: false });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /Inline Execution/);
  assert.equal(sends, 0);

  sends = 0;
  const shellData = await interactWithProcess({ pid: 70001, input: 'echo codex', wait_for_prompt: false });
  assert.equal(shellData.isError, undefined);
  assert.equal(sends, 1);

  kind = 'other';
  sends = 0;
  const replData = await interactWithProcess({ pid: 70002, input: '"codex"', wait_for_prompt: false });
  assert.equal(replData.isError, undefined);
  assert.equal(sends, 1);

  kind = undefined;
  sends = 0;
  const unknown = await interactWithProcess({ pid: 70003, input: 'codex', wait_for_prompt: false });
  assert.equal(unknown.isError, undefined);
  assert.equal(sends, 1);
  console.log('Codex interact_with_process guardrail tests passed.');
}

run()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    terminalManager.getSession = originals.getSession;
    terminalManager.captureOutputSnapshot = originals.capture;
    terminalManager.sendInputToProcess = originals.send;
  });
