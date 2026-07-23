import { terminalManager, MAX_BUFFERED_OUTPUT_CHARS } from '../terminal-manager.js';
import {
  createAiAgentInteractivePolicyState,
  evaluateAiAgentInteractiveInputWithState,
  evaluateAiAgentInvocation,
} from '../ai-agent-policy.js';
import { commandManager } from '../command-manager.js';
import {
  StartProcessArgsSchema,
  ReadProcessOutputArgsSchema,
  InteractWithProcessArgsSchema,
  ForceTerminateArgsSchema,
} from './schemas.js';
import { capture } from '../utils/capture.js';
import { ServerResult } from '../types.js';
import {
  analyzeProcessState,
  cleanProcessOutput,
  formatProcessStateMessage,
  ProcessState,
} from '../utils/process-detection.js';
import * as os from 'os';
import { configManager } from '../config-manager.js';

function immutableDecisionError(
  decision: ReturnType<typeof evaluateAiAgentInvocation>,
): ServerResult | null {
  if (decision.allowed) return null;

  return {
    content: [
      {
        type: 'text',
        text: `Error: Local AI agent CLI execution is disabled by immutable policy (${decision.agent}).`,
      },
    ],
    isError: true,
  };
}

function immutablePolicyError(input: string, shell?: string): ServerResult | null {
  return immutableDecisionError(evaluateAiAgentInvocation(input, shell));
}


/**
 * Start an owned local terminal process.
 * Includes early detection of a process waiting for input.
 */
export async function startProcess(args: unknown): Promise<ServerResult> {
  const parsed = StartProcessArgsSchema.safeParse(args);
  if (!parsed.success) {
    capture('server_start_process_failed');
    return {
      content: [
        {
          type: 'text',
          text: `Error: Invalid arguments for start_process: ${parsed.error}`,
        },
      ],
      isError: true,
    };
  }

  let shellUsed: string | undefined = parsed.data.shell;

  if (!shellUsed) {
    const config = await configManager.getConfig();
    if (config.defaultShell) {
      shellUsed = config.defaultShell;
    } else {
      const isWindows = os.platform() === 'win32';
      if (isWindows && process.env.COMSPEC) {
        shellUsed = process.env.COMSPEC;
      } else if (!isWindows && process.env.SHELL) {
        shellUsed = process.env.SHELL;
      } else {
        shellUsed = isWindows ? 'cmd.exe' : '/bin/sh';
      }
    }
  }

  const policyError = immutablePolicyError(parsed.data.command, shellUsed);
  if (policyError) return policyError;

  const shellPolicyError = immutablePolicyError(shellUsed);
  if (shellPolicyError) return shellPolicyError;

  try {
    const commands = commandManager.extractCommands(parsed.data.command).join(', ');
    capture('server_start_process', {
      command: commandManager.getBaseCommand(parsed.data.command),
      commands,
    });
  } catch {
    capture('server_start_process', {
      command: commandManager.getBaseCommand(parsed.data.command),
    });
  }

  const isAllowed = await commandManager.validateCommand(parsed.data.command, shellUsed);
  if (!isAllowed) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Command not allowed: ${parsed.data.command}`,
        },
      ],
      isError: true,
    };
  }

  const result = await terminalManager.executeCommand(
    parsed.data.command,
    parsed.data.timeout_ms,
    shellUsed,
    parsed.data.verbose_timing || false,
  );

  if (result.pid === -1) {
    return {
      content: [{ type: 'text', text: result.output }],
      isError: true,
    };
  }

  const processState = analyzeProcessState(result.output, result.pid);

  let statusMessage = '';
  if (processState.isWaitingForInput) {
    statusMessage = `\n🔄 ${formatProcessStateMessage(processState, result.pid)}`;
  } else if (processState.isFinished) {
    statusMessage = `\n✅ ${formatProcessStateMessage(processState, result.pid)}`;
  } else if (result.isBlocked) {
    statusMessage = '\n⏳ Process is running. Use read_process_output to get more output.';
  }

  let timingMessage = '';
  if (result.timingInfo) {
    timingMessage = formatTimingInfo(result.timingInfo);
  }

  return {
    content: [
      {
        type: 'text',
        text: `Process started with PID ${result.pid} (shell: ${shellUsed})\nInitial output:\n${result.output}${statusMessage}${timingMessage}`,
      },
    ],
  };
}

function formatTimingInfo(timing: any): string {
  let msg = '\n\n📊 Timing Information:\n';
  msg += `  Exit Reason: ${timing.exitReason}\n`;
  msg += `  Total Duration: ${timing.totalDurationMs}ms\n`;

  if (timing.timeToFirstOutputMs !== undefined) {
    msg += `  Time to First Output: ${timing.timeToFirstOutputMs}ms\n`;
  }

  if (timing.firstOutputTime && timing.lastOutputTime) {
    msg += `  Output Window: ${timing.lastOutputTime - timing.firstOutputTime}ms\n`;
  }

  if (timing.outputEvents && timing.outputEvents.length > 0) {
    msg += `\n  Output Events (${timing.outputEvents.length} total):\n`;
    timing.outputEvents.forEach((event: any, idx: number) => {
      msg += `    [${idx + 1}] +${event.deltaMs}ms | ${event.source} | ${event.length}b`;
      if (event.matchedPattern) {
        msg += ` | 🎯 ${event.matchedPattern}`;
      }
      msg += `\n       "${event.snippet}"\n`;
    });
  }

  return msg;
}

/** Read bounded output from an owned terminal session. */
export async function readProcessOutput(args: unknown): Promise<ServerResult> {
  const parsed = ReadProcessOutputArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Invalid arguments for read_process_output: ${parsed.error}`,
        },
      ],
      isError: true,
    };
  }

  const config = await configManager.getConfig();
  const defaultLength = config.fileReadLineLimit ?? 1000;

  const {
    pid,
    timeout_ms = 5000,
    offset = 0,
    length = defaultLength,
    verbose_timing = false,
  } = parsed.data;

  const startTime = Date.now();
  const session = terminalManager.getSession(pid);

  if (session && offset === 0) {
    const waitForOutput = (): Promise<void> => {
      return new Promise((resolve) => {
        const currentLines = terminalManager.getOutputLineCount(pid) || 0;
        if (currentLines > session.lastReadIndex) {
          resolve();
          return;
        }

        let resolved = false;
        let interval: NodeJS.Timeout | null = null;
        let timeout: NodeJS.Timeout | null = null;

        const cleanup = () => {
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
        };

        const resolveOnce = () => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve();
        };

        interval = setInterval(() => {
          const newLineCount = terminalManager.getOutputLineCount(pid) || 0;
          if (newLineCount > session.lastReadIndex) {
            resolveOnce();
          }
        }, 50);

        timeout = setTimeout(resolveOnce, timeout_ms);
      });
    };

    await waitForOutput();
  }

  const result = terminalManager.readOutputPaginated(pid, offset, length);
  if (!result) {
    return {
      content: [{ type: 'text', text: `No session found for PID ${pid}` }],
      isError: true,
    };
  }

  const output = result.lines.join('\n');
  let statusMessage = '';

  if (offset < 0) {
    statusMessage = `[Reading last ${result.readCount} lines (total: ${result.totalLines} lines)]`;
  } else if (offset === 0) {
    if (result.remaining > 0) {
      statusMessage = `[Reading ${result.readCount} new lines from line ${result.readFrom} (total: ${result.totalLines} lines, ${result.remaining} remaining)]`;
    } else {
      statusMessage = `[Reading ${result.readCount} new lines (total: ${result.totalLines} lines)]`;
    }
  } else {
    statusMessage = `[Reading ${result.readCount} lines from line ${result.readFrom} (total: ${result.totalLines} lines, ${result.remaining} remaining)]`;
  }

  if (result.evictedLines && result.evictedLines > 0) {
    const capMB = Math.round(MAX_BUFFERED_OUTPUT_CHARS / 1024 / 1024);
    statusMessage += `\n[WARNING: output exceeded the ${capMB}MB buffer cap; the ${result.evictedLines} earliest lines were evicted and cannot be read. Line numbers and totals refer to the retained buffer only]`;
  }

  let processStateMessage = '';
  if (result.isComplete) {
    const runtimeStr =
      result.runtimeMs !== undefined
        ? ` (runtime: ${(result.runtimeMs / 1000).toFixed(2)}s)`
        : '';
    processStateMessage = `\n✅ Process completed with exit code ${result.exitCode}${runtimeStr}`;
  } else if (session) {
    const fullOutput = session.outputLines.join('\n');
    const processState = analyzeProcessState(fullOutput, pid);
    if (processState.isWaitingForInput) {
      processStateMessage = `\n🔄 ${formatProcessStateMessage(processState, pid)}`;
    }
  }

  let timingMessage = '';
  if (verbose_timing) {
    timingMessage = `\n\n📊 Timing: ${Date.now() - startTime}ms`;
  }

  const responseText = output || '(No output in requested range)';
  return {
    content: [
      {
        type: 'text',
        text: `${statusMessage}\n\n${responseText}${processStateMessage}${timingMessage}`,
      },
    ],
  };
}

/** Send input to an owned interactive terminal session. */
export async function interactWithProcess(args: unknown): Promise<ServerResult> {
  const parsed = InteractWithProcessArgsSchema.safeParse(args);
  if (!parsed.success) {
    capture('server_interact_with_process_failed', {
      error: 'Invalid arguments',
    });
    return {
      content: [
        {
          type: 'text',
          text: `Error: Invalid arguments for interact_with_process: ${parsed.error}`,
        },
      ],
      isError: true,
    };
  }

  const {
    pid,
    input,
    timeout_ms = 8000,
    wait_for_prompt = true,
    verbose_timing = false,
  } = parsed.data;

  const config = await configManager.getConfig();
  const maxOutputLines = config.fileReadLineLimit ?? 1000;
  const startTime = Date.now();
  let firstOutputTime: number | undefined;
  let lastOutputTime: number | undefined;
  const outputEvents: any[] = [];
  let exitReason:
    | 'early_exit_quick_pattern'
    | 'early_exit_periodic_check'
    | 'process_finished'
    | 'timeout'
    | 'no_wait' = 'timeout';

  try {
    capture('server_interact_with_process', {
      pid,
      inputLength: input.length,
    });

    // Keep policy evaluation, stdin delivery, and state commit in one synchronous
    // section so concurrent requests observe the same order as actual REPL input.
    const session = terminalManager.getSession(pid);
    const inputPolicyMode = session?.inputPolicyMode ?? 'command';
    const interactiveEvaluation = evaluateAiAgentInteractiveInputWithState(
      input,
      inputPolicyMode,
      session?.inputPolicyState ?? createAiAgentInteractivePolicyState(),
    );
    const policyError = immutableDecisionError(interactiveEvaluation.decision);
    if (policyError) return policyError;

    const outputSnapshot = terminalManager.captureOutputSnapshot(pid);
    const success = terminalManager.sendInputToProcess(pid, input);

    if (!success) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Failed to send input to process ${pid}. The process may have exited or doesn't accept input.`,
          },
        ],
        isError: true,
      };
    }

    if (session) session.inputPolicyState = interactiveEvaluation.nextState;

    if (!wait_for_prompt) {
      exitReason = 'no_wait';
      let timingMessage = '';
      if (verbose_timing) {
        const endTime = Date.now();
        timingMessage = formatTimingInfo({
          startTime,
          endTime,
          totalDurationMs: endTime - startTime,
          exitReason,
          firstOutputTime,
          lastOutputTime,
          timeToFirstOutputMs: undefined,
          outputEvents: undefined,
        });
      }
      return {
        content: [
          {
            type: 'text',
            text: `✅ Input sent to process ${pid}. Use read_process_output to get the response.${timingMessage}`,
          },
        ],
      };
    }

    let output = '';
    let processState: ProcessState | undefined;
    let earlyExit = false;

    const waitForResponse = (): Promise<void> => {
      return new Promise((resolve) => {
        let resolved = false;
        let attempts = 0;
        const pollIntervalMs = 50;
        const maxAttempts = Math.ceil(timeout_ms / pollIntervalMs);
        let interval: NodeJS.Timeout | null = null;
        let lastOutputLength = 0;

        const resolveOnce = () => {
          if (resolved) return;
          resolved = true;
          if (interval) clearInterval(interval);
          resolve();
        };

        interval = setInterval(() => {
          if (resolved) return;

          const newOutput = outputSnapshot
            ? terminalManager.getOutputSinceSnapshot(pid, outputSnapshot)
            : terminalManager.getNewOutput(pid);

          if (newOutput && newOutput.length > lastOutputLength) {
            const now = Date.now();
            if (!firstOutputTime) firstOutputTime = now;
            lastOutputTime = now;

            if (verbose_timing) {
              outputEvents.push({
                timestamp: now,
                deltaMs: now - startTime,
                source: 'periodic_poll',
                length: newOutput.length - lastOutputLength,
                snippet: newOutput
                  .slice(lastOutputLength, lastOutputLength + 50)
                  .replace(/\n/g, '\\n'),
              });
            }

            output = newOutput;
            lastOutputLength = newOutput.length;
            processState = analyzeProcessState(output, pid);

            if (processState.isWaitingForInput) {
              earlyExit = true;
              exitReason = 'early_exit_periodic_check';
              if (verbose_timing && outputEvents.length > 0) {
                outputEvents[outputEvents.length - 1].matchedPattern = 'periodic_check';
              }
              resolveOnce();
              return;
            }

            if (processState.isFinished) {
              exitReason = 'process_finished';
              resolveOnce();
              return;
            }
          }

          attempts += 1;
          if (attempts >= maxAttempts) {
            exitReason = 'timeout';
            resolveOnce();
          }
        }, pollIntervalMs);
      });
    };

    await waitForResponse();

    let cleanOutput = cleanProcessOutput(output, input);
    const timeoutReached =
      !earlyExit && !processState?.isFinished && !processState?.isWaitingForInput;

    let truncationMessage = '';
    const outputLines = cleanOutput.split('\n');
    if (outputLines.length > maxOutputLines) {
      cleanOutput = outputLines.slice(0, maxOutputLines).join('\n');
      const remainingLines = outputLines.length - maxOutputLines;
      truncationMessage = `\n\n⚠️ Output truncated: showing ${maxOutputLines} of ${outputLines.length} lines (${remainingLines} hidden). Use read_process_output with offset/length for full output.`;
    }

    if (!processState) {
      processState = analyzeProcessState(output, pid);
    }

    let statusMessage = '';
    if (processState.isWaitingForInput) {
      statusMessage = `\n🔄 ${formatProcessStateMessage(processState, pid)}`;
    } else if (processState.isFinished) {
      statusMessage = `\n✅ ${formatProcessStateMessage(processState, pid)}`;
    } else if (timeoutReached) {
      statusMessage = '\n⏱️ Response may be incomplete (timeout reached)';
    }

    let timingMessage = '';
    if (verbose_timing) {
      const endTime = Date.now();
      timingMessage = formatTimingInfo({
        startTime,
        endTime,
        totalDurationMs: endTime - startTime,
        exitReason,
        firstOutputTime,
        lastOutputTime,
        timeToFirstOutputMs: firstOutputTime ? firstOutputTime - startTime : undefined,
        outputEvents: outputEvents.length > 0 ? outputEvents : undefined,
      });
    }

    if (cleanOutput.trim().length === 0 && !timeoutReached) {
      return {
        content: [
          {
            type: 'text',
            text: `✅ Input executed in process ${pid}.\n📭 (No output produced)${statusMessage}${timingMessage}`,
          },
        ],
      };
    }

    let responseText = `✅ Input executed in process ${pid}`;
    if (cleanOutput && cleanOutput.trim().length > 0) {
      responseText += `:\n\n📤 Output:\n${cleanOutput}`;
    } else {
      responseText += '.\n📭 (No output produced)';
    }

    if (statusMessage) responseText += `\n\n${statusMessage}`;
    if (truncationMessage) responseText += truncationMessage;
    if (timingMessage) responseText += timingMessage;

    return {
      content: [{ type: 'text', text: responseText }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    capture('server_interact_with_process_error', {
      error: errorMessage,
    });
    return {
      content: [
        {
          type: 'text',
          text: `Error interacting with process: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

/** Terminate an owned terminal session. */
export async function forceTerminate(args: unknown): Promise<ServerResult> {
  const parsed = ForceTerminateArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: Invalid arguments for force_terminate: ${parsed.error}`,
        },
      ],
      isError: true,
    };
  }

  const pid = parsed.data.pid;
  const success = terminalManager.forceTerminate(pid);
  return {
    content: [
      {
        type: 'text',
        text: success
          ? `Successfully initiated termination of session ${pid}`
          : `No active session found for PID ${pid}`,
      },
    ],
  };
}

/** List terminal sessions owned by this server. */
export async function listSessions(): Promise<ServerResult> {
  const sessions = terminalManager.listActiveSessions();
  const sessionText = sessions.map(
    (session) =>
      `PID: ${session.pid}, Blocked: ${session.isBlocked}, Runtime: ${Math.round(
        session.runtime / 1000,
      )}s`,
  );

  return {
    content: [
      {
        type: 'text',
        text: sessionText.length === 0 ? 'No active sessions' : sessionText.join('\n'),
      },
    ],
  };
}
