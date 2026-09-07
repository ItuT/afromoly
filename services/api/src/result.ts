import type { ServerErrorCode } from '@afromoly/protocol';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: ServerErrorCode; message: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(code: ServerErrorCode, message: string): Result<T> => ({
  ok: false,
  code,
  message,
});
