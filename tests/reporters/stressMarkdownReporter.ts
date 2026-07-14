import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import fs from 'node:fs';
import path from 'node:path';
import { getScenarioResults } from '../helpers/reportStore';

class StressMarkdownReporter implements Reporter {
  private startedAt = new Date();

  onBegin(_config: FullConfig, _suite: Suite) {
    this.startedAt = new Date();
  }

  onTestEnd(_test: TestCase, _result: TestResult) {
    // Scenario details come from reportStore (explicit recordScenario calls).
  }

  onEnd(result: FullResult) {
    const scenarios = getScenarioResults();
    const outPath = path.resolve(process.cwd(), 'stress-test-report.md');
    const pass = scenarios.filter((s) => s.status === 'PASS').length;
    const fail = scenarios.filter((s) => s.status === 'FAIL').length;
    const warn = scenarios.filter((s) => s.status === 'WARN').length;

    const lines: string[] = [];
    lines.push('# Onboarding Portal Stress Test Report');
    lines.push('');
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push(`**Suite started:** ${this.startedAt.toISOString()}`);
    lines.push(`**Playwright status:** ${result.status}`);
    lines.push(`**Mode:** Safe in-memory simulation mirroring production function behavior (no live MSPWare / HubSpot calls).`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|------:|`);
    lines.push(`| Scenarios recorded | ${scenarios.length} |`);
    lines.push(`| PASS | ${pass} |`);
    lines.push(`| FAIL | ${fail} |`);
    lines.push(`| WARN | ${warn} |`);
    lines.push('');
    lines.push('> **PASS** = desired safety/validation behavior is present.  ');
    lines.push('> **FAIL** = production behavior allows a silent default, missing gate, or stale draft.  ');
    lines.push('> **WARN** = exploratory matrix / partial gap (documented, not a hard blocker).');
    lines.push('');

    for (const s of scenarios) {
      lines.push(`## ${s.name}`);
      lines.push('');
      lines.push(`**Status:** \`${s.status}\``);
      lines.push('');
      lines.push('### Observed behavior');
      lines.push('');
      lines.push(s.observed);
      lines.push('');
      lines.push('### Database / draft state');
      lines.push('');
      lines.push(s.dbState);
      lines.push('');
      if (s.details) {
        lines.push('### Details');
        lines.push('');
        lines.push(s.details);
        lines.push('');
      }
      if (s.matrix?.length) {
        lines.push('### State × MCC matrix');
        lines.push('');
        lines.push('| State | MCC | Portal outcome | Desired outcome |');
        lines.push('|------:|----:|----------------|-----------------|');
        for (const row of s.matrix) {
          lines.push(`| ${row.state} | ${row.mcc} | ${row.portalOutcome} | ${row.desiredOutcome} |`);
        }
        lines.push('');
      }
      if (s.citations.length) {
        lines.push('### File / line references');
        lines.push('');
        for (const c of s.citations) {
          const snip = c.snippet ? ` — \`${c.snippet}\`` : '';
          lines.push(`- \`${c.file}:${c.line}\`${snip}`);
        }
        lines.push('');
      }
    }

    lines.push('## Recommended fixes (from FAIL/WARN)');
    lines.push('');
    lines.push('1. ~~Refuse empty MCC before draft creation~~ — **done 2026-07-13** (`manageMerchantID` defers `submitToMSP` until MCC is set).');
    lines.push('2. ~~Remove silent `5999` fallback~~ — **done 2026-07-13** (`submitToMSP` / `signApplication` / `refillMSPForms` throw; portal dropdown removed).');
    lines.push('3. ~~Re-fill MSPWare draft on MCC change~~ — **done 2026-07-13** (`manageMerchantID` update re-invokes `submitToMSP`).');
    lines.push('4. **Add state × MCC underwriting rules** (at least CA/NY + 5813 liquor) with inline UI warnings on location state change — still open.');
    lines.push('5. Keep HubSpot bypass for slug `corporateId` (already working).');
    lines.push('');
    lines.push('---');
    lines.push('*Report written by `tests/reporters/stressMarkdownReporter.ts`.*');
    lines.push('');

    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`\n[stress-reporter] Wrote ${outPath}\n`);
  }
}

export default StressMarkdownReporter;
