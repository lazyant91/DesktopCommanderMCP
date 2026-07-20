import { listProcesses, killProcess } from '../tools/process.js';
import { ServerResult } from '../types.js';

export async function handleListProcesses(): Promise<ServerResult> {
  return listProcesses();
}

export async function handleKillProcess(args: unknown): Promise<ServerResult> {
  return killProcess(args);
}
