/**
 * apps/dashboard/lib/banner_logic.ts
 *
 * Logic for simulated data banner. Never throws.
 */

export type BannerState = 'no_banner' | 'gsc_not_connected' | 'gsc_syncing';

export function getBannerState(
  data_source: string,
  gsc_connected: boolean,
): BannerState {
  try {
    if (data_source === 'gsc_live') return 'no_banner';
    if (!gsc_connected) return 'gsc_not_connected';
    return 'gsc_syncing';
  } catch {
    return 'no_banner';
  }
}

const MESSAGES: Record<BannerState, string> = {
  no_banner: '',
  gsc_not_connected:
    'Data shown is estimated. Connect Google Search Console for live rankings and accurate fix prioritization.',
  gsc_syncing:
    'Live GSC data is syncing. Estimated data shown in the meantime.',
};

export function getBannerMessage(state: BannerState): string {
  try {
    return MESSAGES[state] ?? '';
  } catch {
    return '';
  }
}
