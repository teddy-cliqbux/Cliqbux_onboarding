/**
 * Deal-desk: incomplete MSP forms must be stuck (Open to fix), not nudge (Remind).
 * Run: node --test src/lib/applicationRowMode.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApplicationRowMode } from './applicationRowMode.js';

describe('resolveApplicationRowMode — signing vs form incomplete', () => {
  const base = {
    profile: { applicationStatus: 'Incomplete', portalLockStatus: 'signing' },
    track: {
      prefilledData: {
        lastSeenAt: new Date().toISOString(),
        activity: { merchantOpens: 2 },
      },
    },
    pipeline: {
      currentStep: 'verification',
      completedSteps: { locations: true, banking: true },
      appStatus: 'Incomplete',
    },
  };

  it('Trisha case: form incomplete + signing lock → stuck (Open to fix), not Remind', () => {
    const r = resolveApplicationRowMode({
      ...base,
      mspErrorCount: 0,
      formIncomplete: true,
      detailLoaded: true,
    });
    assert.equal(r.mode, 'stuck');
    assert.match(String(r.blocker || r.reason), /incomplete|fix|help/i);
  });

  it('signing lock + 100% form + no errors → nudge (Remind)', () => {
    const r = resolveApplicationRowMode({
      ...base,
      mspErrorCount: 0,
      formIncomplete: false,
      detailLoaded: true,
    });
    assert.equal(r.mode, 'nudge');
  });

  it('MSP error count alone → stuck', () => {
    const r = resolveApplicationRowMode({
      ...base,
      mspErrorCount: 3,
      formIncomplete: false,
      detailLoaded: true,
    });
    assert.equal(r.mode, 'stuck');
  });

  it('form incomplete without merchant opens still stuck when detail loaded', () => {
    const r = resolveApplicationRowMode({
      profile: { applicationStatus: 'Incomplete', portalLockStatus: 'signing' },
      track: { prefilledData: {} },
      pipeline: {
        currentStep: 'verification',
        completedSteps: { locations: true, banking: true },
        appStatus: 'Incomplete',
      },
      mspErrorCount: 0,
      formIncomplete: true,
      detailLoaded: true,
    });
    assert.equal(r.mode, 'stuck');
  });
});
