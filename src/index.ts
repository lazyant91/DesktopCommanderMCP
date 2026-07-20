#!/usr/bin/env node

// MUST be first: raises the libuv threadpool size before any fs work is
// submitted. See src/bootstrap.ts for why import order matters.
import './bootstrap.js';
import { FilteredStdioServerTransport } from './custom-stdio.js';
import { server, flushDeferredMessages } from './server.js';
import { commandManager } from './command-manager.js';
import { configManager } from './config-manager.js';
import { runSetup } from './npm-scripts/setup.js';
import { runUninstall } from './npm-scripts/uninstall.js';
import { logger } from './utils/logger.js';

void commandManager;

const deferredMessages: Array<{ level: string; message: string }> = [];

function deferLog(level: string, message: string) {
  deferredMessages.push({ level, message });
}

async function runServer() {
  try {
    if (process.argv[2] === 'setup') {
      await runSetup();
      return;
    }

    if (process.argv[2] === 'remove') {
      await runUninstall();
      return;
    }

    const transport = new FilteredStdioServerTransport();
    global.mcpTransport = transport;

    try {
      deferLog('info', 'Loading configuration...');
      await configManager.loadConfig();
      deferLog('info', 'Configuration loaded successfully');
    } catch (configError) {
      deferLog(
        'error',
        `Failed to load configuration: ${
          configError instanceof Error ? configError.message : String(configError)
        }`,
      );
      if (configError instanceof Error && configError.stack) {
        deferLog('debug', `Stack trace: ${configError.stack}`);
      }
      deferLog('warning', 'Continuing with in-memory configuration only');
    }

    process.on('uncaughtException', async (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes('JSON') &&
        errorMessage.includes('Unexpected token')
      ) {
        logger.error(`JSON parsing error: ${errorMessage}`);
        return;
      }

      logger.error(`Uncaught exception: ${errorMessage}`);
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);

      if (
        errorMessage.includes('JSON') &&
        errorMessage.includes('Unexpected token')
      ) {
        logger.error(`JSON parsing rejection: ${errorMessage}`);
        return;
      }

      logger.error(`Unhandled rejection: ${errorMessage}`);
      process.exit(1);
    });

    deferLog('info', 'Connecting server...');

    server.oninitialized = () => {
      transport.enableNotifications();

      while (deferredMessages.length > 0) {
        const msg = deferredMessages.shift()!;
        transport.sendLog('info', msg.message);
      }
      flushDeferredMessages();

      transport.sendLog('info', 'Server connected successfully');
      transport.sendLog('info', 'MCP fully initialized, all startup messages sent');
    };

    await server.connect(transport);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`FATAL ERROR: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }

    const errorNotification = {
      jsonrpc: '2.0' as const,
      method: 'notifications/message',
      params: {
        level: 'error',
        logger: 'desktop-commander',
        data: `Failed to start server: ${errorMessage} (${new Date().toISOString()})`,
      },
    };
    process.stdout.write(`${JSON.stringify(errorNotification)}\n`);
    process.exit(1);
  }
}

runServer().catch(async (error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`RUNTIME ERROR: ${errorMessage}`);
  console.error(
    error instanceof Error && error.stack ? error.stack : 'No stack trace available',
  );
  process.stderr.write(
    `${JSON.stringify({
      type: 'error',
      timestamp: new Date().toISOString(),
      message: `Fatal error running server: ${errorMessage}`,
    })}\n`,
  );
  process.exit(1);
});
