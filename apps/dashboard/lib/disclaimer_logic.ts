/**
 * apps/dashboard/lib/disclaimer_logic.ts
 *
 * Logic for POV disclaimer banner. Never throws.
 */

const DISCLAIMER_TEXT =
  'SEO analysis and recommendations are provided by Velocity AEO based on available data. Results may vary. This is not a guarantee of ranking improvement.';

export function getDisclaimerText(): string {
  try {
    return DISCLAIMER_TEXT;
  } catch {
    return '';
  }
}

export function shouldShowDisclaimer(dismissed: boolean): boolean {
  try {
    return !dismissed;
  } catch {
    return true;
  }
}
