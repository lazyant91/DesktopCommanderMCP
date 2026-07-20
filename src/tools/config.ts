import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

import {
  CONFIG_FIELD_DEFINITIONS,
  CONFIG_FIELD_KEYS,
  isConfigFieldKey,
  type ConfigFieldKey,
} from '../config-field-definitions.js';
import { configManager, type ServerConfig } from '../config-manager.js';
import { currentClient } from '../server.js';
import { SetConfigValueArgsSchema } from './schemas.js';
import { getSystemInfo } from '../utils/system-info.js';

async function pathExists(pathValue: string): Promise<boolean> {
  try {
    await access(pathValue, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function detectAvailableShells(
  systemInfo: ReturnType<typeof getSystemInfo>,
): Promise<string[]> {
  const detected = new Set<string>();
  const add = (shell: string | undefined): void => {
    if (shell?.trim()) detected.add(shell.trim());
  };

  add(systemInfo.defaultShell);

  if (systemInfo.isWindows) {
    add(process.env.ComSpec);
    const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
    for (const shell of [
      `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      `${systemRoot}\\System32\\cmd.exe`,
      'powershell.exe',
      'pwsh.exe',
      'cmd.exe',
    ]) {
      if (!shell.includes('\\') || (await pathExists(shell))) add(shell);
    }
    return [...detected];
  }

  add(process.env.SHELL);
  try {
    const content = await readFile('/etc/shells', 'utf8');
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .forEach(add);
  } catch {
    // Shell discovery is best-effort host information.
  }

  for (const shell of ['/bin/zsh', '/bin/bash', '/bin/sh', '/usr/bin/fish']) {
    if (await pathExists(shell)) add(shell);
  }
  return [...detected];
}

export async function getConfig() {
  try {
    const config = await configManager.getConfig();
    const systemInfo = getSystemInfo();
    const memoryUsage = process.memoryUsage();
    const result = {
      config,
      currentClient,
      availableShells: await detectAvailableShells(systemInfo),
      systemInfo: {
        ...systemInfo,
        memoryBytes: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          arrayBuffers: memoryUsage.arrayBuffers,
        },
      },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: `Local MCP configuration:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Failed to read local MCP configuration: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
}

function parseArrayValue(value: unknown): string[] | undefined {
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  if (typeof value !== 'string') return undefined;

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    if (value.trim()) return [value.trim()];
  }
  return undefined;
}

function parseConfigValue(key: ConfigFieldKey, value: unknown): ServerConfig[ConfigFieldKey] {
  const definition = CONFIG_FIELD_DEFINITIONS[key];

  if (definition.valueType === 'array') {
    const parsed = parseArrayValue(value);
    if (!parsed) throw new Error(`${key} must be an array of strings.`);
    return parsed;
  }

  if (definition.valueType === 'number') {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(`${key} must be a positive number.`);
    }
    return Math.floor(parsed);
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return value.trim();
}

export async function setConfigValue(args: unknown) {
  const parsed = SetConfigValueArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      content: [{ type: 'text' as const, text: `Invalid arguments: ${parsed.error.message}` }],
      isError: true,
    };
  }

  if (!isConfigFieldKey(parsed.data.key)) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Unsupported configuration key. Allowed keys: ${CONFIG_FIELD_KEYS.join(', ')}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const value = parseConfigValue(parsed.data.key, parsed.data.value);
    await configManager.setValue(parsed.data.key, value as never);
    const updated = await configManager.getConfig();
    return {
      content: [
        {
          type: 'text' as const,
          text: `Updated ${parsed.data.key}.\n${JSON.stringify(updated, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Failed to update configuration: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
}
