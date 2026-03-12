/**
 * tools/live/data_source_flag.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDataSource } from './data_source_flag.ts';

describe('summarizeDataSource', () => {
  it('counts total_fixes correctly', () => {
    const s = summarizeDataSource([
      { data_source: 'gsc_live' },
      { data_source: 'simulated' },
      { data_source: 'simulated' },
    ]);
    assert.equal(s.total_fixes, 3);
  });

  it('counts gsc_live_fixes correctly', () => {
    const s = summarizeDataSource([
      { data_source: 'gsc_live' },
      { data_source: 'gsc_live' },
      { data_source: 'simulated' },
    ]);
    assert.equal(s.gsc_live_fixes, 2);
  });

  it('counts simulated_fixes correctly', () => {
    const s = summarizeDataSource([
      { data_source: 'gsc_live' },
      { data_source: 'simulated' },
      { data_source: 'simulated' },
    ]);
    assert.equal(s.simulated_fixes, 2);
  });

  it('calculates gsc_live_percent correctly (2 of 4 = 50)', () => {
    const s = summarizeDataSource([
      { data_source: 'gsc_live' },
      { data_source: 'gsc_live' },
      { data_source: 'simulated' },
      { data_source: 'simulated' },
    ]);
    assert.equal(s.gsc_live_percent, 50);
  });

  it('gsc_live_percent rounds to nearest integer', () => {
    const s = summarizeDataSource([
      { data_source: 'gsc_live' },
      { data_source: 'simulated' },
      { data_source: 'simulated' },
    ]);
    assert.equal(s.gsc_live_percent, 33);
  });

  it('handles empty array — all zeros', () => {
    const s = summarizeDataSource([]);
    assert.equal(s.total_fixes, 0);
    assert.equal(s.gsc_live_fixes, 0);
    assert.equal(s.simulated_fixes, 0);
    assert.equal(s.gsc_live_percent, 0);
  });

  it('handles all simulated', () => {
    const s = summarizeDataSource([
      { data_source: 'simulated' },
      { data_source: 'simulated' },
    ]);
    assert.equal(s.gsc_live_fixes, 0);
    assert.equal(s.gsc_live_percent, 0);
  });

  it('handles all gsc_live', () => {
    const s = summarizeDataSource([
      { data_source: 'gsc_live' },
      { data_source: 'gsc_live' },
    ]);
    assert.equal(s.simulated_fixes, 0);
    assert.equal(s.gsc_live_percent, 100);
  });

  it('handles entries with no data_source field', () => {
    const s = summarizeDataSource([{}, { data_source: 'gsc_live' }]);
    assert.equal(s.total_fixes, 2);
    assert.equal(s.gsc_live_fixes, 1);
    assert.equal(s.simulated_fixes, 0);
  });

  it('gsc_live_percent = 0 on empty (no division by zero)', () => {
    const s = summarizeDataSource([]);
    assert.equal(s.gsc_live_percent, 0);
  });

  it('never throws on null input', () => {
    assert.doesNotThrow(() => summarizeDataSource(null as never));
  });

  it('never throws on undefined entries', () => {
    assert.doesNotThrow(() => summarizeDataSource(undefined as never));
  });
});
