/**
 * tools/native/email_capture.ts
 *
 * VAEO Native Email Capture Popup — config, validation, and
 * Liquid/HTML/CSS/JS snippet generator. Zero external dependencies.
 *
 * Never throws.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface EmailCaptureConfig {
  trigger:                'exit_intent' | 'scroll_percent' | 'time_delay' | 'immediate';
  trigger_value:          number;
  title:                  string;
  subtitle:               string;
  placeholder_text:       string;
  button_text:            string;
  success_message:        string;
  background_color:       string;
  text_color:             string;
  button_color:           string;
  button_text_color:      string;
  overlay_opacity:        number;
  border_radius_px:       number;
  show_close_button:      boolean;
  close_on_overlay_click: boolean;
  show_once_per_session:  boolean;
  show_once_per_days:     number;
  webhook_url:            string;
  include_name_field:     boolean;
  gdpr_checkbox:          boolean;
  gdpr_text:              string;
}

// ── Default config ───────────────────────────────────────────────────────────

export function defaultEmailCaptureConfig(): EmailCaptureConfig {
  return {
    trigger:                'exit_intent',
    trigger_value:          0,
    title:                  'Get 10% Off Your First Order',
    subtitle:               'Join our list and save on your first purchase.',
    placeholder_text:       'Enter your email address',
    button_text:            'Get My Discount',
    success_message:        "You're in! Check your inbox for your code.",
    background_color:       '#ffffff',
    text_color:             '#1a1a1a',
    button_color:           '#1a1a2e',
    button_text_color:      '#ffffff',
    overlay_opacity:        0.6,
    border_radius_px:       12,
    show_close_button:      true,
    close_on_overlay_click: true,
    show_once_per_session:  false,
    show_once_per_days:     7,
    webhook_url:            '',
    include_name_field:     false,
    gdpr_checkbox:          false,
    gdpr_text:              'I agree to receive marketing emails.',
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validateEmailCaptureConfig(
  config: EmailCaptureConfig,
): { valid: boolean; errors: string[] } {
  try {
    const errors: string[] = [];

    if (config.trigger === 'scroll_percent') {
      if (config.trigger_value < 0 || config.trigger_value > 100) {
        errors.push('trigger_value for scroll_percent must be 0-100');
      }
    }

    if (config.trigger === 'time_delay') {
      if (config.trigger_value < 0) {
        errors.push('trigger_value for time_delay must be >= 0');
      }
    }

    if (config.overlay_opacity < 0 || config.overlay_opacity > 1) {
      errors.push('overlay_opacity must be 0.0 to 1.0');
    }

    if (config.border_radius_px < 0 || config.border_radius_px > 50) {
      errors.push('border_radius_px must be 0 to 50');
    }

    if (config.show_once_per_days < 0) {
      errors.push('show_once_per_days must be >= 0');
    }

    if (!config.background_color.startsWith('#')) {
      errors.push('background_color must start with #');
    }

    if (!config.button_color.startsWith('#')) {
      errors.push('button_color must start with #');
    }

    if (!config.title || config.title.trim() === '') {
      errors.push('title must not be empty');
    }

    if (!config.button_text || config.button_text.trim() === '') {
      errors.push('button_text must not be empty');
    }

    return { valid: errors.length === 0, errors };
  } catch {
    return { valid: false, errors: ['Validation failed with error'] };
  }
}

// ── Snippet generator ────────────────────────────────────────────────────────

export function generateEmailCaptureSnippet(
  config: EmailCaptureConfig,
  snippet_name: string,
): string {
  try {
    const esc = (s: string) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const lsKey = `vaeo-ec-${snippet_name}`;

    // Close button
    const closeBtn = config.show_close_button
      ? `<button id="vaeo-ec-close" style="position:absolute;top:12px;right:16px;background:none;border:none;font-size:24px;color:${config.text_color};cursor:pointer;line-height:1">&times;</button>`
      : '';

    // Name field
    const nameField = config.include_name_field
      ? `<input type="text" id="vaeo-ec-name" placeholder="Your name" style="width:100%;padding:12px 16px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:12px;box-sizing:border-box" />`
      : '';

    // GDPR checkbox
    const gdprField = config.gdpr_checkbox
      ? `<label style="display:flex;align-items:flex-start;gap:8px;margin-bottom:16px;font-size:13px;color:${config.text_color};cursor:pointer"><input type="checkbox" id="vaeo-ec-gdpr" style="margin-top:2px" /><span>${esc(config.gdpr_text)}</span></label>`
      : '';

    // Webhook fetch
    const webhookBlock = config.webhook_url
      ? `
        fetch('${config.webhook_url}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            ${config.include_name_field ? "name: document.getElementById('vaeo-ec-name').value," : ''}
            source: 'vaeo-email-capture',
            snippet: '${snippet_name}',
            timestamp: new Date().toISOString()
          })
        }).catch(function() {});`
      : '';

    // Trigger logic
    let triggerScript = '';
    switch (config.trigger) {
      case 'exit_intent':
        triggerScript = `
      document.addEventListener('mouseleave', function(e) {
        if (e.clientY < 0) vaeoEcShow();
      });
      document.addEventListener('touchstart', function(e) {
        if (e.touches[0] && e.touches[0].clientY < window.innerHeight * 0.1) vaeoEcShow();
      });`;
        break;
      case 'scroll_percent':
        triggerScript = `
      window.addEventListener('scroll', function() {
        var scrollPct = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
        if (scrollPct >= ${config.trigger_value}) vaeoEcShow();
      });`;
        break;
      case 'time_delay':
        triggerScript = `
      setTimeout(function() { vaeoEcShow(); }, ${config.trigger_value * 1000});`;
        break;
      case 'immediate':
        triggerScript = `
      document.addEventListener('DOMContentLoaded', function() { vaeoEcShow(); });`;
        break;
    }

    // Session storage check
    const sessionCheck = config.show_once_per_session
      ? `if (sessionStorage.getItem('${lsKey}-session')) return;`
      : '';
    const sessionSet = config.show_once_per_session
      ? `sessionStorage.setItem('${lsKey}-session', '1');`
      : '';

    return `/* VAEO Native Email Capture v1.0.0
   Generated by Velocity AEO
   snippet: ${snippet_name} */

<div id="vaeo-email-capture">
  <div id="vaeo-ec-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,${config.overlay_opacity});z-index:10000;display:none"></div>
  <div id="vaeo-ec-modal" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:${config.background_color};color:${config.text_color};border-radius:${config.border_radius_px}px;padding:40px;max-width:480px;width:90%;z-index:10001;display:none;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
    ${closeBtn}
    <h2 style="margin:0 0 8px;font-size:24px;font-weight:700">${esc(config.title)}</h2>
    <p style="margin:0 0 24px;font-size:15px;opacity:0.8">${esc(config.subtitle)}</p>
    <form id="vaeo-ec-form">
      ${nameField}
      <input type="email" id="vaeo-ec-email" placeholder="${esc(config.placeholder_text)}" required style="width:100%;padding:12px 16px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:12px;box-sizing:border-box" />
      ${gdprField}
      <button type="submit" style="width:100%;padding:14px;background:${config.button_color};color:${config.button_text_color};border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer">${esc(config.button_text)}</button>
    </form>
    <div id="vaeo-ec-success" style="display:none;text-align:center;padding:20px 0">
      <p style="font-size:18px;font-weight:600;margin:0">${esc(config.success_message)}</p>
    </div>
  </div>
</div>

<style>
  #vaeo-ec-overlay { opacity: ${config.overlay_opacity}; }
  #vaeo-ec-modal * { box-sizing: border-box; }
  @media (max-width: 520px) {
    #vaeo-ec-modal { padding: 24px !important; width: 95% !important; }
  }
</style>

<script>
(function() {
  var shown = false;
  var lsKey = '${lsKey}';

  function vaeoEcShow() {
    if (shown) return;
    ${sessionCheck}
    var stored = localStorage.getItem(lsKey);
    if (stored && ${config.show_once_per_days} > 0) {
      var diff = (Date.now() - parseInt(stored, 10)) / 86400000;
      if (diff < ${config.show_once_per_days}) return;
    }
    shown = true;
    ${sessionSet}
    document.getElementById('vaeo-ec-overlay').style.display = 'block';
    document.getElementById('vaeo-ec-modal').style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function vaeoEcClose() {
    document.getElementById('vaeo-ec-overlay').style.display = 'none';
    document.getElementById('vaeo-ec-modal').style.display = 'none';
    document.body.style.overflow = '';
  }

  ${config.show_close_button ? "document.getElementById('vaeo-ec-close').addEventListener('click', vaeoEcClose);" : ''}
  ${config.close_on_overlay_click ? "document.getElementById('vaeo-ec-overlay').addEventListener('click', vaeoEcClose);" : ''}

  document.getElementById('vaeo-ec-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var email = document.getElementById('vaeo-ec-email').value;
    if (!email || email.indexOf('@') === -1 || email.indexOf('.') === -1) return;
    ${config.gdpr_checkbox ? "if (!document.getElementById('vaeo-ec-gdpr').checked) return;" : ''}
    ${webhookBlock}
    document.getElementById('vaeo-ec-form').style.display = 'none';
    document.getElementById('vaeo-ec-success').style.display = 'block';
    localStorage.setItem(lsKey, String(Date.now()));
    setTimeout(vaeoEcClose, 3000);
  });

  ${triggerScript}
})();
</script>`;
  } catch {
    return `<!-- VAEO Email Capture: generation error for ${snippet_name} -->`;
  }
}
