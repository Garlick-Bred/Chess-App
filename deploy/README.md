# Built Worker bundle

`worker.js` is the complete Cloudflare Worker: the API (`server/`) plus the
built client embedded as strings. It contains no secrets: the family invite
code is a Worker secret, and the database is a D1 binding.

It is committed so the site can be deployed without an API token, through
the Cloudflare connector: Cloudflare fetches this file from the public repo
at an exact commit, checks its SHA-256, and uploads it as the Worker.

Rebuild after any change with `npm run bundle`.

To deploy from your own machine with a token instead:
`CLOUDFLARE_API_TOKEN=... npm run deploy` (see `scripts/deploy-cloudflare.mjs`).
