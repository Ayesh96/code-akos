import { normalizeEvent } from '../../server/workflows/errors/sentry/normalize.ts';
import type { NormalizedEvent } from '../../server/workflows/errors/types.ts';

/** One stack frame as an SDK sends it. Oldest call first, like the real thing. */
export interface Frame {
  file: string;
  fn: string;
  line: number;
  app: boolean;
  src?: string;
}

const wire = (f: Frame) => ({ filename: f.file, function: f.fn, lineno: f.line, in_app: f.app, ...(f.src ? { context_line: f.src } : {}) });

export const app = (file: string, fn: string, line: number, src?: string): Frame => ({ file, fn, line, app: true, ...(src ? { src } : {}) });
export const lib = (file: string, fn: string, line: number, src?: string): Frame => ({ file, fn, line, app: false, ...(src ? { src } : {}) });

let counter = 0;
const eventId = () => `ev${(++counter).toString(16).padStart(30, '0')}`;

type Platform = 'python' | 'javascript' | 'go';

/** A thrown exception. No frames means it arrived without a stack trace. */
export function thrown(
  platform: Platform,
  type: string,
  value: string,
  frames: Frame[],
  level = 'error',
  extra: Record<string, unknown> = {},
): NormalizedEvent {
  return normalizeEvent(
    JSON.stringify({ event_id: eventId(), platform, level, exception: { values: [{ type, value, stacktrace: { frames: frames.map(wire) } }] }, ...extra }),
  );
}

/** A plain message, as `capture_message` sends it: no exception and no stack. */
export function message(platform: Platform, text: string, level = 'info', extra: Record<string, unknown> = {}): NormalizedEvent {
  return normalizeEvent(JSON.stringify({ event_id: eventId(), platform, level, message: text, ...extra }));
}

/** A message that carries the stack of the code that logged it (`attach_stacktrace`). */
export function logged(platform: Platform, text: string, frames: Frame[], level = 'error'): NormalizedEvent {
  return normalizeEvent(
    JSON.stringify({
      event_id: eventId(),
      platform,
      level,
      message: text,
      threads: { values: [{ crashed: false, current: true, stacktrace: { frames: frames.map(wire) } }] },
    }),
  );
}
