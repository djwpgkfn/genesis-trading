import { runAll } from './runner.js';

// CI entrypoint. S0: 0 checks implemented => reports coverage, exits 0.
// A 'fail' result exits 1 (fails CI). Wired with real checks in later stages.
const report = await runAll();
const failed = report.results.filter((r) => r.status === 'fail');
console.log(
  `[invariant-runner] ${report.implemented}/${report.total} invariants have checks; ` +
    `${failed.length} failing.`,
);
for (const f of failed) console.error(`  FAIL ${f.id}: ${f.detail ?? ''}`);
process.exit(failed.length > 0 ? 1 : 0);
