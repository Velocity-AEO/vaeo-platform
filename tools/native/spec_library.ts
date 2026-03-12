// tools/native/spec_library.ts — Pre-loaded approved functional specs
// Department 1 catalog: WHAT each native component does.

import {
  type FunctionalSpec,
  createSpec,
  approveSpec,
} from './functional_spec.js';

// ── Build approved specs ─────────────────────────────────────────────────────

const shippingBar = approveSpec(createSpec({
  name: 'Shipping Announcement Bar',
  category: 'shipping',
  version: '1.0.0',
  replaces_app: 'Hextom Free Shipping Bar',
  replaces_app_id: 'hextom_shipping_bar',
  observed_behaviors: [
    {
      id: 'b1',
      description: 'Displays a banner at top of page',
      trigger: 'Page load',
      expected_output: 'A full-width bar visible above header',
      user_visible: true,
    },
    {
      id: 'b2',
      description: 'Shows threshold message based on cart value',
      trigger: 'Cart is below free shipping threshold',
      expected_output: 'Message: "Add $X more for free shipping"',
      user_visible: true,
    },
    {
      id: 'b3',
      description: 'Updates message when cart value changes',
      trigger: 'Item added to cart',
      expected_output: 'Bar updates remaining amount in real time',
      user_visible: true,
    },
    {
      id: 'b4',
      description: 'Shows success message when threshold met',
      trigger: 'Cart reaches or exceeds threshold',
      expected_output: 'Message: "You qualify for free shipping!"',
      user_visible: true,
    },
    {
      id: 'b5',
      description: 'Bar is dismissible by user',
      trigger: 'User clicks X',
      expected_output: 'Bar hides for the session',
      user_visible: true,
    },
  ],
  data_inputs: [
    { name: 'threshold_amount', type: 'number', description: 'Cart value required for free shipping', required: true },
    { name: 'currency_symbol', type: 'string', description: 'Currency symbol to display', required: true },
    { name: 'bar_color', type: 'string', description: 'Background color of bar', required: false },
    { name: 'text_color', type: 'string', description: 'Text color', required: false },
  ],
  performance_requirements: {
    max_js_kb: 5,
    no_external_cdn: true,
    no_render_blocking: true,
    lazy_load_eligible: false,
  },
  legal_notes: 'Spec derived from observing visible behavior of Hextom Free Shipping Bar. No source code accessed. Independent implementation.',
}));

const emailPopup = approveSpec(createSpec({
  name: 'Email Capture Popup',
  category: 'popup',
  version: '1.0.0',
  replaces_app: 'SendWILL Email Popups',
  replaces_app_id: 'sendwill',
  observed_behaviors: [
    {
      id: 'b1',
      description: 'Shows popup after configurable delay',
      trigger: 'User has been on page for X seconds',
      expected_output: 'Modal overlay appears centered on screen',
      user_visible: true,
    },
    {
      id: 'b2',
      description: 'Captures email address',
      trigger: 'User submits form',
      expected_output: 'Email stored, success message shown',
      user_visible: true,
    },
    {
      id: 'b3',
      description: 'Dismissible by user',
      trigger: 'User clicks X or presses Escape',
      expected_output: 'Popup closes, does not show again this session',
      user_visible: true,
    },
    {
      id: 'b4',
      description: 'Does not show to returning subscribers',
      trigger: 'Cookie present indicating prior submission',
      expected_output: 'Popup skipped entirely',
      user_visible: false,
    },
    {
      id: 'b5',
      description: 'Mobile-responsive layout',
      trigger: 'Page loaded on mobile device',
      expected_output: 'Full-width bottom sheet on mobile',
      user_visible: true,
    },
  ],
  data_inputs: [
    { name: 'delay_seconds', type: 'number', description: 'Seconds before popup appears', required: true },
    { name: 'headline', type: 'string', description: 'Popup headline text', required: true },
    { name: 'discount_offer', type: 'string', description: 'Discount text shown in popup', required: false },
    { name: 'klaviyo_list_id', type: 'string', description: 'Klaviyo list to add subscriber to', required: false },
  ],
  performance_requirements: {
    max_js_kb: 8,
    no_external_cdn: true,
    no_render_blocking: true,
    lazy_load_eligible: true,
  },
  legal_notes: 'Spec derived from observing visible behavior. No source code accessed. Independent implementation.',
}));

const socialFeed = approveSpec(createSpec({
  name: 'Social Feed Widget',
  category: 'social',
  version: '1.0.0',
  replaces_app: 'Instafeed',
  replaces_app_id: 'instafeed',
  observed_behaviors: [
    {
      id: 'b1',
      description: 'Displays grid of recent social images',
      trigger: 'Page load',
      expected_output: 'Grid of square images from feed',
      user_visible: true,
    },
    {
      id: 'b2',
      description: 'Clicking image opens in lightbox or link',
      trigger: 'User clicks image',
      expected_output: 'Opens original post or lightbox view',
      user_visible: true,
    },
    {
      id: 'b3',
      description: 'Configurable number of images shown',
      trigger: 'Merchant config',
      expected_output: 'Shows 4, 6, 8, or 12 images',
      user_visible: true,
    },
    {
      id: 'b4',
      description: 'Lazy loads images outside viewport',
      trigger: 'Scroll',
      expected_output: 'Images load as they enter viewport',
      user_visible: false,
    },
  ],
  data_inputs: [
    { name: 'image_count', type: 'number', description: 'Number of images to display', required: true },
    { name: 'columns', type: 'number', description: 'Grid columns', required: true },
    { name: 'feed_source', type: 'string', description: 'Social platform source', required: true },
  ],
  performance_requirements: {
    max_js_kb: 6,
    no_external_cdn: true,
    no_render_blocking: true,
    lazy_load_eligible: true,
  },
  legal_notes: 'Spec derived from observing visible behavior. No source code accessed. Independent implementation.',
}));

// ── Exports ──────────────────────────────────────────────────────────────────

export const SPEC_LIBRARY: FunctionalSpec[] = [
  shippingBar,
  emailPopup,
  socialFeed,
];

export function getSpecById(id: string): FunctionalSpec | undefined {
  return SPEC_LIBRARY.find((s) => s.spec_id === id);
}

export function getSpecByAppId(app_id: string): FunctionalSpec | undefined {
  return SPEC_LIBRARY.find((s) => s.replaces_app_id === app_id);
}

export function getApprovedSpecs(): FunctionalSpec[] {
  return SPEC_LIBRARY.filter((s) => s.status === 'approved');
}
