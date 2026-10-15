# Deployment guide

The app is a Node.js 20 web service. It serves the website and API from one process, listens on `0.0.0.0`, honors the host-provided `PORT`, and exposes `GET /api/health` for platform health checks. A provider-neutral Dockerfile is included.

## Before a public launch

A brochure/itinerary preview can run with no provider credentials, but it is **not** a live-booking service. With `NODE_ENV=production`, enquiries are rejected with a clear error until Zoho CRM or a trusted lead webhook is configured; this prevents silently losing customer enquiries. The local development JSONL lead file is not a production store.

Before accepting real enquiries, choose and configure either:

- Zoho CRM v8 OAuth server-side credentials (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, and the correct Accounts region); or
- a private HTTPS lead webhook (`LEADS_WEBHOOK_URL`, and its server-side token if used).

Set credentials only in the hosting provider's secret manager. Do not commit them, bake them into a container image, or paste them into chat. Review your privacy notice, retention policy, consent wording, business identity/contact details, domain and HTTPS settings before launch.

The itinerary maker continues to offer local curated plans without OpenAI credentials. Add `AI_API_KEY` through the secret manager to enable Responses API generation; the default model is `gpt-5.4-mini` and can be changed with `AI_MODEL`.

Hotel/flight inventory and payments remain fail-closed by default. Do not enable those routes for real customers until TBO has issued the approved endpoint, credentials, partner-specific flight documentation and certification, and a durable transactional booking adapter has been implemented and tested with Razorpay in test mode. Read `README.md`, `.env.example`, and the adapter contracts under `integrations/` before changing any live flags.

## Build and run with Docker

From the project root:

```sh
docker build -t triwal-traviator .
docker run --rm -p 4173:4173 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=4173 \
  --env-file /secure/path/triwal-server.env \
  triwal-traviator
```

Keep `/secure/path/triwal-server.env` outside the repository and restrict its file permissions. For an actual hosting provider, prefer its native secret manager over an environment file. The container runs as the unprivileged `node` user, omits development dependencies, and has a health check against `/api/health`.

The project does not require persistent local disk when Zoho or a webhook is configured. Do not rely on container-local files for production customer records or booking state.

## Build and run on a managed Node host

Configure the service with:

- Runtime: Node.js 20 or later
- Install/build command: `npm ci`
- Start command: `npm start`
- Health check: `/api/health`
- Bind address: `0.0.0.0` (already the default)
- Port: use the platform-provided `PORT`; do not hard-code a public port
- Environment: `NODE_ENV=production`
- Secrets: add only the integrations you have provisioned through the platform's server-side settings

Before going live, run `npm run check` and `npm test`, verify `/api/health` and `/api/integrations/status`, test enquiry delivery end to end, and confirm that live booking remains disabled unless every supplier, payment and persistent-store gate is intentionally satisfied.
