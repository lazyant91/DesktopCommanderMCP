import path from 'path';
import os from 'os';

// Use a product-specific directory so this server does not share state with the upstream project.
export const USER_HOME = os.homedir();
const CONFIG_DIR = path.join(USER_HOME, '.local-mcp-server');

export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_COMMAND_TIMEOUT = 1000; // milliseconds
