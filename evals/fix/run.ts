import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { LlmGateway } from '../../server/llm/index.ts';
import { describeProfile, gatewayFor, loadProfiles } from '../core/profiles.ts';
import { scriptedAgents } from './agents.ts';
import { FIX_CASES } from './cases.ts';
import { summariseFix } from './metrics.ts';
import { renderFixReport } from './report.ts';
import { FixRunner, type FixAgent } from './runner.ts';
import { validateCase } from './validate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'oracle' },
    trials: { type: 'string', default: '1' },
    out: { type: 'string' },
    gate: { type: 'boolean', default: false },
    only: { type: 'string' },
    'max-turns': { type: 'string' },
  },
});

/** Scripted agents that need no model: `oracle` must resolve everything, `skip-all` only the should-skip cases. A dry run of the harness. */
const SCRIPTED: Record<string, () => FixAgent> = { oracle: () => scriptedAgents.oracle(FIX_CASES), 'skip-all': () => scriptedAgents.skipAll() };
const NO_MODEL: LlmGateway = {
  isAvailable: () => false,
  clientFor: () => ({
    chat: async () => {
      throw new Error('a scripted run has no model');
    },
  }),
  run: async () => {
    throw new Error('a scripted run has no model');
  },
};

const name = values.model as string;
const profiles = loadProfiles(join(root, 'evals/models.json'));
const spec = profiles[name];
if (!SCRIPTED[name] && (!spec || spec.kind === 'rules')) {
  throw new Error(
    `Unknown fix profile "${name}". Use a model from models.json (${Object.keys(profiles)
      .filter((p) => p !== 'rules')
      .join(', ')}) or ${Object.keys(SCRIPTED).join(', ')}`,
  );
}
const label = SCRIPTED[name] ? `${name} (scripted, no model)` : describeProfile(name, spec!);
const llm = SCRIPTED[name] ? NO_MODEL : gatewayFor(spec!);
const runner = SCRIPTED[name] ? new FixRunner(llm, SCRIPTED[name]()) : new FixRunner(llm);

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const leftOut: string[] = [];
let cases = values.only ? FIX_CASES.filter((c) => (values.only as string).split(',').includes(c.id)) : [...FIX_CASES];
if (!hasPython) {
  const py = cases.filter((c) => c.lang === 'py').map((c) => c.id);
  if (py.length) leftOut.push(`${py.length} Python cases (no python3 on this machine)`);
  cases = cases.filter((c) => c.lang !== 'py');
}

// A broken case measures the case, not the model, so the run stops before any model time is spent.
const problems = (await Promise.all(cases.map(validateCase))).flat();
if (problems.length) {
  for (const p of problems) console.error(`  case ${p.caseId}: ${p.problem}`);
  throw new Error(`${problems.length} case problem(s); fix the cases before running`);
}

const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();
const date = new Date().toISOString().slice(0, 10);
const dir = resolve(root, values.out ?? join('evals/results', `${date}-fix-${name}`));
const logDir = join(dir, 'logs');
mkdirSync(logDir, { recursive: true });
const trials = Math.max(1, Number(values.trials) || 1);

console.log(`Fix eval: ${label}, ${cases.length} cases x ${trials} trial(s). All cases checked.`);
const records = await runner.run(cases, {
  trials,
  logDir,
  ...(values['max-turns'] ? { maxAgentTurns: Number(values['max-turns']) } : {}),
  onTrial: (r) =>
    console.log(
      `  ${r.caseId} #${r.trial}: ${
        r.resolved
          ? 'resolved'
          : `miss (${r.grades
              .filter((g) => !g.passed)
              .map((g) => g.grader)
              .join(', ')})`
      }, ${r.outcome.kind}, ${(r.ms / 1000).toFixed(1)} s`,
    ),
});
for (const r of records) if (r.logFile) r.logFile = relative(dir, r.logFile);
const summary = summariseFix(cases, records);
const report = renderFixReport({ profile: label, date, commit, leftOut }, summary, cases, records);
writeFileSync(join(dir, 'report.md'), report);
writeFileSync(join(dir, 'raw.json'), `${JSON.stringify({ profile: name, spec: spec ?? null, date, commit, leftOut, summary, records }, null, 2)}\n`);
console.log(`\n${report}\nWritten to ${dir}`);

if (values.gate && (summary.harmfulFixes.length > 0 || summary.unsafe.length > 0)) {
  console.error(`GATE FAILED: ${summary.harmfulFixes.length} harmful fix(es), ${summary.unsafe.length} unsafe attempt(s).`);
  process.exit(1);
}
