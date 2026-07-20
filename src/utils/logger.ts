/**
 * Centralized logging utility for the Local MCP server.
 * Ensures all logging goes through protocol-safe channels based on initialization state.
 */

import type { FilteredStdioServerTransport } from '../custom-stdio.js';

// Global reference to the MCP transport (set in index.ts)
declare global {
  var mcpTransport: FilteredStdioServerTransport | undefined;
}

export type LogLevel =
  | 'emergency'
  | 'alert'
  | 'critical'
  | 'error'
  | 'warning'
  | 'notice'
  | 'info'
  | 'debug';

/** Log a message through the MCP transport when available. */
export function log(level: LogLevel, message: string, data?: any): void {
  try {
    if (global.mcpTransport) {
      global.mcpTransport.sendLog(level, message, data);
    } else {
      const notification = {
        jsonrpc: '2.0' as const,
        method: 'notifications/message',
        params: {
          level,
          logger: 'local-mcp-server',
          data: data ? { message, ...data } : message,
        },
      };
      process.stdout.write(`${JSON.stringify(notification)}\n`);
    }
  } catch {
    const notification = {
      jsonrpc: '2.0' as const,
      method: 'notifications/message',
      params: {
        level: 'error',
        logger: 'local-mcp-server',
        data: `[LOG-ERROR] Failed to log message: ${message}`,
      },
    };
    process.stdout.write(`${JSON.stringify(notification)}\n`);
  }
}

export const logger = {
  emergency: (message: string, data?: any) => log('emergency', message, data),
  alert: (message: string, data?: any) => log('alert', message, data),
  critical: (message: string, data?: any) => log('critical', message, data),
  error: (message: string, data?: any) => log('error', message, data),
  warning: (message: string, data?: any) => log('warning', message, data),
  notice: (message: string, data?: any) => log('notice', message, data),
  info: (message: string, data?: any) => log('info', message, data),
  debug: (message: string, data?: any) => log('debug', message, data),
};

/** Emit an early protocol-safe notification before the transport is initialized. */
export function logToStderr(level: LogLevel, message: string): void {
  const notification = {
    jsonrpc: '2.0' as const,
    method: 'notifications/message',
    params: {
      level,
      logger: 'local-mcp-server',
      data: message,
    },
  };
  process.stdout.write(`${JSON.stringify(notification)}\n`);
}
