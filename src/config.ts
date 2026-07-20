import path from 'path';
import os from 'os';

// Use the user's home directory for the local MCP configuration file.
export const USER_HOME = os.homedir();
const CONFIG_DIR = path.join(USER_HOME, '.claude-server-commander');

export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_COMMAND_TIMEOUT = 1000; // milliseconds
