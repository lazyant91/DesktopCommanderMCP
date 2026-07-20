import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CONFIG_FILE } from './config.js';

export interface ServerConfig {
  blockedCommands: string[];
  allowedDirectories: string[];
  defaultShell: string;
  fileReadLineLimit: number;
  fileWriteLineLimit: number;
}

const DEFAULT_BLOCKED_COMMANDS = [
  'mkfs',
  'format',
  'mount',
  'umount',
  'fdisk',
  'dd',
  'parted',
  'diskpart',
  'sudo',
  'su',
  'passwd',
  'adduser',
  'useradd',
  'usermod',
  'groupadd',
  'chsh',
  'visudo',
  'shutdown',
  'reboot',
  'halt',
  'poweroff',
  'init',
  'iptables',
  'firewall',
  'netsh',
  'sfc',
  'bcdedit',
  'reg',
  'net',
  'sc',
  'runas',
  'cipher',
  'takeown',
];

function defaultShell(): string {
  if (os.platform() === 'win32') return 'powershell.exe';
  return process.env.SHELL || (os.platform() === 'darwin' ? '/bin/zsh' : '/bin/sh');
}

export function getDefaultServerConfig(): ServerConfig {
  return {
    blockedCommands: [...DEFAULT_BLOCKED_COMMANDS],
    allowedDirectories: [],
    defaultShell: defaultShell(),
    fileReadLineLimit: 1000,
    fileWriteLineLimit: 50,
  };
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return undefined;
  }
  return [...value];
}

function positiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return undefined;
  }
  return Math.floor(value);
}

export function sanitizeStoredConfig(value: unknown): Partial<ServerConfig> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const input = value as Record<string, unknown>;
  const cleaned: Partial<ServerConfig> = {};
  const blockedCommands = stringArray(input.blockedCommands);
  const allowedDirectories = stringArray(input.allowedDirectories);
  const fileReadLineLimit = positiveNumber(input.fileReadLineLimit);
  const fileWriteLineLimit = positiveNumber(input.fileWriteLineLimit);

  if (blockedCommands) cleaned.blockedCommands = blockedCommands;
  if (allowedDirectories) cleaned.allowedDirectories = allowedDirectories;
  if (typeof input.defaultShell === 'string' && input.defaultShell.trim()) {
    cleaned.defaultShell = input.defaultShell.trim();
  }
  if (fileReadLineLimit !== undefined) cleaned.fileReadLineLimit = fileReadLineLimit;
  if (fileWriteLineLimit !== undefined) cleaned.fileWriteLineLimit = fileWriteLineLimit;

  return cleaned;
}

function cloneConfig(config: ServerConfig): ServerConfig {
  return {
    blockedCommands: [...config.blockedCommands],
    allowedDirectories: [...config.allowedDirectories],
    defaultShell: config.defaultShell,
    fileReadLineLimit: config.fileReadLineLimit,
    fileWriteLineLimit: config.fileWriteLineLimit,
  };
}

export class ConfigManager {
  private readonly configPath: string;
  private config: ServerConfig = getDefaultServerConfig();
  private initialized = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(configPath = CONFIG_FILE) {
    this.configPath = configPath;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const configDir = path.dirname(this.configPath);
      if (!existsSync(configDir)) {
        await fs.mkdir(configDir, { recursive: true });
      }

      let loaded: unknown = {};
      let fileExists = true;
      try {
        loaded = JSON.parse(await fs.readFile(this.configPath, 'utf8'));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          console.error('Failed to read local MCP configuration; defaults will be used:', error);
        }
        fileExists = false;
      }

      this.config = {
        ...getDefaultServerConfig(),
        ...sanitizeStoredConfig(loaded),
      };
      this.initialized = true;

      const serializedLoaded = JSON.stringify(loaded);
      const serializedCleaned = JSON.stringify(this.config);
      if (!fileExists || serializedLoaded !== serializedCleaned) {
        await this.saveConfig();
      }
    } catch (error) {
      console.error('Failed to initialize local MCP configuration:', error);
      this.config = getDefaultServerConfig();
      this.initialized = true;
    }
  }

  async loadConfig(): Promise<void> {
    await this.init();
  }

  private async writeConfigToDisk(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
  }

  private async saveConfig(): Promise<void> {
    const write = this.writeChain.then(() => this.writeConfigToDisk());
    this.writeChain = write.catch(() => {});
    await write;
  }

  async getConfig(): Promise<ServerConfig> {
    await this.init();
    return cloneConfig(this.config);
  }

  async getValue<K extends keyof ServerConfig>(key: K): Promise<ServerConfig[K]> {
    await this.init();
    const value = this.config[key];
    return Array.isArray(value) ? ([...value] as ServerConfig[K]) : value;
  }

  async setValue<K extends keyof ServerConfig>(key: K, value: ServerConfig[K]): Promise<void> {
    await this.init();
    const next = sanitizeStoredConfig({ [key]: value })[key];
    if (next === undefined) {
      throw new Error(`Invalid configuration value for ${key}.`);
    }
    this.config[key] = next as ServerConfig[K];
    await this.saveConfig();
  }

  async updateConfig(updates: Partial<ServerConfig>): Promise<ServerConfig> {
    await this.init();
    this.config = {
      ...this.config,
      ...sanitizeStoredConfig(updates),
    };
    await this.saveConfig();
    return cloneConfig(this.config);
  }

  async resetConfig(): Promise<ServerConfig> {
    await this.init();
    this.config = getDefaultServerConfig();
    await this.saveConfig();
    return cloneConfig(this.config);
  }
}

export const configManager = new ConfigManager();
