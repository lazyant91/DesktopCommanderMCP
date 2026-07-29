import { terminalManager } from './terminal-manager.js';
import type { CommandExecutionResult } from './types.js';
import {
  classifyDirectoryDeleteShell,
  formatDirectoryDeleteGuardError,
  validateDirectoryDeleteCommand,
} from './directory-delete-guard.js';

export interface DirectoryDeleteGuardTerminalManager {
  executeCommand(
    command: string,
    timeoutMs?: number,
    shell?: string,
    collectTiming?: boolean,
  ): Promise<CommandExecutionResult>;
  sendInputToProcess(pid: number, input: string): boolean;
  getSession(pid: number): unknown;
}

interface SessionContext {
  shell: string;
  cwd: string;
}

function firstCommandExecutable(command: string, outerShell: string): string | undefined {
  let input = command.trim();
  const shell = classifyDirectoryDeleteShell(outerShell);
  if (shell === 'cmd' && input.startsWith('@')) input = input.slice(1).trimStart();
  if (shell === 'powershell' && input.startsWith('&')) input = input.slice(1).trimStart();
  if (!input) return undefined;

  const quote = input[0];
  if (quote === '"' || quote === "'") {
    const end = input.indexOf(quote, 1);
    return end > 1 ? input.slice(1, end) : undefined;
  }
  return input.match(/^\S+/)?.[0];
}

function interactiveSessionShell(command: string, outerShell: string): string {
  const executable = firstCommandExecutable(command, outerShell);
  const nestedShell = classifyDirectoryDeleteShell(executable);
  if (nestedShell === 'powershell') return 'powershell.exe';
  if (nestedShell === 'cmd') return 'cmd.exe';
  return outerShell;
}

const installedManagers = new WeakSet<object>();

export function installDirectoryDeleteGuard(
  manager: DirectoryDeleteGuardTerminalManager = terminalManager,
): void {
  if (installedManagers.has(manager)) return;
  installedManagers.add(manager);

  const sessionContexts = new Map<number, SessionContext>();
  const pruneSessionContexts = () => {
    for (const pid of sessionContexts.keys()) {
      if (!manager.getSession(pid)) sessionContexts.delete(pid);
    }
  };
  const originalExecuteCommand = manager.executeCommand.bind(manager);
  const originalSendInputToProcess = manager.sendInputToProcess.bind(manager);

  manager.executeCommand = async (
    command: string,
    timeoutMs?: number,
    shell?: string,
    collectTiming?: boolean,
  ): Promise<CommandExecutionResult> => {
    pruneSessionContexts();
    const cwd = process.cwd();
    const validation = validateDirectoryDeleteCommand(command, shell, cwd);
    if (validation.detected && !validation.allowed) {
      return {
        pid: -1,
        output: formatDirectoryDeleteGuardError(validation),
        isBlocked: false,
      };
    }

    const result = await originalExecuteCommand(command, timeoutMs, shell, collectTiming);
    if (result.pid >= 0 && typeof shell === 'string' && manager.getSession(result.pid)) {
      sessionContexts.set(result.pid, {
        shell: interactiveSessionShell(command, shell),
        cwd,
      });
    }
    return result;
  };

  manager.sendInputToProcess = (pid: number, input: string): boolean => {
    pruneSessionContexts();
    const session = manager.getSession(pid);
    if (!session) sessionContexts.delete(pid);

    const context = session ? sessionContexts.get(pid) : undefined;
    if (context) {
      const validation = validateDirectoryDeleteCommand(input, context.shell, context.cwd, {
        requireFullyQualifiedTarget: true,
      });
      if (validation.detected && !validation.allowed) {
        throw new Error(formatDirectoryDeleteGuardError(validation));
      }
    }

    return originalSendInputToProcess(pid, input);
  };
}
