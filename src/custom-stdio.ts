import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import process from 'node:process';

type LogLevel =
  | 'emergency'
  | 'alert'
  | 'critical'
  | 'error'
  | 'warning'
  | 'notice'
  | 'info'
  | 'debug';

interface LogNotification {
  jsonrpc: '2.0';
  method: 'notifications/message';
  params: {
    level: LogLevel;
    logger: string;
    data: unknown;
  };
}

type BufferedLog = {
  level: LogLevel;
  args: unknown[];
  timestamp: number;
};

/**
 * Stdio transport that keeps stdout protocol-safe.
 *
 * Console output and non-JSON stdout strings are converted to MCP logging
 * notifications. Messages emitted before initialization are buffered until the
 * client completes the MCP handshake.
 */
export class FilteredStdioServerTransport extends StdioServerTransport {
  private readonly originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
    info: typeof console.info;
  };

  private readonly originalStdoutWrite: typeof process.stdout.write;
  private isInitialized = false;
  private messageBuffer: BufferedLog[] = [];

  constructor() {
    super();

    this.originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
      info: console.info,
    };
    this.originalStdoutWrite = process.stdout.write;

    this.setupConsoleRedirection();
    this.setupStdoutFiltering();
  }

  /** Enable logging notifications after the MCP handshake is complete. */
  public enableNotifications(): void {
    if (this.isInitialized) return;

    this.isInitialized = true;
    this.sendLogNotification('info', ['Local MCP stdio transport initialized']);

    const buffered = this.messageBuffer.sort((a, b) => a.timestamp - b.timestamp);
    this.messageBuffer = [];

    for (const message of buffered) {
      this.sendLogNotification(message.level, message.args);
    }
  }

  public get isNotificationsEnabled(): boolean {
    return this.isInitialized;
  }

  public get bufferedMessageCount(): number {
    return this.messageBuffer.length;
  }

  /** Send or buffer a protocol-safe logging notification. */
  public sendLog(level: LogLevel, message: string, data?: unknown): void {
    const payload = data && typeof data === 'object'
      ? [{ message, ...(data as Record<string, unknown>) }]
      : [data === undefined ? message : { message, data }];

    if (!this.isInitialized) {
      this.bufferMessage(level, payload);
      return;
    }

    this.sendLogNotification(level, payload);
  }

  /** Send an MCP progress notification after initialization. */
  public sendProgress(token: string, value: number, total?: number): void {
    if (!this.isInitialized) return;

    try {
      this.writeJsonRpc({
        jsonrpc: '2.0' as const,
        method: 'notifications/progress',
        params: {
          progressToken: token,
          value,
          ...(total === undefined ? {} : { total }),
        },
      });
    } catch {
      this.sendLogNotification('error', [
        `Progress notification failed: ${token} ${value}${total === undefined ? '' : `/${total}`}`,
      ]);
    }
  }

  /** Send a custom notification after initialization. */
  public sendCustomNotification(method: string, params: unknown): void {
    if (!this.isInitialized) return;

    try {
      this.writeJsonRpc({
        jsonrpc: '2.0' as const,
        method,
        params,
      });
    } catch {
      this.sendLogNotification('error', [`Custom notification failed: ${method}`]);
    }
  }

  /** Restore the process globals replaced by this transport. */
  public cleanup(): void {
    console.log = this.originalConsole.log;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
    console.info = this.originalConsole.info;
    process.stdout.write = this.originalStdoutWrite;
  }

  private setupConsoleRedirection(): void {
    console.log = (...args: unknown[]) => this.routeConsoleMessage('info', args);
    console.info = (...args: unknown[]) => this.routeConsoleMessage('info', args);
    console.warn = (...args: unknown[]) => this.routeConsoleMessage('warning', args);
    console.error = (...args: unknown[]) => this.routeConsoleMessage('error', args);
    console.debug = (...args: unknown[]) => this.routeConsoleMessage('debug', args);
  }

  private setupStdoutFiltering(): void {
    process.stdout.write = (buffer: any, encoding?: any, callback?: any): boolean => {
      if (typeof buffer !== 'string') {
        return this.originalStdoutWrite.call(process.stdout, buffer, encoding, callback);
      }

      const trimmed = buffer.trim();
      if (trimmed.length === 0 || this.looksLikeJsonRpc(trimmed)) {
        return this.originalStdoutWrite.call(process.stdout, buffer, encoding, callback);
      }

      this.routeConsoleMessage('info', [buffer.replace(/\n$/, '')]);
      if (typeof callback === 'function') callback();
      return true;
    };
  }

  private routeConsoleMessage(level: LogLevel, args: unknown[]): void {
    if (!this.isInitialized) {
      this.bufferMessage(level, args);
      return;
    }

    this.sendLogNotification(level, args);
  }

  private bufferMessage(level: LogLevel, args: unknown[]): void {
    this.messageBuffer.push({
      level,
      args,
      timestamp: Date.now(),
    });
  }

  private looksLikeJsonRpc(value: string): boolean {
    if (!value.startsWith('{')) return false;

    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed.jsonrpc === '2.0' || 'method' in parsed || 'id' in parsed;
    } catch {
      return false;
    }
  }

  private sendLogNotification(level: LogLevel, args: unknown[]): void {
    try {
      const notification: LogNotification = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: {
          level,
          logger: 'local-mcp-server',
          data: this.serializeArgs(args),
        },
      };
      this.writeJsonRpc(notification);
    } catch {
      const fallback: LogNotification = {
        jsonrpc: '2.0',
        method: 'notifications/message',
        params: {
          level: 'error',
          logger: 'local-mcp-server',
          data: 'Log notification serialization failed',
        },
      };
      this.writeJsonRpc(fallback);
    }
  }

  private serializeArgs(args: unknown[]): unknown {
    if (args.length === 1) {
      const [value] = args;
      if (value !== null && typeof value === 'object') return value;
      return String(value);
    }

    return args
      .map((value) => {
        if (value !== null && typeof value === 'object') {
          try {
            return JSON.stringify(value, null, 2);
          } catch {
            return String(value);
          }
        }
        return String(value);
      })
      .join(' ');
  }

  private writeJsonRpc(message: unknown): void {
    this.originalStdoutWrite.call(process.stdout, `${JSON.stringify(message)}\n`);
  }
}
