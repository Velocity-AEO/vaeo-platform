/**
 * GET /api/badge/[siteId]/embed
 *
 * Returns a JavaScript snippet clients paste on their site:
 *   <script src="https://platform.vaeo.app/api/badge/SITE_ID/embed"></script>
 *
 * The script fetches the badge SVG and injects it next to the <script> tag
 * (or into any element with data-velocity-badge="SITE_ID").
 *
 * Public endpoint — no auth required.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildScript(badgeUrl: string, siteId: string): string {
  // Written as a plain-JS IIFE so it's valid as-is in the browser.
  return `(function () {
  'use strict';
  var BADGE_URL = '${badgeUrl}';
  var SITE_ID   = '${siteId}';

  function inject(svg) {
    var targets = document.querySelectorAll('[data-velocity-badge="' + SITE_ID + '"]');
    if (!targets.length) {
      var el = document.createElement('span');
      el.setAttribute('data-velocity-badge', SITE_ID);
      var s = document.currentScript ||
              document.querySelector('script[src*="' + SITE_ID + '/embed"]');
      if (s) s.insertAdjacentElement('afterend', el);
      targets = [el];
    }
    for (var i = 0; i < targets.length; i++) {
      targets[i].innerHTML = svg;
      targets[i].style.display = 'inline-block';
    }
  }

  fetch(BADGE_URL, { cache: 'force-cache' })
    .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
    .then(inject)
    .catch(function (e) { console.warn('[Velocity Badge] Failed to load:', e); });
})();`;
}

export async function GET(
  req: Request,
  { params }: { params: { siteId: string } },
) {
  const { siteId } = params;

  if (!UUID_RE.test(siteId)) {
    return new Response('// Invalid site ID\n', {
      status: 400,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  const origin   = new URL(req.url).origin;
  const badgeUrl = `${origin}/api/badge/${siteId}`;

  return new Response(buildScript(badgeUrl, siteId), {
    headers: {
      'Content-Type':                'application/javascript; charset=utf-8',
      'Cache-Control':               'public, max-age=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
