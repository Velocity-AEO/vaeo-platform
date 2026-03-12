/**
 * apps/dashboard/lib/disclaimer_logic.test.ts
 *
 * Tests for POV disclaimer logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDisclaimerText, shouldShowDisclaimer } from './disclaimer_logic.js';

describe('getDisclaimerText', () => {
  it('returns non-empty string', () => {
    const text = getDisclaimerText();
    assert.ok(text.length > 0);
  });

  it('mentions Velocity AEO', () => {
    assert.ok(getDisclaimerText().includes('Velocity AEO'));
  });

  it('mentions not a guarantee', () => {
    assert.ok(getDisclaimerText().includes('not a guarantee'));
  });

  it('returns consistent value', () => {
    assert.equal(getDisclaimerText(), getDisclaimerText());
  });
});

describe('shouldShowDisclaimer', () => {
  it('returns true when not dismissed', () => {
    assert.equal(shouldShowDisclaimer(false), true);
  });

  it('returns false when dismissed', () => {
    assert.equal(shouldShowDisclaimer(true), false);
  });
});

describe('disclaimer_logic — never throws', () => {
  it('getDisclaimerText never throws', () => {
    assert.ok(typeof getDisclaimerText() === 'string');
  });

  it('shouldShowDisclaimer never throws with false', () => {
    assert.equal(shouldShowDisclaimer(false), true);
  });
});
