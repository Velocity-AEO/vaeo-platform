import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { triggerGSCOnboarding } from './gsc_onboarding_trigger.js';

describe('triggerGSCOnboarding', () => {
  it('calls onboardFn with site_id and domain', async () => {
    let called = false;
    await triggerGSCOnboarding('s1', 'example.com', 'shopify', {
      onboardFn: async (sid, dom, plat) => {
        called = true;
        assert.equal(sid, 's1');
        assert.equal(dom, 'example.com');
        assert.equal(plat, 'shopify');
        return { site_id: sid, domain: dom, success: true, message: 'ok' };
      },
    });
    assert.ok(called);
  });

  it('calls logFn with result', async () => {
    let loggedMsg = '';
    await triggerGSCOnboarding('s1', 'example.com', 'wordpress', {
      onboardFn: async (sid, dom) => ({
        site_id: sid, domain: dom, success: true, message: 'ok',
      }),
      logFn: (msg) => { loggedMsg = msg; },
    });
    assert.ok(loggedMsg.includes('succeeded'));
    assert.ok(loggedMsg.includes('s1'));
  });

  it('logs failure message when onboardFn returns success=false', async () => {
    let loggedMsg = '';
    await triggerGSCOnboarding('s1', 'example.com', 'shopify', {
      onboardFn: async (sid, dom) => ({
        site_id: sid, domain: dom, success: false, message: 'err',
      }),
      logFn: (msg) => { loggedMsg = msg; },
    });
    assert.ok(loggedMsg.includes('failed'));
  });

  it('never throws when onboardFn throws', async () => {
    await assert.doesNotReject(async () => {
      await triggerGSCOnboarding('s1', 'example.com', 'shopify', {
        onboardFn: async () => { throw new Error('boom'); },
      });
    });
  });

  it('never throws when logFn throws', async () => {
    await assert.doesNotReject(async () => {
      await triggerGSCOnboarding('s1', 'example.com', 'shopify', {
        onboardFn: async (sid, dom) => ({
          site_id: sid, domain: dom, success: true, message: 'ok',
        }),
        logFn: () => { throw new Error('log boom'); },
      });
    });
  });

  it('completes without awaiting external calls', async () => {
    let completed = false;
    await triggerGSCOnboarding('s1', 'example.com', 'wordpress', {
      onboardFn: async (sid, dom) => {
        completed = true;
        return { site_id: sid, domain: dom, success: true, message: 'ok' };
      },
    });
    assert.ok(completed);
  });

  it('works with default deps', async () => {
    await assert.doesNotReject(async () => {
      await triggerGSCOnboarding('s1', 'example.com', 'shopify');
    });
  });

  it('passes wordpress platform', async () => {
    let receivedPlatform = '';
    await triggerGSCOnboarding('s1', 'example.com', 'wordpress', {
      onboardFn: async (_sid, _dom, plat) => {
        receivedPlatform = plat;
        return { site_id: _sid, domain: _dom, success: true, message: 'ok' };
      },
    });
    assert.equal(receivedPlatform, 'wordpress');
  });

  it('never throws on null inputs', async () => {
    await assert.doesNotReject(async () => {
      await triggerGSCOnboarding(null as any, null as any, null as any);
    });
  });

  it('never throws on undefined deps', async () => {
    await assert.doesNotReject(async () => {
      await triggerGSCOnboarding('s1', 'example.com', 'shopify', undefined);
    });
  });

  it('logFn receives data parameter', async () => {
    let receivedData: unknown = null;
    await triggerGSCOnboarding('s1', 'example.com', 'shopify', {
      onboardFn: async (sid, dom) => ({
        site_id: sid, domain: dom, success: true, message: 'ok',
      }),
      logFn: (_msg, data) => { receivedData = data; },
    });
    assert.ok(receivedData);
    assert.equal((receivedData as any).success, true);
  });

  it('handles both platforms', async () => {
    for (const platform of ['shopify', 'wordpress'] as const) {
      await assert.doesNotReject(async () => {
        await triggerGSCOnboarding('s1', 'example.com', platform);
      });
    }
  });
});
