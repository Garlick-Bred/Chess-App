// Cloudflare Worker entry: the shared API on D1, plus the built client.
// The client files are embedded in the bundle by scripts/deploy-cloudflare.mjs
// (worker/assets.generated.js); if an ASSETS binding is configured instead
// (Wrangler "assets"), that is used.
import { createApi } from '../server/api.js';
import { createD1Store } from './store-d1.js';
import { ASSETS } from './assets.generated.js';

let handle = null;
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};

function serveEmbedded(request) {
  const { pathname } = new URL(request.url);
  const asset = ASSETS[pathname] ?? ASSETS['/index.html'];
  if (!asset) return new Response('Not found', { status: 404 });
  const immutable = pathname.startsWith('/assets/') && ASSETS[pathname];
  return new Response(asset.body, {
    headers: {
      'Content-Type': asset.type,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...SECURITY_HEADERS,
    },
  });
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export default {
  async fetch(request, env, ctx) {
    // Always use HTTPS in production (session cookies are Secure there).
    const url = new URL(request.url);
    if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    // Cookies get the Secure flag whenever the request came in over HTTPS.
    handle ??= createApi({
      store: createD1Store(env.DB),
      env: { INVITE_CODE: env.INVITE_CODE ?? '', TABLEBASE_URL: env.TABLEBASE_URL, COOKIE_DOMAIN: env.COOKIE_DOMAIN ?? '' },
    });
    const api = await handle(request, ctx);
    if (api) return api;
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return serveEmbedded(request);
  },
};
