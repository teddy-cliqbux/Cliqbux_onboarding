/**
 * Run: node --test src/lib/applicationRowCta.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  midsNeedProcessorSubmit,
  shouldShowProcessorSubmit,
  shouldShowOpenToPrep,
} from './applicationRowCta.js';

describe('midsNeedProcessorSubmit', () => {
  it('false when empty (do not invent submit need)', () => {
    assert.equal(midsNeedProcessorSubmit([]), false);
    assert.equal(midsNeedProcessorSubmit(null), false);
  });

  it('false when all visible MIDs are boarded', () => {
    assert.equal(
      midsNeedProcessorSubmit([
        { applicationStepStatus: 'Pending MID' },
        { applicationStepStatus: 'Active', elavonMID: '1' },
      ]),
      false,
    );
  });

  it('true when any visible MID is not boarded', () => {
    assert.equal(
      midsNeedProcessorSubmit([
        { applicationStepStatus: 'Pending MID' },
        { applicationStepStatus: 'Ready to Submit' },
      ]),
      true,
    );
  });
});

describe('shouldShowProcessorSubmit', () => {
  it('hides Submit for underwriting when all MIDs boarded (even before health)', () => {
    assert.equal(
      shouldShowProcessorSubmit({
        isSubmitted: true,
        visibleMids: [{ applicationStepStatus: 'Pending MID' }],
      }),
      false,
    );
  });

  it('shows Submit when signed and a MID still needs processor', () => {
    assert.equal(
      shouldShowProcessorSubmit({
        needsSubmitAfterSign: true,
        visibleMids: [{ applicationStepStatus: 'In Review' }],
      }),
      true,
    );
  });
});

describe('shouldShowOpenToPrep', () => {
  it('hides Open to prep when agreement signed (Submit primary)', () => {
    assert.equal(
      shouldShowOpenToPrep({ mode: 'nudge', needsSubmitAfterSign: true }),
      false,
    );
  });

  it('shows Open to prep in prep / nudge before sign', () => {
    assert.equal(shouldShowOpenToPrep({ mode: 'prep' }), true);
    assert.equal(shouldShowOpenToPrep({ mode: 'nudge', needsSubmitAfterSign: false }), true);
  });
});