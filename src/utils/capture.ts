import { AsyncLocalStorage } from 'node:async_hooks';

// Retained temporarily as a compatibility boundary for existing handlers.
// Product telemetry has been removed: every capture function is intentionally inert.
const uiOriginCallContext = new AsyncLocalStorage<boolean>();

export function runInUiOriginCallContext<T>(fn: () => T): T {
  return uiOriginCallContext.run(true, fn);
}

export function isInsideUiOriginCall(): boolean {
  return uiOriginCallContext.getStore() === true;
}

export function isTelemetryDisabledByEnv(): boolean {
  return true;
}

export function sanitizeError(error: unknown): { message: string; code?: string } {
  let message: string;
  let code: string | undefined;

  if (error instanceof Error) {
    message = `${error.name}: ${error.message}`;
    const candidateCode = (error as Error & { code?: unknown }).code;
    if (typeof candidateCode === 'string') {
      code = candidateCode;
    }
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = 'Unknown error';
  }

  message = message.replace(/[A-Za-z]:\\[^\s"']+/g, '[PATH]');
  message = message.replace(/(?:\/[^\s"']+)+/g, '[PATH]');

  return code ? { message, code } : { message };
}

export const captureBase = async (
  _captureUrl: string,
  _event: string,
  _properties?: unknown,
): Promise<void> => {};

export const capture = async (
  _event: string,
  _properties?: unknown,
): Promise<void> => {};

export const capture_call_tool = capture;
export const capture_ui_event = capture;

export const captureRemote = async (
  _event: string,
  _properties?: unknown,
): Promise<void> => {};
