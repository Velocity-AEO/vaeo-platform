import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Set APPLY_FIX_MOCK=true (or any truthy value) on Vercel / non-local envs
// where the VAEO-shopify-safe CLI is not available.
const IS_MOCK = process.env.APPLY_FIX_MOCK === 'true';

// Absolute path to the shopify-safe repo on the operator machine.
const VAEO_REPO = process.env.VAEO_REPO_PATH ?? '/Users/vincentgoodrich/VAEO-shopify-safe';

const COMMAND = [
  `cd "${VAEO_REPO}"`,
  'doppler run --project vaeo-platform --config dev_goodrichvincent-eng --',
  'npm run vaeo -- theme apply-next',
  '--site cococabanalife.com',
  '--run bp_20260308042816',
  'APPLY-LIVE',
].join(' && ');

export async function POST(): Promise<NextResponse> {
  if (IS_MOCK) {
    // Simulate latency for demo purposes
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return NextResponse.json({ ok: true, mock: true });
  }

  try {
    const { stdout, stderr } = await execAsync(COMMAND, {
      timeout: 120_000,  // 2 min max
      env: { ...process.env },
    });

    const output = stdout + stderr;
    const success = output.includes('[theme-apply]') && !output.includes('Error:');

    if (!success) {
      return NextResponse.json(
        { ok: false, error: 'CLI did not complete successfully', output: output.slice(-1000) },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, output: output.slice(-500) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
