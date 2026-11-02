import { computeFingerprint, fingerprintScope } from '../../server/workflows/errors/grouping.ts';
import { normalizeEvent } from '../../server/workflows/errors/sentry/normalize.ts';
import type { NormalizedEvent } from '../../server/workflows/errors/types.ts';

export interface GroupingCase {
  id: string;
  why: string;
  a: { project: string; event: NormalizedEvent };
  b: { project: string; event: NormalizedEvent };
  /** Whether a person would say these two are the same bug and belong in one issue. */
  same: boolean;
}

interface Frame {
  filename: string;
  function: string;
  lineno: number;
  in_app: boolean;
  context_line?: string;
}

let n = 0;
const ev = (raw: Record<string, unknown>): NormalizedEvent =>
  normalizeEvent(JSON.stringify({ event_id: `g${(++n).toString(16).padStart(31, '0')}`, platform: 'python', level: 'error', ...raw }));
const crash = (type: string, value: string, frames: Frame[], extra: Record<string, unknown> = {}) =>
  ev({ exception: { values: [{ type, value, stacktrace: { frames } }] }, ...extra });
const frame = (filename: string, fn: string, lineno: number, context_line?: string): Frame => ({
  filename,
  function: fn,
  lineno,
  in_app: true,
  ...(context_line ? { context_line } : {}),
});

const get = (project: string, event: NormalizedEvent) => ({ project, event });
const pair = (id: string, same: boolean, why: string, a: NormalizedEvent, b: NormalizedEvent, projects: [string, string] = ['1', '1']): GroupingCase => ({
  id,
  same,
  why,
  a: get(projects[0], a),
  b: get(projects[1], b),
});

export const GROUPING_CASES: readonly GroupingCase[] = [
  pair(
    'same-bug-different-data',
    true,
    'Only the id in the message differs.',
    crash('KeyError', "'u42'", [frame('/app/h.py', 'handle', 12, "uid = p['user_id']")]),
    crash('KeyError', "'u7'", [frame('/app/h.py', 'handle', 12, "uid = p['user_id']")]),
  ),
  pair(
    'same-bug-new-deploy-hash',
    true,
    'The bundle file name carries a new content hash after a deploy.',
    crash('TypeError', 'x is undefined', [frame('https://a.io/static/main.3f9a8c1b.js', 'f', 10)]),
    crash('TypeError', 'x is undefined', [frame('https://a.io/static/main.9d8e7f6a.js', 'f', 10)]),
  ),
  pair(
    'same-bug-query-string',
    true,
    'Only the cache-busting query string differs.',
    crash('TypeError', 'x is undefined', [frame('https://a.io/app.js?v=2', 'f', 10)]),
    crash('TypeError', 'x is undefined', [frame('https://a.io/app.js?v=3', 'f', 10)]),
  ),
  pair(
    'same-bug-line-moved',
    true,
    'A deploy moved the line number; the source line is the same.',
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")]),
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 45, "v = d['k']")]),
  ),
  pair(
    'same-bug-other-environment',
    true,
    'Staging and production hit the same bug.',
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")], { environment: 'production' }),
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")], { environment: 'staging' }),
  ),
  pair(
    'same-message-different-number',
    true,
    'No stack; only the number in the message differs.',
    ev({ message: 'User 42 not found' }),
    ev({ message: 'User 7 not found' }),
  ),
  pair(
    'override-same-fingerprint',
    true,
    'The app sets the same custom fingerprint on two different exceptions.',
    crash('A', 'a', [frame('/app/x.py', 'f', 1)], { fingerprint: ['payments'] }),
    crash('B', 'b', [frame('/app/y.py', 'g', 2)], { fingerprint: ['payments'] }),
  ),

  pair(
    'different-line',
    false,
    'Same file and exception, a different line of code.',
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")]),
    crash('KeyError', "'z'", [frame('/app/h.py', 'handle', 90, "v = d['z']")]),
  ),
  pair(
    'different-exception-type',
    false,
    'Same line, a different exception type.',
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, 'v = d.k()')]),
    crash('AttributeError', "'k'", [frame('/app/h.py', 'handle', 42, 'v = d.k()')]),
  ),
  pair(
    'different-file',
    false,
    'Same exception and line text in a different file.',
    crash('KeyError', "'k'", [frame('/app/a.py', 'handle', 42, "v = d['k']")]),
    crash('KeyError', "'k'", [frame('/app/b.py', 'handle', 42, "v = d['k']")]),
  ),
  pair(
    'different-project',
    false,
    'The same error from two projects belongs to two repos.',
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")]),
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")]),
    ['1', '2'],
  ),
  pair(
    'different-service',
    false,
    'The same error from two services in one project.',
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")], { tags: { service: 'api' } }),
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")], { tags: { service: 'worker' } }),
  ),
  pair(
    'different-message-no-stack',
    false,
    'No stack and different wording: not the same problem.',
    ev({ message: 'disk full' }),
    ev({ message: 'network down' }),
  ),
  pair(
    'override-default-plus-tenant',
    false,
    'The default key plus a tenant name keeps tenants apart.',
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")], { fingerprint: ['{{ default }}', 'tenant-a'] }),
    crash('KeyError', "'k'", [frame('/app/h.py', 'handle', 42, "v = d['k']")], { fingerprint: ['{{ default }}', 'tenant-b'] }),
  ),
  pair(
    'different-function-no-source',
    false,
    'No source line sent; different functions are different bugs.',
    crash('TypeError', 'x is undefined', [frame('https://a.io/app.js', 'render', 10)]),
    crash('TypeError', 'x is undefined', [frame('https://a.io/app.js', 'save', 10)]),
  ),
];

/** True when the app's own grouping puts the two events in one issue. */
export function groupedTogether(c: GroupingCase): boolean {
  const key = (side: GroupingCase['a']) => computeFingerprint(side.event, fingerprintScope(side.project, side.event));
  return key(c.a) === key(c.b);
}
