import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { modelTriager, rulesTriage, type Triager } from '../../server/workflows/errors/triage.ts';
import { describeProfile, gatewayFor, loadProfiles } from '../core/profiles.ts';
import { TRIAGE_CASES } from './cases.ts';
import { summarise } from './metrics.ts';
import { renderReport } from './report.ts';
import { TriageRunner } from './runner.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'rules' },
    trials: { type: 'string', default: '1' },
    out: { type: 'string' },
    gate: { type: 'boolean', default: false },
    only: { type: 'string' },
  },
});

const profiles = loadProfiles(join(root, 'evals/models.json'));
const name = values.model as string;
const spec = profiles[name];
if (!spec) throw new Error(`Unknown model profile "${name}". Known: ${Object.keys(profiles).join(', ')}`);
const trials = Math.max(1, Number(values.trials) || 1);
const triager: Triager = spec.kind === 'rules' ? async (event) => rulesTriage(event) : modelTriager(gatewayFor(spec));

const cases = values.only ? TRIAGE_CASES.filter((c) => (values.only as string).split(',').includes(c.id)) : TRIAGE_CASES;
const commit = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();
const date = new Date().toISOString().slice(0, 10);

console.log(`Triage eval: ${describeProfile(name, spec)}, ${cases.length} cases x ${trials} trial(s)`);
const records = await new TriageRunner(triager).run(cases, {
  trials,
  onTrial: (r) =>
    console.log(
      `  ${r.caseId} #${r.trial}: ${
        r.error
          ? `ERROR ${r.error}`
          : r.grades.every((g) => g.passed)
            ? 'ok'
            : `miss (${r.grades
                .filter((g) => !g.passed)
                .map((g) => g.grader)
                .join(', ')})`
      }`,
    ),
});
const summary = summarise(cases, records);
const report = renderReport({ profile: describeProfile(name, spec), date, commit }, summary, cases, records);

const dir = resolve(root, values.out ?? join('evals/results', `${date}-triage-${name}`));
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'report.md'), report);
writeFileSync(join(dir, 'raw.json'), `${JSON.stringify({ profile: name, spec, date, commit, summary, records }, null, 2)}\n`);
console.log(`\n${report}\nWritten to ${dir}`);

if (values.gate && summary.dangerousDismissals.length > 0) {
  console.error(`GATE FAILED: ${summary.dangerousDismissals.length} real failure(s) were hidden.`);
  process.exit(1);
}
