/**
 * tools/native/shipping_bar.ts
 *
 * VAEO Native Shipping Bar — config, validation, and Liquid snippet generator.
 * Never throws.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ShippingBarConfig {
  threshold_amount:         number;
  currency_symbol:          string;
  message_below_threshold:  string;
  message_at_threshold:     string;
  background_color:         string;
  text_color:               string;
  bar_height_px:            number;
  font_size_px:             number;
  show_progress_bar:        boolean;
  progress_color:           string;
  position:                 'top' | 'bottom';
  sticky:                   boolean;
  dismissible:              boolean;
  animate_on_threshold:     boolean;
}

// ── defaultShippingBarConfig ──────────────────────────────────────────────────

export function defaultShippingBarConfig(): ShippingBarConfig {
  try {
    return {
      threshold_amount:        50,
      currency_symbol:         '$',
      message_below_threshold: 'Add {remaining} more for FREE shipping!',
      message_at_threshold:    "🎉 You've unlocked free shipping!",
      background_color:        '#1a1a2e',
      text_color:              '#ffffff',
      bar_height_px:           44,
      font_size_px:            14,
      show_progress_bar:       true,
      progress_color:          '#4ade80',
      position:                'top',
      sticky:                  true,
      dismissible:             false,
      animate_on_threshold:    true,
    };
  } catch {
    return {
      threshold_amount:        50,
      currency_symbol:         '$',
      message_below_threshold: 'Add {remaining} more for FREE shipping!',
      message_at_threshold:    "You've unlocked free shipping!",
      background_color:        '#1a1a2e',
      text_color:              '#ffffff',
      bar_height_px:           44,
      font_size_px:            14,
      show_progress_bar:       true,
      progress_color:          '#4ade80',
      position:                'top',
      sticky:                  true,
      dismissible:             false,
      animate_on_threshold:    true,
    };
  }
}

// ── validateShippingBarConfig ─────────────────────────────────────────────────

function isValidHexColor(s: string): boolean {
  if (typeof s !== 'string') return false;
  if (!s.startsWith('#')) return false;
  return s.length === 4 || s.length === 7;
}

export function validateShippingBarConfig(
  config: ShippingBarConfig,
): { valid: boolean; errors: string[] } {
  try {
    const errors: string[] = [];

    if (!config || typeof config.threshold_amount !== 'number' || config.threshold_amount <= 0) {
      errors.push('threshold_amount must be greater than 0');
    }
    if (typeof config.bar_height_px !== 'number' || config.bar_height_px < 20 || config.bar_height_px > 120) {
      errors.push('bar_height_px must be between 20 and 120');
    }
    if (typeof config.font_size_px !== 'number' || config.font_size_px < 10 || config.font_size_px > 32) {
      errors.push('font_size_px must be between 10 and 32');
    }
    if (!isValidHexColor(config.background_color)) {
      errors.push('background_color must start with # and be 4 or 7 characters');
    }
    if (!isValidHexColor(config.text_color)) {
      errors.push('text_color must start with # and be 4 or 7 characters');
    }
    if (!isValidHexColor(config.progress_color)) {
      errors.push('progress_color must start with # and be 4 or 7 characters');
    }

    return { valid: errors.length === 0, errors };
  } catch {
    return { valid: false, errors: ['Validation threw unexpectedly'] };
  }
}

// ── generateShippingBarSnippet ────────────────────────────────────────────────

export function generateShippingBarSnippet(
  config:       ShippingBarConfig,
  snippet_name: string,
): string {
  try {
    const cfg        = config ?? defaultShippingBarConfig();
    const sName      = snippet_name ?? 'vaeo-shipping-bar';
    const posStyle   = cfg.sticky
      ? `position: fixed; ${cfg.position}: 0;`
      : `position: relative;`;

    const progressHtml = cfg.show_progress_bar ? `
  <div id="vaeo-sb-progress-track" style="width:100%;height:4px;background:rgba(255,255,255,0.2);margin-top:4px;">
    <div id="vaeo-sb-progress-fill" style="height:100%;width:0%;background:${cfg.progress_color};transition:width 0.4s ease;border-radius:2px;"></div>
  </div>` : '';

    const dismissHtml = cfg.dismissible ? `
  <button id="vaeo-sb-dismiss" aria-label="Close shipping bar" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:${cfg.text_color};font-size:18px;cursor:pointer;opacity:0.7;line-height:1;">×</button>` : '';

    const animateCss = cfg.animate_on_threshold ? `
  @keyframes vaeo-sb-pulse {
    0%,100% { opacity: 1; }
    50%      { opacity: 0.7; }
  }
  #vaeo-shipping-bar.threshold-met { animation: vaeo-sb-pulse 1s ease 2; }` : '';

    const progressScript = cfg.show_progress_bar ? `
    var pct = Math.min(100, (cartTotal / threshold) * 100);
    var fill = document.getElementById('vaeo-sb-progress-fill');
    if (fill) fill.style.width = pct + '%';` : '';

    const dismissScript = cfg.dismissible ? `
  var dismissBtn = document.getElementById('vaeo-sb-dismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', function() {
      var bar = document.getElementById('vaeo-shipping-bar');
      if (bar) bar.style.display = 'none';
      try { sessionStorage.setItem('vaeo-sb-dismissed', '1'); } catch(e) {}
    });
  }
  try { if (sessionStorage.getItem('vaeo-sb-dismissed') === '1') {
    var bar = document.getElementById('vaeo-shipping-bar');
    if (bar) bar.style.display = 'none';
  }} catch(e) {}` : '';

    const animateScript = cfg.animate_on_threshold ? `
      if (remaining <= 0) {
        var bar = document.getElementById('vaeo-shipping-bar');
        if (bar) { bar.classList.add('threshold-met'); }
      }` : '';

    return `/* VAEO Native Shipping Bar v1.0.0
   Generated by Velocity AEO
   snippet: ${sName} */

<div id="vaeo-shipping-bar" role="banner" aria-live="polite">
  <style>
    #vaeo-shipping-bar {
      ${posStyle}
      width: 100%;
      height: ${cfg.bar_height_px}px;
      background: ${cfg.background_color};
      color: ${cfg.text_color};
      font-size: ${cfg.font_size_px}px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding: 0 48px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      left: 0;
    }
    #vaeo-sb-message {
      text-align: center;
      line-height: 1.3;
    }${animateCss}
  </style>

  <div id="vaeo-sb-message"
    data-template="${cfg.message_below_threshold.replace(/"/g, '&quot;')}"
    data-threshold-message="${cfg.message_at_threshold.replace(/"/g, '&quot;')}">
    ${cfg.message_below_threshold}
  </div>${progressHtml}${dismissHtml}

  <script>
  (function() {
    var threshold = ${cfg.threshold_amount};
    var currencySymbol = '${cfg.currency_symbol.replace(/'/g, "\\'")}';

    function updateBar(cartTotal) {
      var remaining = threshold - cartTotal;
      var msgEl = document.getElementById('vaeo-sb-message');
      if (!msgEl) return;

      if (remaining <= 0) {
        msgEl.textContent = msgEl.getAttribute('data-threshold-message') || '';${animateScript}
      } else {
        var tmpl = msgEl.getAttribute('data-template') || '';
        msgEl.textContent = tmpl.replace('{remaining}', currencySymbol + remaining.toFixed(2));
      }${progressScript}
    }

    function fetchCart() {
      fetch('/cart.js')
        .then(function(r) { return r.json(); })
        .then(function(cart) {
          updateBar(cart.total_price / 100);
        })
        .catch(function() { updateBar(0); });
    }

    // Listen for Shopify cart updates
    document.addEventListener('cart:updated', function(e) {
      var detail = e && e.detail;
      if (detail && typeof detail.total_price === 'number') {
        updateBar(detail.total_price / 100);
      } else {
        fetchCart();
      }
    });

    // Initial load
    fetchCart();
    ${dismissScript}
  })();
  </script>
</div>`;
  } catch {
    return `<!-- VAEO Shipping Bar: generation error for snippet: ${snippet_name ?? 'unknown'} -->`;
  }
}
