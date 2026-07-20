/**
 * node src/lib/deploymentChecklistCatalog.test.js
 */
import {
  DEPLOYMENT_CATALOG,
  PHASES,
  merchantPackItems,
} from './deploymentChecklistCatalog.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('ok:', msg);
  }
}

assert(DEPLOYMENT_CATALOG.length >= 180, `catalog count >= 180 (got ${DEPLOYMENT_CATALOG.length})`);

const pack = merchantPackItems();
assert(pack.length >= 15 && pack.length <= 40, `merchant pack length 15-40 (got ${pack.length})`);

const hoursItem = DEPLOYMENT_CATALOG.find(
  (i) => i.phase === 'pre_installation' && /hour/i.test(`${i.key} ${i.title}`),
);
assert(!!hoursItem, `pre_installation has confirm/verify hours item (found ${hoursItem?.key || 'none'})`);

assert(PHASES.length === 15, `PHASES has 14 + airport_enterprise (got ${PHASES.length})`);
assert(PHASES.some((p) => p.id === 'airport_enterprise'), 'PHASES includes airport_enterprise');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');