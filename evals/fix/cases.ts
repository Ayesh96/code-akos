import type { NormalizedEvent } from '../../server/workflows/errors/types.ts';
import type { Depth } from '../core/types.ts';
import { app, lib, thrown, type Frame } from '../triage/events.ts';
import type { FixCase, HiddenTests, Lang } from './types.ts';

/** Where the reporting machine kept the code. The stack names these paths; the resolver maps them back into the checkout. */
const DEPLOY = '/srv/app';

const lineOf = (text: string, snippet: string, path: string): number => {
  const index = text.split('\n').findIndex((l) => l.includes(snippet));
  if (index < 0) throw new Error(`case data: "${snippet}" is not in ${path}`);
  return index + 1;
};

/** The reference fix for one file: `from` must appear exactly once, so a case cannot silently stop matching its own code. */
const patch = (files: Record<string, string>, path: string, from: string, to: string): Record<string, string> => {
  const text = files[path];
  if (text === undefined) throw new Error(`case data: no file ${path}`);
  if (text.split(from).length !== 2) throw new Error(`case data: "${from}" must appear exactly once in ${path}`);
  return { [path]: text.replace(from, to) };
};

/** An app frame whose line number is read from the case's own file, so the stack always matches the code. */
const frame = (files: Record<string, string>, path: string, fn: string, snippet: string): Frame => {
  const text = files[path];
  if (text === undefined) throw new Error(`case data: no file ${path}`);
  const line = lineOf(text, snippet, path);
  return app(`${DEPLOY}/${path}`, fn, line, (text.split('\n')[line - 1] as string).trim());
};

const TS_PACKAGE = { 'package.json': '{ "name": "shop", "type": "module", "private": true }\n' };
const TS_VERIFY = 'node --test tests/*.test.ts';
const tsHidden = (bug: string, regress: string): HiddenTests => ({
  files: { 'hidden/bug.test.ts': bug, 'hidden/regress.test.ts': regress },
  failToPass: 'node --test hidden/bug.test.ts',
  passToPass: 'node --test hidden/regress.test.ts',
});

// Real Python projects ignore bytecode. Without this, the verify command's __pycache__ would be committed with the
// fix, because the resolver commits with `git add -A` (a product gap, noted in evals/README.md).
const PY_PACKAGE = { '.gitignore': '__pycache__/\n', 'app/__init__.py': '', 'tests/__init__.py': '' };
const PY_VERIFY = 'python3 -m unittest discover -s tests -t .';
const pyHidden = (bug: string, regress: string): HiddenTests => ({
  files: { 'hidden/__init__.py': '', 'hidden/test_bug.py': bug, 'hidden/test_regress.py': regress },
  failToPass: 'python3 -m unittest hidden.test_bug',
  passToPass: 'python3 -m unittest hidden.test_regress',
});

interface Spec {
  id: string;
  why: string;
  lang: Lang;
  depth: Depth | null;
  expect: 'fix' | 'skip';
  files: Record<string, string>;
  event: (files: Record<string, string>) => NormalizedEvent;
  hidden: HiddenTests | null;
  reference: (files: Record<string, string>) => Record<string, string>;
  maxChangedLines?: number;
}

const make = (spec: Spec): FixCase => {
  const files = { ...(spec.lang === 'ts' ? TS_PACKAGE : PY_PACKAGE), ...spec.files };
  return {
    id: spec.id,
    why: spec.why,
    lang: spec.lang,
    depth: spec.depth,
    expect: spec.expect,
    files,
    verifyCommand: spec.lang === 'ts' ? TS_VERIFY : PY_VERIFY,
    event: spec.event(files),
    hidden: spec.hidden,
    reference: spec.reference(files),
    maxChangedLines: spec.maxChangedLines ?? 12,
  };
};

const nodeTest = (imports: string, body: string): string =>
  `import assert from 'node:assert/strict';\nimport { test } from 'node:test';\n${imports}\n\n${body}\n`;
const pyTest = (imports: string, body: string): string => `import unittest\n${imports}\n\n\nclass T(unittest.TestCase):\n${body}\n`;

/**
 * The dev set: 11 seeded bugs, 9 to fix and 2 where nothing in the repository should change. Prompts may be tuned on
 * these, so they are not the cases to publish a number from (the plan keeps a frozen test set for that).
 * Every case states its intent in the code (a doc comment or a default), so the right fix can be found from the issue
 * and the repository alone, and the hidden tests check that intent, not one way of writing it.
 */
export const FIX_CASES: readonly FixCase[] = [
  make({
    id: 'ts-guest-name-d0',
    why: 'A user without a profile crashes the greeting. The doc comment says such a user is shown as "Guest". Fix at the crash line.',
    lang: 'ts',
    depth: 'D0',
    expect: 'fix',
    files: {
      'src/users.ts': `export interface User {
  id: number;
  profile?: { displayName: string };
}

/** The name shown in the app. A user who has not set up a profile yet is shown as "Guest". */
export function displayName(user: User): string {
  return user.profile.displayName.trim();
}

export function greeting(user: User): string {
  return \`Hello, \${displayName(user)}!\`;
}
`,
      'src/server.ts': `import { greeting, type User } from './users.ts';

export function handleHome(user: User): { status: number; body: string } {
  return { status: 200, body: greeting(user) };
}
`,
      'tests/users.test.ts': nodeTest(
        "import { greeting } from '../src/users.ts';",
        "test('greets by display name', () => {\n  assert.equal(greeting({ id: 1, profile: { displayName: ' Sam ' } }), 'Hello, Sam!');\n});",
      ),
    },
    event: (f) =>
      thrown('javascript', 'TypeError', "Cannot read properties of undefined (reading 'displayName')", [
        frame(f, 'src/server.ts', 'handleHome', 'greeting(user)'),
        frame(f, 'src/users.ts', 'greeting', 'displayName(user)'),
        frame(f, 'src/users.ts', 'displayName', 'user.profile.displayName'),
      ]),
    hidden: tsHidden(
      nodeTest(
        "import { displayName, greeting } from '../src/users.ts';",
        "test('a user without a profile is a guest', () => {\n  assert.equal(displayName({ id: 2 }), 'Guest');\n  assert.equal(greeting({ id: 2 }), 'Hello, Guest!');\n});",
      ),
      nodeTest(
        "import { displayName } from '../src/users.ts';",
        "test('a profile name is still used and trimmed', () => {\n  assert.equal(displayName({ id: 1, profile: { displayName: ' Ana ' } }), 'Ana');\n});",
      ),
    ),
    reference: (f) => patch(f, 'src/users.ts', 'return user.profile.displayName.trim();', "return user.profile?.displayName.trim() ?? 'Guest';"),
  }),

  make({
    id: 'ts-loop-start-d1',
    why: 'The loop starts one past the end, so the crash line reads a missing order. The cause is the loop header one line up. Guarding the crash line with ?. pushes undefined and is wrong.',
    lang: 'ts',
    depth: 'D1',
    expect: 'fix',
    files: {
      'src/report.ts': `export interface Order {
  id: string;
  totalCents: number;
}

/** Order ids for the daily report, newest (last) first. */
export function orderIds(orders: Order[]): string[] {
  const ids: string[] = [];
  for (let i = orders.length; i >= 0; i--) {
    ids.push(orders[i].id);
  }
  return ids;
}

export function totalCents(orders: Order[]): number {
  return orders.reduce((sum, o) => sum + o.totalCents, 0);
}
`,
      'src/jobs.ts': `import { orderIds, totalCents, type Order } from './report.ts';

export function dailyReport(orders: Order[]): string {
  return \`\${orderIds(orders).join(',')} total=\${totalCents(orders)}\`;
}
`,
      'tests/report.test.ts': nodeTest(
        "import { totalCents } from '../src/report.ts';",
        "test('adds up totals', () => {\n  assert.equal(totalCents([{ id: 'a', totalCents: 150 }, { id: 'b', totalCents: 50 }]), 200);\n});",
      ),
    },
    event: (f) =>
      thrown('javascript', 'TypeError', "Cannot read properties of undefined (reading 'id')", [
        frame(f, 'src/jobs.ts', 'dailyReport', 'orderIds(orders)'),
        frame(f, 'src/report.ts', 'orderIds', 'ids.push(orders[i].id)'),
      ]),
    hidden: tsHidden(
      nodeTest(
        "import { orderIds } from '../src/report.ts';",
        "test('newest first, every order once', () => {\n  assert.deepEqual(orderIds([{ id: 'a', totalCents: 1 }, { id: 'b', totalCents: 2 }, { id: 'c', totalCents: 3 }]), ['c', 'b', 'a']);\n  assert.deepEqual(orderIds([]), []);\n});",
      ),
      nodeTest(
        "import { totalCents } from '../src/report.ts';",
        "test('totals unchanged', () => {\n  assert.equal(totalCents([{ id: 'a', totalCents: 5 }]), 5);\n  assert.equal(totalCents([]), 0);\n});",
      ),
    ),
    reference: (f) => patch(f, 'src/report.ts', 'let i = orders.length;', 'let i = orders.length - 1;'),
  }),

  make({
    id: 'ts-empty-settings-d0',
    why: 'An empty settings file throws in JSON.parse. The doc comment says empty means the defaults. Guard before parsing.',
    lang: 'ts',
    depth: 'D0',
    expect: 'fix',
    files: {
      'src/settings.ts': `export interface Settings {
  theme: string;
  pageSize: number;
}

export const DEFAULTS: Settings = { theme: 'light', pageSize: 20 };

/** Settings saved by the user. A file that is empty (or only whitespace) means the defaults. */
export function parseSettings(text: string): Settings {
  return { ...DEFAULTS, ...JSON.parse(text) };
}
`,
      'src/load.ts': `import { readFileSync } from 'node:fs';
import { parseSettings, type Settings } from './settings.ts';

export function loadSettings(path: string): Settings {
  return parseSettings(readFileSync(path, 'utf8'));
}
`,
      'tests/settings.test.ts': nodeTest(
        "import { parseSettings } from '../src/settings.ts';",
        "test('keeps saved values', () => {\n  assert.equal(parseSettings('{\"pageSize\": 50}').pageSize, 50);\n});",
      ),
    },
    event: (f) =>
      thrown('javascript', 'SyntaxError', 'Unexpected end of JSON input', [
        frame(f, 'src/load.ts', 'loadSettings', 'parseSettings(readFileSync'),
        frame(f, 'src/settings.ts', 'parseSettings', 'JSON.parse(text)'),
        lib('node:internal/json', 'JSON.parse', 1),
      ]),
    hidden: tsHidden(
      nodeTest(
        "import { DEFAULTS, parseSettings } from '../src/settings.ts';",
        "test('empty or blank file means defaults', () => {\n  assert.deepEqual(parseSettings(''), DEFAULTS);\n  assert.deepEqual(parseSettings('  \\n'), DEFAULTS);\n});",
      ),
      nodeTest(
        "import { parseSettings } from '../src/settings.ts';",
        "test('saved values still override defaults', () => {\n  assert.deepEqual(parseSettings('{\"theme\": \"dark\"}'), { theme: 'dark', pageSize: 20 });\n});",
      ),
    ),
    reference: (f) =>
      patch(
        f,
        'src/settings.ts',
        '  return { ...DEFAULTS, ...JSON.parse(text) };',
        '  if (!text.trim()) return { ...DEFAULTS };\n  return { ...DEFAULTS, ...JSON.parse(text) };',
      ),
  }),

  make({
    id: 'ts-wrong-column-d2',
    why: 'The receipt crashes on a missing name, but the cause is toOrder reading a column that does not exist (customer, not customer_name). Guarding the crash line prints "undefined" and is wrong.',
    lang: 'ts',
    depth: 'D2',
    expect: 'fix',
    files: {
      'src/orders.ts': `/** A row from the orders table. Columns: id, customer_name, total_cents. */
export type OrderRow = Record<string, any>;

export interface Order {
  id: string;
  customerName: string;
  totalCents: number;
}

export function toOrder(row: OrderRow): Order {
  return { id: row.id, customerName: row.customer, totalCents: row.total_cents };
}

export function formatCents(cents: number): string {
  return \`$\${(cents / 100).toFixed(2)}\`;
}

export function receiptLine(order: Order): string {
  return \`Order \${order.id} for \${order.customerName.trim()}: \${formatCents(order.totalCents)}\`;
}
`,
      'src/routes.ts': `import { receiptLine, toOrder, type OrderRow } from './orders.ts';

export function receipt(row: OrderRow): string {
  const order = toOrder(row);
  return receiptLine(order);
}
`,
      'tests/orders.test.ts': nodeTest(
        "import { formatCents } from '../src/orders.ts';",
        "test('formats cents', () => {\n  assert.equal(formatCents(1250), '$12.50');\n});",
      ),
    },
    event: (f) =>
      thrown('javascript', 'TypeError', "Cannot read properties of undefined (reading 'trim')", [
        frame(f, 'src/routes.ts', 'receipt', 'receiptLine(order)'),
        frame(f, 'src/orders.ts', 'receiptLine', 'order.customerName.trim()'),
      ]),
    hidden: tsHidden(
      nodeTest(
        "import { receiptLine, toOrder } from '../src/orders.ts';",
        "test('the receipt names the customer from the row', () => {\n  assert.equal(receiptLine(toOrder({ id: 'A1', customer_name: 'Sam', total_cents: 1250 })), 'Order A1 for Sam: $12.50');\n});",
      ),
      nodeTest(
        "import { receiptLine } from '../src/orders.ts';",
        "test('receipt of a built order is unchanged', () => {\n  assert.equal(receiptLine({ id: 'B2', customerName: ' Ana ', totalCents: 5 }), 'Order B2 for Ana: $0.05');\n});",
      ),
    ),
    reference: (f) => patch(f, 'src/orders.ts', 'customerName: row.customer,', 'customerName: row.customer_name,'),
  }),

  make({
    id: 'ts-missing-default-d3',
    why: 'The mailer crashes destructuring undefined mail settings. The cause is DEFAULTS in config.ts, a file the stack does not show, missing the documented localhost:25 mail server.',
    lang: 'ts',
    depth: 'D3',
    expect: 'fix',
    files: {
      'src/config.ts': `export interface MailSettings {
  host: string;
  port: number;
}

export interface Settings {
  port: number;
  mail: MailSettings;
}

/** Built-in values. Without MAIL_HOST set, mail goes to a local relay on localhost port 25. */
const DEFAULTS = { port: 3000 } as Settings;

export function loadSettings(env: Record<string, string | undefined> = process.env): Settings {
  return {
    port: Number(env.PORT ?? DEFAULTS.port),
    mail: env.MAIL_HOST ? { host: env.MAIL_HOST, port: Number(env.MAIL_PORT ?? 25) } : DEFAULTS.mail,
  };
}
`,
      'src/mailer.ts': `import { loadSettings } from './config.ts';

export function mailServerUrl(env: Record<string, string | undefined> = process.env): string {
  const { host, port } = loadSettings(env).mail;
  return \`smtp://\${host}:\${port}\`;
}
`,
      'src/signup.ts': `import { mailServerUrl } from './mailer.ts';

export function welcomeEmail(address: string): { to: string; via: string } {
  return { to: address, via: mailServerUrl() };
}
`,
      'tests/config.test.ts': nodeTest(
        "import { loadSettings } from '../src/config.ts';",
        "test('reads the port', () => {\n  assert.equal(loadSettings({ PORT: '8080' }).port, 8080);\n});",
      ),
    },
    event: (f) =>
      thrown('javascript', 'TypeError', "Cannot destructure property 'host' of '(intermediate value).mail' as it is undefined.", [
        frame(f, 'src/signup.ts', 'welcomeEmail', 'mailServerUrl()'),
        frame(f, 'src/mailer.ts', 'mailServerUrl', 'const { host, port }'),
      ]),
    hidden: tsHidden(
      nodeTest(
        "import { mailServerUrl } from '../src/mailer.ts';",
        "test('no MAIL_HOST means the local relay', () => {\n  assert.equal(mailServerUrl({}), 'smtp://localhost:25');\n});",
      ),
      nodeTest(
        "import { mailServerUrl } from '../src/mailer.ts';\nimport { loadSettings } from '../src/config.ts';",
        "test('a configured server still wins', () => {\n  assert.equal(mailServerUrl({ MAIL_HOST: 'mx.example.com', MAIL_PORT: '587' }), 'smtp://mx.example.com:587');\n  assert.equal(loadSettings({}).port, 3000);\n});",
      ),
    ),
    reference: (f) =>
      patch(
        f,
        'src/config.ts',
        'const DEFAULTS = { port: 3000 } as Settings;',
        "const DEFAULTS: Settings = { port: 3000, mail: { host: 'localhost', port: 25 } };",
      ),
  }),

  make({
    id: 'ts-db-refused-skip',
    why: 'The database refused the connection. That is the server or network, not this code; adding a try/catch would only hide it. Nothing should change.',
    lang: 'ts',
    depth: null,
    expect: 'skip',
    files: {
      'src/db.ts': `import { connect } from 'node:net';

export interface DbOptions {
  host: string;
  port: number;
}

/** Opens a connection to the database and resolves once it is up. Errors go to the caller. */
export function openConnection({ host, port }: DbOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port }, () => resolve());
    socket.on('error', reject);
  });
}
`,
      'src/health.ts': `import { openConnection } from './db.ts';

export async function healthCheck(): Promise<string> {
  await openConnection({ host: process.env.DB_HOST ?? '10.0.3.7', port: 5432 });
  return 'ok';
}
`,
      'tests/db.test.ts': nodeTest(
        "import { openConnection } from '../src/db.ts';",
        "test('exports a connector', () => {\n  assert.equal(typeof openConnection, 'function');\n});",
      ),
    },
    event: (f) =>
      thrown('javascript', 'Error', 'connect ECONNREFUSED 10.0.3.7:5432', [
        frame(f, 'src/health.ts', 'healthCheck', 'await openConnection'),
        frame(f, 'src/db.ts', 'openConnection', "socket.on('error', reject)"),
        lib('node:net', 'TCPConnectWrap.afterConnect [as oncomplete]', 1607),
      ]),
    hidden: null,
    reference: () => ({}),
  }),

  make({
    id: 'py-optional-nickname-d0',
    why: 'An optional form field is read with []. The docstring says to fall back to the first name. Fix at the crash line.',
    lang: 'py',
    depth: 'D0',
    expect: 'fix',
    files: {
      'app/signup.py': `def welcome_subject(form):
    """Subject line for the welcome email. The nickname field is optional; without it, use the first name."""
    return f"Welcome, {form['nickname']}!"


def welcome_to(form):
    return form["email"].strip().lower()
`,
      'app/views.py': `from app.signup import welcome_subject, welcome_to


def send_welcome(form):
    return {"to": welcome_to(form), "subject": welcome_subject(form)}
`,
      'tests/test_signup.py': pyTest(
        'from app.signup import welcome_to',
        '    def test_address(self):\n        self.assertEqual(welcome_to({"email": " A@B.io "}), "a@b.io")',
      ),
    },
    event: (f) =>
      thrown('python', 'KeyError', "'nickname'", [
        frame(f, 'app/views.py', 'send_welcome', 'welcome_subject(form)'),
        frame(f, 'app/signup.py', 'welcome_subject', "form['nickname']"),
      ]),
    hidden: pyHidden(
      pyTest(
        'from app.signup import welcome_subject',
        '    def test_no_nickname(self):\n        self.assertEqual(welcome_subject({"first_name": "Ana", "email": "a@b.io"}), "Welcome, Ana!")',
      ),
      pyTest(
        'from app.signup import welcome_subject',
        '    def test_nickname(self):\n        self.assertEqual(welcome_subject({"first_name": "Ana", "nickname": "Annie"}), "Welcome, Annie!")',
      ),
    ),
    reference: (f) => patch(f, 'app/signup.py', "{form['nickname']}", "{form.get('nickname') or form['first_name']}"),
  }),

  make({
    id: 'py-missing-unit-d1',
    why: 'The crash line looks up a unit the table above it lacks ("s"). The fix is the table, two lines up. Using .get(unit, 0) stops the crash but returns wrong totals.',
    lang: 'py',
    depth: 'D1',
    expect: 'fix',
    files: {
      'app/durations.py': `import re


def parse_duration(text):
    """Seconds in a duration like "1h30m", "45m" or "20s". Hours, minutes and seconds can be combined."""
    units = {"h": 3600, "m": 60}
    total = 0
    for value, unit in re.findall(r"(\\d+)([hms])", text):
        total += int(value) * units[unit]
    return total


def format_duration(seconds):
    return f"{seconds // 60}m{seconds % 60:02d}s"
`,
      'app/timer.py': `from app.durations import parse_duration


def start_timer(raw):
    return {"seconds": parse_duration(raw)}
`,
      'tests/test_durations.py': pyTest(
        'from app.durations import format_duration',
        '    def test_format(self):\n        self.assertEqual(format_duration(125), "2m05s")',
      ),
    },
    event: (f) =>
      thrown('python', 'KeyError', "'s'", [
        frame(f, 'app/timer.py', 'start_timer', 'parse_duration(raw)'),
        frame(f, 'app/durations.py', 'parse_duration', 'units[unit]'),
      ]),
    hidden: pyHidden(
      pyTest(
        'from app.durations import parse_duration',
        '    def test_seconds(self):\n        self.assertEqual(parse_duration("20s"), 20)\n        self.assertEqual(parse_duration("1m20s"), 80)',
      ),
      pyTest(
        'from app.durations import parse_duration',
        '    def test_hours_minutes(self):\n        self.assertEqual(parse_duration("1h30m"), 5400)\n        self.assertEqual(parse_duration("45m"), 2700)',
      ),
    ),
    reference: (f) => patch(f, 'app/durations.py', 'units = {"h": 3600, "m": 60}', 'units = {"h": 3600, "m": 60, "s": 1}'),
  }),

  make({
    id: 'py-qty-string-d2',
    why: 'line_total multiplies a string by a float. The cause is parse_line, which the docstring says returns qty as an int but leaves it a string. The hidden test checks parse_line too.',
    lang: 'py',
    depth: 'D2',
    expect: 'fix',
    files: {
      'app/cart.py': `def parse_line(raw):
    """One cart line from the order form, as {"sku": str, "qty": int, "price": float}."""
    return {"sku": raw["sku"], "qty": raw["qty"], "price": float(raw["price"])}


def line_total(line):
    return round(line["qty"] * line["price"], 2)


def cart_total(lines):
    return round(sum(line_total(line) for line in lines), 2)
`,
      'app/checkout.py': `from app.cart import cart_total, parse_line


def checkout(form_lines):
    lines = [parse_line(raw) for raw in form_lines]
    return {"total": cart_total(lines)}
`,
      'tests/test_cart.py': pyTest(
        'from app.cart import line_total',
        '    def test_line_total(self):\n        self.assertEqual(line_total({"sku": "A", "qty": 2, "price": 1.25}), 2.5)',
      ),
    },
    event: (f) =>
      thrown('python', 'TypeError', "can't multiply sequence by non-int of type 'float'", [
        frame(f, 'app/checkout.py', 'checkout', 'cart_total(lines)'),
        frame(f, 'app/cart.py', 'cart_total', 'sum(line_total(line)'),
        frame(f, 'app/cart.py', 'line_total', 'line["qty"] * line["price"]'),
      ]),
    hidden: pyHidden(
      pyTest(
        'from app.cart import cart_total, parse_line',
        '    def test_form_quantity(self):\n        line = parse_line({"sku": "A", "qty": "3", "price": "2.50"})\n        self.assertEqual(line["qty"], 3)\n        self.assertEqual(cart_total([line]), 7.5)',
      ),
      pyTest(
        'from app.cart import cart_total',
        '    def test_built_lines(self):\n        self.assertEqual(cart_total([{"sku": "A", "qty": 2, "price": 1.25}, {"sku": "B", "qty": 1, "price": 0.5}]), 3.0)',
      ),
    ),
    reference: (f) => patch(f, 'app/cart.py', '"qty": raw["qty"]', '"qty": int(raw["qty"])'),
  }),

  make({
    id: 'py-old-saved-data-d4',
    why: 'Prefs saved by version 1 keep tags as one comma string; add_tag then calls append on a str. The cause is data on disk, and the fix belongs in load_prefs (the docstring describes both versions).',
    lang: 'py',
    depth: 'D4',
    expect: 'fix',
    maxChangedLines: 16,
    files: {
      'app/prefs.py': `def load_prefs(saved):
    """Preferences read back from disk.

    Version 1 stored tags as one comma-separated string ("a,b"); version 2 stores a list (["a", "b"]).
    Both versions are still on users' machines.
    """
    return {"version": 2, "tags": saved.get("tags", [])}


def add_tag(prefs, tag):
    if tag not in prefs["tags"]:
        prefs["tags"].append(tag)
    return prefs
`,
      'app/api.py': `from app.prefs import add_tag, load_prefs


def tag_item(saved, tag):
    prefs = load_prefs(saved)
    return add_tag(prefs, tag)
`,
      'tests/test_prefs.py': pyTest(
        'from app.prefs import add_tag',
        '    def test_add(self):\n        self.assertEqual(add_tag({"tags": ["a"]}, "b")["tags"], ["a", "b"])',
      ),
    },
    event: (f) =>
      thrown('python', 'AttributeError', "'str' object has no attribute 'append'", [
        frame(f, 'app/api.py', 'tag_item', 'add_tag(prefs, tag)'),
        frame(f, 'app/prefs.py', 'add_tag', '.append(tag)'),
      ]),
    hidden: pyHidden(
      pyTest(
        'from app.prefs import add_tag, load_prefs',
        '    def test_version_1(self):\n        prefs = load_prefs({"version": 1, "tags": "a,b"})\n        self.assertEqual(prefs["tags"], ["a", "b"])\n        self.assertEqual(add_tag(prefs, "c")["tags"], ["a", "b", "c"])',
      ),
      pyTest(
        'from app.prefs import add_tag, load_prefs',
        '    def test_version_2(self):\n        prefs = load_prefs({"version": 2, "tags": ["a"]})\n        self.assertEqual(add_tag(prefs, "a")["tags"], ["a"])\n        self.assertEqual(load_prefs({})["tags"], [])',
      ),
    ),
    reference: (f) =>
      patch(
        f,
        'app/prefs.py',
        '    return {"version": 2, "tags": saved.get("tags", [])}',
        '    tags = saved.get("tags", [])\n    if isinstance(tags, str):\n        tags = [t for t in tags.split(",") if t]\n    return {"version": 2, "tags": tags}',
      ),
  }),

  make({
    id: 'py-cert-expired-skip',
    why: "The payment provider's certificate failed to verify inside the HTTP library. That is the remote server or the machine's trust store; turning off verification would be a security hole. Nothing should change.",
    lang: 'py',
    depth: null,
    expect: 'skip',
    files: {
      'app/payments.py': `import urllib.request

API = "https://api.pay.example.com/v1/charges"


def create_charge(amount_cents, token, opener=urllib.request.urlopen):
    """Charges a card. The provider must be reached over verified HTTPS."""
    request = urllib.request.Request(API, data=f"amount={amount_cents}&token={token}".encode(), method="POST")
    with opener(request, timeout=10) as response:
        return response.status
`,
      'tests/test_payments.py': pyTest(
        'from app.payments import create_charge',
        '    def test_posts(self):\n        class R:\n            status = 201\n            def __enter__(self): return self\n            def __exit__(self, *a): return False\n        self.assertEqual(create_charge(100, "t", opener=lambda req, timeout: R()), 201)',
      ),
    },
    event: (f) =>
      thrown('python', 'URLError', '<urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: certificate has expired (_ssl.c:1006)>', [
        frame(f, 'app/payments.py', 'create_charge', 'with opener(request'),
        lib('/usr/lib/python3.12/urllib/request.py', 'urlopen', 215),
        lib('/usr/lib/python3.12/urllib/request.py', 'do_open', 1347),
      ]),
    hidden: null,
    reference: () => ({}),
  }),
];
