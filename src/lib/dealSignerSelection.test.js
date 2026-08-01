/**
 * Unit tests for deal-scoped signer selection.
 * Run: node --test src/lib/dealSignerSelection.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveIncludedSignerIdsFromStages,
  filterByIncludedSignerIds,
} from './dealSignerSelection.js';

describe('resolveIncludedSignerIdsFromStages', () => {
  it('returns null when no stage has a non-empty includedSignerIds', () => {
    assert.equal(resolveIncludedSignerIdsFromStages([]), null);
    assert.equal(resolveIncludedSignerIdsFromStages([{ label: 'App', includedSignerIds: [] }]), null);
    assert.equal(resolveIncludedSignerIdsFromStages([{ label: 'App' }]), null);
  });

  it('prefers non-__auto_track__ stage over auto-track', () => {
    const ids = resolveIncludedSignerIdsFromStages([
      { label: '__auto_track__', includedSignerIds: ['a', 'b'] },
      { label: 'Wave 1', includedSignerIds: ['c'] },
    ]);
    assert.deepEqual(ids, ['c']);
  });

  it('falls back to auto-track when it is the only selection', () => {
    const ids = resolveIncludedSignerIdsFromStages([
      { label: '__auto_track__', includedSignerIds: ['a', 'b'] },
    ]);
    assert.deepEqual(ids, ['a', 'b']);
  });

  it('stringifies ids', () => {
    const ids = resolveIncludedSignerIdsFromStages([
      { label: 'App', includedSignerIds: [123, '456'] },
    ]);
    assert.deepEqual(ids, ['123', '456']);
  });
});

describe('filterByIncludedSignerIds', () => {
  const roster = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }, { id: 3, name: 'C' }];

  it('returns all when includedIds is null or empty', () => {
    assert.deepEqual(filterByIncludedSignerIds(roster, null), roster);
    assert.deepEqual(filterByIncludedSignerIds(roster, []), roster);
  });

  it('keeps only matching signer ids', () => {
    assert.deepEqual(
      filterByIncludedSignerIds(roster, ['2', '3']),
      [{ id: '2', name: 'B' }, { id: 3, name: 'C' }],
    );
  });
});
