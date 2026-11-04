import type { NormalizedEvent } from '../../server/workflows/errors/types.ts';
import type { Depth } from '../core/types.ts';
import { app, lib, logged, message, thrown } from './events.ts';
import type { CaseSource, TriageCase, TriageGold } from './types.ts';

/** The answer a case has unless it says otherwise: a real failure, not a small fix, nothing in particular to name. */
const gold = (over: Partial<TriageGold> = {}): TriageGold => ({
  smallFix: false,
  mustNotDismiss: true,
  requireTags: [],
  forbidTags: [],
  throwSite: null,
  ...over,
});
const site = (file: string, fn: string) => ({ file, fn });

function make(id: string, source: CaseSource, depth: Depth | null, why: string, event: NormalizedEvent, answer: Partial<TriageGold>): TriageCase {
  return { id, why, source, depth, event, gold: gold(answer) };
}

const py = 'python';
const js = 'javascript';

/**
 * The starter set: 37 events. Gold answers are the author's judgement, written down before any model ran, and
 * the `why` line is there so a second reader can disagree. The plan's target is 60; grow it from real
 * errors, and never edit a case after a published run just because a model got it wrong.
 */
export const TRIAGE_CASES: readonly TriageCase[] = [
  // --- A few lines in one place would fix it ---
  make(
    'py-nameerror-typo',
    'macremote',
    'D0',
    'A misspelled function name at the crash line.',
    thrown(py, 'NameError', "name 'volume_upp' is not defined", [app('/app/remote/audio.py', 'handle_key', 41, 'volume_upp(step)')]),
    {
      smallFix: true,
      throwSite: site('audio.py', 'handle_key'),
    },
  ),
  make(
    'py-none-rstrip',
    'macremote',
    'D0',
    'A missing None check on the crash line.',
    thrown(py, 'AttributeError', "'NoneType' object has no attribute 'rstrip'", [app('/app/remote/browser.py', 'open_url', 27, 'return url.rstrip("/")')]),
    {
      smallFix: true,
      throwSite: site('browser.py', 'open_url'),
    },
  ),
  make(
    'py-keyerror-guard-removed',
    'macremote',
    'D0',
    'A guard was removed; one `.get` or `in` check restores it.',
    thrown(py, 'KeyError', "'user_id'", [app('/app/worker.py', 'run', 88, 'handle(job)'), app('/app/handlers.py', 'handle', 12, "uid = payload['user_id']")]),
    {
      smallFix: true,
      throwSite: site('handlers.py', 'handle'),
    },
  ),
  make(
    'py-unbound-local',
    'new',
    'D1',
    'A variable only set inside an `if`, used after it.',
    thrown(py, 'UnboundLocalError', "cannot access local variable 'total' where it is not associated with a value", [
      app('/app/billing.py', 'invoice_total', 63, 'return total * rate'),
    ]),
    {
      smallFix: true,
      throwSite: site('billing.py', 'invoice_total'),
    },
  ),
  make(
    'py-none-subscript',
    'new',
    'D0',
    'A function that can return None is indexed without a check.',
    thrown(py, 'TypeError', "'NoneType' object is not subscriptable", [app('/app/search.py', 'first_hit', 19, 'return results[0]["id"]')]),
    {
      smallFix: true,
      throwSite: site('search.py', 'first_hit'),
    },
  ),
  make(
    'py-indexerror-off-by-one',
    'new',
    'D1',
    'A loop bound one too far.',
    thrown(py, 'IndexError', 'list index out of range', [app('/app/report.py', 'rows', 52, 'cells[i + 1]')]),
    {
      smallFix: true,
      throwSite: site('report.py', 'rows'),
    },
  ),
  make(
    'py-zero-division-empty',
    'new',
    'D0',
    'Averaging an empty list; one guard fixes it.',
    thrown(py, 'ZeroDivisionError', 'division by zero', [app('/app/stats.py', 'mean', 8, 'return sum(xs) / len(xs)')]),
    {
      smallFix: true,
      throwSite: site('stats.py', 'mean'),
    },
  ),
  make(
    'py-int-plus-str',
    'new',
    'D1',
    'A value read as text and added to a number.',
    thrown(py, 'TypeError', "unsupported operand type(s) for +: 'int' and 'str'", [app('/app/cart.py', 'add_item', 34, 'count = count + qty')]),
    {
      smallFix: true,
      throwSite: site('cart.py', 'add_item'),
    },
  ),
  make(
    'js-undefined-id',
    'scenario',
    'D0',
    'Reading a field of a value that can be undefined.',
    thrown(js, 'TypeError', "Cannot read properties of undefined (reading 'id')", [
      app('static/main.3f9a8c1b.js', 'render', 10),
      app('static/main.3f9a8c1b.js', 'getUserId', 42),
    ]),
    {
      smallFix: true,
      throwSite: site('main.js', 'getUserId'),
    },
  ),
  make(
    'js-null-addlistener',
    'new',
    'D0',
    'An element looked up before it exists.',
    thrown(js, 'TypeError', "Cannot read properties of null (reading 'addEventListener')", [
      app('src/ui/menu.js', 'bindMenu', 17, "el.addEventListener('click', open)"),
    ]),
    {
      smallFix: true,
      throwSite: site('menu.js', 'bindMenu'),
    },
  ),
  make(
    'js-reference-not-defined',
    'new',
    'D0',
    'A missing import.',
    thrown(js, 'ReferenceError', 'formatDate is not defined', [app('src/report.js', 'title', 9, 'return formatDate(d)')]),
    {
      smallFix: true,
      throwSite: site('report.js', 'title'),
    },
  ),
  make(
    'js-not-a-function',
    'new',
    'D1',
    'A callback that is sometimes not passed.',
    thrown(js, 'TypeError', 'cb is not a function', [app('src/queue.js', 'drain', 33, 'cb(item)')]),
    {
      smallFix: true,
      throwSite: site('queue.js', 'drain'),
    },
  ),
  make(
    'go-nil-pointer',
    'new',
    'D0',
    'A nil check missing before a field access.',
    thrown('go', 'runtime.Error', 'invalid memory address or nil pointer dereference', [app('internal/cart/cart.go', 'Total', 58, 'return c.Discount.Amount')]),
    {
      smallFix: true,
      throwSite: site('cart.go', 'Total'),
    },
  ),
  make(
    'lint-eslint-unused',
    'scenario',
    'D0',
    'A lint finding is a small fix by definition.',
    thrown(js, 'LintError', "ESLint: 'tmp' is assigned a value but never used (no-unused-vars)", [app('src/util.js', 'build', 5, 'const tmp = 1;')]),
    {
      smallFix: true,
      throwSite: site('util.js', 'build'),
    },
  ),
  make(
    'hardneg-reference-test-word',
    'new',
    'D0',
    'Looks like a test message ("test is not defined") but it is a thrown exception, so a small fix and never a test event.',
    thrown(js, 'ReferenceError', 'test is not defined', [app('src/checkout.js', 'pay', 71, 'if (test) skip()')]),
    {
      smallFix: true,
      forbidTags: ['test-event'],
      throwSite: site('checkout.js', 'pay'),
    },
  ),

  // --- Real failures that are NOT a small fix (the model must not say bot-safe) ---
  make(
    'py-valueerror-config-d3',
    'new',
    'D3',
    'The crash line only parses; the bad value was written by a loader in another file that is not in the stack.',
    thrown(py, 'ValueError', "invalid literal for int() with base 10: ''", [app('/app/pricing.py', 'unit_price', 22, 'return int(cfg["price"])')]),
    {
      throwSite: site('pricing.py', 'unit_price'),
    },
  ),
  make(
    'py-invariant-design-d4',
    'new',
    'D4',
    'An invariant broke only for certain data; there is no one-line fix.',
    thrown(py, 'InvariantError', 'order total does not match sum of lines (order 8841)', [
      app('/app/orders.py', 'close_order', 140, 'raise InvariantError(...)'),
    ]),
    {
      throwSite: site('orders.py', 'close_order'),
    },
  ),
  make(
    'py-recursion-d2',
    'new',
    'D2',
    'Two functions call each other; fixing it is a design change.',
    thrown(py, 'RecursionError', 'maximum recursion depth exceeded', [
      app('/app/tree.py', 'walk', 12, 'return expand(node)'),
      app('/app/tree.py', 'expand', 30, 'return walk(child)'),
    ]),
    {
      throwSite: site('tree.py', 'expand'),
    },
  ),
  make(
    'py-keyerror-cache-d4',
    'new',
    'D4',
    'Works unless a cache entry expired mid-request; a state problem.',
    thrown(py, 'KeyError', "'session:9f3'", [app('/app/session.py', 'touch', 77, 'entry = CACHE[key]')]),
    {
      throwSite: site('session.py', 'touch'),
    },
  ),
  make(
    'js-custom-error-d4',
    'new',
    'D4',
    'A deliberate throw on a business rule, not a code slip.',
    thrown(js, 'PaymentRuleError', 'refund exceeds captured amount', [app('src/payments/refund.js', 'refund', 88, 'throw new PaymentRuleError(...)')]),
    {
      throwSite: site('refund.js', 'refund'),
    },
  ),

  // --- Environment problems: tag infrastructure, never a code change ---
  make(
    'infra-econnrefused-node',
    'new',
    null,
    'The database is not reachable.',
    thrown(js, 'Error', 'connect ECONNREFUSED 127.0.0.1:5432', [app('src/db.js', 'connect', 14, 'await pool.connect()')]),
    { requireTags: ['infrastructure'], throwSite: site('db.js', 'connect') },
  ),
  make(
    'infra-permission-denied',
    'new',
    null,
    'The process may not write its log file.',
    thrown(py, 'PermissionError', "[Errno 13] Permission denied: '/var/log/app.log'", [app('/app/log.py', 'open_log', 9, 'open(PATH, "a")')]),
    { requireTags: ['infrastructure'], throwSite: site('log.py', 'open_log') },
  ),
  make(
    'infra-assistive-access',
    'macremote',
    null,
    'macOS has not granted the accessibility permission.',
    thrown(py, 'RuntimeError', 'osascript is not allowed assistive access', [app('/app/remote/keys.py', 'press', 33, 'run_osascript(script)')]),
    { requireTags: ['infrastructure'], throwSite: site('keys.py', 'press') },
  ),
  make(
    'infra-http-503',
    'new',
    null,
    'An upstream service is down.',
    thrown(js, 'HttpError', 'Request failed with status 503 Service Unavailable', [app('src/api/client.js', 'get', 40, 'throw new HttpError(res)')]),
    { requireTags: ['infrastructure'], throwSite: site('client.js', 'get') },
  ),
  make(
    'infra-disk-full',
    'new',
    null,
    'The disk is full. No regex in the rules knows this wording.',
    thrown(py, 'OSError', '[Errno 28] No space left on device', [app('/app/export.py', 'write_csv', 51, 'f.write(row)')]),
    { requireTags: ['infrastructure'], throwSite: site('export.py', 'write_csv') },
  ),

  // --- Fails inside a library ---
  make(
    'third-party-axios',
    'new',
    null,
    'The stack never enters the app.',
    thrown(js, 'TypeError', "Cannot read properties of undefined (reading 'headers')", [
      lib('node_modules/axios/lib/core/dispatchRequest.js', 'dispatchRequest', 53),
    ]),
    { requireTags: ['third-party'], forbidTags: ['bot-safe'] },
  ),
  make(
    'third-party-sqlalchemy',
    'new',
    null,
    'All frames are in site-packages.',
    thrown(py, 'InvalidRequestError', 'This Session is in prepared state', [
      lib('/usr/lib/python3/site-packages/sqlalchemy/orm/session.py', '_connection_for_bind', 1110),
    ]),
    { requireTags: ['third-party'] },
  ),

  // --- No stack to point at ---
  make('nostack-exception', 'scenario', null, 'An exception that arrived with no frames.', thrown(py, 'ValueError', 'bad input', []), {
    requireTags: ['no-stack-trace'],
  }),
  make('nostack-error-message', 'scenario', null, 'An error-level log line, no exception, no stack.', message(py, 'Job 8841 failed', 'error'), {
    requireTags: ['no-stack-trace'],
  }),

  // --- Test messages: the only cases where "Don't report it" is allowed ---
  make('test-sentry-setup', 'scenario', null, 'The classic setup check.', message(py, 'Test message from Sentry setup', 'info'), {
    mustNotDismiss: false,
    requireTags: ['test-event'],
  }),
  make('test-hello-world', 'scenario', null, 'A hello-world ping.', message(js, 'hello world', 'info'), { mustNotDismiss: false, requireTags: ['test-event'] }),
  make('test-please-ignore', 'scenario', null, 'Says so itself.', message(py, 'please ignore: testing alerts', 'warning'), {
    mustNotDismiss: false,
    requireTags: ['test-event'],
  }),
  make('test-debug-testing', 'new', null, 'Debug level "testing 123".', message(py, 'testing 123', 'debug'), {
    mustNotDismiss: false,
    requireTags: ['test-event'],
  }),

  // --- Hard negatives: they mention "test" but are real ---
  make(
    'hardneg-test-runner-crashed',
    'scenario',
    null,
    'Words say "test", but it reports a crash at error level.',
    logged(py, 'unit test runner crashed', [app('/app/ci/run.py', 'run_suite', 61)]),
    { forbidTags: ['test-event'] },
  ),
  make(
    'hardneg-payment-test-failed',
    'new',
    null,
    'A failed payment in a test-named flow, at error level.',
    logged(js, 'Payment test failed: card declined', [app('src/pay.js', 'charge', 29)]),
    { forbidTags: ['test-event'] },
  ),

  // --- Logged messages that carry a stack ---
  make(
    'logged-assistive-access',
    'macremote',
    null,
    'A logged permission problem.',
    logged(py, 'Display sleep failed: assistive access not allowed', [app('main.py', 'display_sleep', 131)]),
    { requireTags: ['infrastructure'], throwSite: site('main.py', 'display_sleep') },
  ),
  make(
    'logged-cache-skip',
    'new',
    null,
    'A logged business-logic message; nothing crashed.',
    logged(py, 'Cache rebuild skipped: key missing', [app('/app/cache.py', 'rebuild', 88)]),
    { throwSite: site('cache.py', 'rebuild') },
  ),
];
