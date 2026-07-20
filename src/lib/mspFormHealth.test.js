/**
 * Unit tests for MSP form health helpers.
 * Run: node --test src/lib/mspFormHealth.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectMspStatusErrors,
  countMspStatusErrors,
  mspFormNeedsAgentFix,
  summarizeMspHealth,
} from './mspFormHealth.js';

describe('mspFormHealth', () => {
  it('treats 62% complete as needing agent fix even with empty error arrays', () => {
    assert.equal(mspFormNeedsAgentFix({ percent_complete: 62, completion_errors: [], data_errors: [] }), true);
  });

  it('treats -1% as needing agent fix', () => {
    assert.equal(mspFormNeedsAgentFix({ percent_complete: -1 }), true);
  });

  it('treats 100% with no errors as OK', () => {
    assert.equal(mspFormNeedsAgentFix({ percent_complete: 100, completion_errors: [], data_errors: [] }), false);
  });

  it('counts nested validation.errors.data via rawForm', () => {
    const n = countMspStatusErrors({
      percent_complete: 62,
      rawForm: {
        validation: {
          errors: {
            data: [{ key: 'business_state_usa', errors: 'California is not a valid option.' }],
          },
        },
      },
    });
    assert.equal(n, 1);
  });

  it('counts top-level data_errors from getMSPFormStatus flatten', () => {
    const errs = collectMspStatusErrors({
      data_errors: [{ key: 'business_state_usa', errors: 'California is not a valid option.' }],
    });
    assert.equal(errs.length, 1);
  });

  it('summarizeMspHealth flags incomplete', () => {
    const s = summarizeMspHealth([{ percent_complete: 62 }, { percent_complete: 100 }]);
    assert.equal(s.incomplete, true);
    assert.equal(s.worstPct, 62);
  });
});
