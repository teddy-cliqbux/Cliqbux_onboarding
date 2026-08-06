/**
 * Unit tests for deal-scoped MID selection.
 * Run: node --test src/lib/dealMidSelection.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDealMidScopeFromStages,
  filterMidsByDealScope,
} from './dealMidSelection.js';

describe('resolveDealMidScopeFromStages', () => {
  it('returns null scope when nothing selected', () => {
    assert.deepEqual(resolveDealMidScopeFromStages([]), { midIds: null, locationIds: null });
    assert.deepEqual(
      resolveDealMidScopeFromStages([{ label: 'App', includedMidIds: [] }]),
      { midIds: null, locationIds: null },
    );
  });

  it('prefers includedMidIds over locationIds and non-auto-track', () => {
    const scope = resolveDealMidScopeFromStages([
      { label: '__auto_track__', includedMidIds: ['a'], includedLocationIds: ['L1'] },
      { label: 'Wave 1', includedMidIds: ['b', 'c'], includedLocationIds: ['L2'] },
    ]);
    assert.deepEqual(scope, { midIds: ['b', 'c'], locationIds: null });
  });

  it('falls back to includedLocationIds when no mid selection', () => {
    const scope = resolveDealMidScopeFromStages([
      { label: 'Wave 1', includedLocationIds: ['L1', 'L2'] },
    ]);
    assert.deepEqual(scope, { midIds: null, locationIds: ['L1', 'L2'] });
  });
});

describe('filterMidsByDealScope', () => {
  const mids = [
    { id: 'm1', locationId: 'L1', dba: 'A' },
    { id: 'm2', locationId: 'L2', dba: 'B' },
    { id: 'm3', locationId: 'L1', dba: 'C' },
  ];

  it('returns all when scope empty', () => {
    assert.deepEqual(filterMidsByDealScope(mids, { midIds: null, locationIds: null }), mids);
  });

  it('filters by midIds', () => {
    assert.deepEqual(
      filterMidsByDealScope(mids, { midIds: ['m2'], locationIds: null }),
      [{ id: 'm2', locationId: 'L2', dba: 'B' }],
    );
  });

  it('filters by locationIds when midIds absent', () => {
    assert.deepEqual(
      filterMidsByDealScope(mids, { midIds: null, locationIds: ['L1'] }),
      [
        { id: 'm1', locationId: 'L1', dba: 'A' },
        { id: 'm3', locationId: 'L1', dba: 'C' },
      ],
    );
  });
});
