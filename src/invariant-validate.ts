// Composition root for invariant validation. Wires per-package checks into the runner.
// Runs as compiled ESM (dist/invariant-validate.js) — no ts-node loader (Node 24 safe).
import { registerCheck, runAll, type CheckResult } from '@genesis/invariant-runner';
import { dataLayerChecks } from '@genesis/data-layer';
import { featureStoreChecks } from '@genesis/feature-store';
import { eventEngineChecks } from '@genesis/event-engine';
import { replayEngineChecks } from '@genesis/replay-engine';
import { researchChecks } from '@genesis/research-platform';
import { riskChecks } from '@genesis/risk-engine';
import { portfolioChecks } from '@genesis/portfolio-engine';
import { productionChecks } from '@genesis/production-engine';
import { aiLayerChecks } from '@genesis/ai-layer';
import { presentationChecks } from '@genesis/runtime';
import { signalChecks } from '@genesis/signal-engine';
import { strategyChecks } from '@genesis/strategy-engine';
import { decisionChecks } from '@genesis/decision-engine';

type CheckEntry = { id: string; fn: () => CheckResult | Promise<CheckResult> };

const groups: Array<[string, ReadonlyArray<CheckEntry>]> = [
  ['data-layer', dataLayerChecks],
  ['feature-store', featureStoreChecks],
  ['event-engine', eventEngineChecks],
  ['replay-engine', replayEngineChecks],
  ['research-platform', researchChecks],
  ['risk-engine', riskChecks],
  ['portfolio-engine', portfolioChecks],
  ['production-engine', productionChecks],
  ['ai-layer', aiLayerChecks],
  ['runtime', presentationChecks],
  ['signal-engine', signalChecks],
  ['strategy-engine', strategyChecks],
  ['decision-engine', decisionChecks],
];

// Defensive load: if a package export failed to resolve (e.g. a broken module namespace),
// the array is undefined/non-iterable. Report exactly which package, instead of a cryptic
// "[Object: null prototype]" spread error.
let registered = 0;
for (const [pkg, arr] of groups) {
  if (!Array.isArray(arr)) {
    console.error(
      `[invariant-validate] FATAL: package '${pkg}' did not export an iterable checks array ` +
        `(received ${Object.prototype.toString.call(arr)}). Its build or export is broken.`,
    );
    process.exit(2);
  }
  for (const c of arr) {
    registerCheck(c.id, c.fn);
    registered += 1;
  }
}

const report = await runAll();
const failed = report.results.filter((r) => r.status === 'fail');
const notImplemented = report.results.filter((r) => r.status === 'not-implemented');

console.log(
  `[invariant-validate] registered ${registered} checks across ${groups.length} packages.`,
);
console.log(
  `[invariant-validate] ${report.implemented}/${report.total} invariants have checks; ` +
    `${failed.length} failing, ${notImplemented.length} not-implemented.`,
);

if (failed.length > 0) {
  console.error('\n[invariant-validate] FAILURES:');
  for (const f of failed) {
    console.error(`  ✖ ${f.id}: ${f.detail ?? '(no detail provided)'}`);
  }
  console.error('');
}

process.exit(failed.length > 0 ? 1 : 0);
