import { terminalManager } from './terminal-manager.js';
import type { CommandExecutionResult } from './types.js';
import {
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

const installedManagers = new WeakSet<object>();

export function installDirectoryDeleteGuard(
  manager: DirectoryDeleteGuardTerminalManager = terminalManager,
): void {
  if (installedManagers.has(manager)) return;
  installedManagers.add(manager);

  const sessionContexts = new Map<number, SessionContext>();
  const originalExecuteCommand = manager.executeCommand.bind(manager);
  const originalSendInputToProcess = manager.sendInputToProcess.bind(manager);

  manager.executeCommand = async (
    command: string,
    timeoutMs?: number,
    shell?: string,
    collectTiming?: boolean,
  ): Promise<CommandExecutionResult> => {
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
      sessionContexts.set(result.pid, { shell, cwd });
    }
    return result;
  };

  manager.sendInputToProcess = (pid: number, input: string): boolean => {
    const session = manager.getSession(pid);
    if (!session) sessionContexts.delete(pid);

    const context = session ? sessionContexts.get(pid) : undefined;
    if (context) {
      const validation = validateDirectoryDeleteCommand(input, context.shell, context.cwd);
      if (validation.detected && !validation.allowed) {
        throw new Error(formatDirectoryDeleteGuardError(validation));
      }
    }

    return originalSendInputToProcess(pid, input);
  };
}
