import assert from 'node:assert/strict';
import { evaluateAiAgentInvocation } from '../dist/ai-agent-policy.js';

const encodedCodex = Buffer.from('codex exec review', 'utf16le').toString('base64');

const blocked = [
  ['codex exec "review this"', 'codex'],
  ['C:\\Users\\user\\AppData\\Roaming\\npm\\codex.cmd exec', 'codex'],
  ['"C:\\Program Files\\Agents\\claude.exe" -p review', 'claude'],
  ['OPENCODE run "review"', 'opencode'],
  ['npx -y @openai/codex@latest exec', 'codex'],
  ['npm exec -- @anthropic-ai/claude-code', 'claude'],
  ['npm x @google/gemini-cli', 'gemini'],
  ['npm exec --package @google/gemini-cli -- gemini', 'gemini'],
  ['pnpm dlx opencode-ai run review', 'opencode'],
  ['yarn dlx @google/gemini-cli', 'gemini'],
  ['bunx @openai/codex', 'codex'],
  ['pipx run aider-chat', 'aider'],
  ['uvx aider-chat', 'aider'],
  ['python -m aider', 'aider'],
  ['python C:\\tools\\aider.py', 'aider'],
  ['node C:\\tools\\codex.js exec', 'codex'],
  ['cmd /c "codex exec review"', 'codex'],
  ['cmd.exe /k claude -p review', 'claude'],
  ['call codex exec review', 'codex'],
  ['start "" claude -p review', 'claude'],
  ['powershell -Command "claude -p review"', 'claude'],
  ['pwsh -c "gemini -p review"', 'gemini'],
  ['powershell -File C:\\tools\\codex.ps1', 'codex'],
  [`powershell -EncodedCommand ${encodedCodex}`, 'codex'],
  ['bash -lc "codex exec review"', 'codex'],
  ['sh -c "claude -p review"', 'claude'],
  ['Invoke-Expression "opencode run review"', 'opencode'],
  ['iex "gemini -p review"', 'gemini'],
  ['wsl codex exec review', 'codex'],
  ['Start-Process -FilePath cursor-agent', 'cursor-agent'],
  ['Start-Process "C:\\tools\\opencode.ps1" -ArgumentList run,review', 'opencode'],
  ['& "C:\\tools\\opencode.ps1" run review', 'opencode'],
  ['. "C:\\tools\\gemini.ps1" -p review', 'gemini'],
  ['echo "$(codex exec review)"', 'codex'],
  ['echo `opencode run review`', 'opencode'],
  ['git status && codex exec review', 'codex'],
  ['Write-Output ok; gemini -p review', 'gemini'],
  ['FOO=1 codex exec review', 'codex'],
];

for (const [command, expectedAgent] of blocked) {
  const decision = evaluateAiAgentInvocation(command);
  assert.equal(decision.allowed, false, `expected blocked: ${command}`);
  if (!decision.allowed) {
    assert.equal(decision.agent, expectedAgent, `wrong agent for: ${command}`);
    assert.ok(decision.matchedToken.length > 0, `missing token for: ${command}`);
    assert.ok(decision.reason.length > 0, `missing reason for: ${command}`);
  }
}

const allowed = [
  '',
  '   ',
  'git status',
  'npm test',
  'npm exec -- eslint .',
  'npm x eslint .',
  'npx tsc --noEmit',
  'node dist/index.js',
  'python -m pytest',
  'echo codex',
  'Write-Output "claude"',
  'Get-Content .\\docs\\codex-notes.md',
  'npm view @openai/codex version',
  'npm install @anthropic-ai/claude-code --save-dev',
  'cmd /c "echo codex"',
  'powershell -Command "Write-Output claude"',
];

for (const command of allowed) {
  const decision = evaluateAiAgentInvocation(command);
  assert.equal(decision.allowed, true, `expected allowed: ${command}`);
}

console.log(`Immutable AI agent policy passed (${blocked.length} blocked, ${allowed.length} allowed)`);
