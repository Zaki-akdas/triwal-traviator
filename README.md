# Triwal Traviator

Responsive travel-agency site and server integration layer. It runs on Node.js 20+ and uses one small dependency (`fast-xml-parser`) for the supplier's SOAP XML response. No external fonts/CDNs are used.

## Start and verify

```bash
npm install
npm start
```

Open `http://localhost:4173`. Without provider secrets the website still works with curated local itinerary suggestions; enquiry notes in development are saved to `storage/inquiries.jsonl` (outside `public/`) and clearly marked as preview-only.

```bash
npm run check
npm test
```

The server binds to `0.0.0.0` for preview/deployment proxies. Configure secrets in your hosting platform's server-side secret manager, or load a private `.env` through your process manager. `.env.example` is only a variable reference. For provider-neutral Docker deployment and a production launch checklist, see `DEPLOYMENT.md`.

## Integrations and fail-closed readiness

`GET /api/integrations/status` reports configuration/readiness without returning secrets. `GET /api/health` returns a small health summary. Live booking is **off by default** (`TRIWAL_LIVE_BOOKING=false`). The site must not accept payment until TBO access/certification, Razorpay, and a persistent booking-store adapter are all ready.

### OpenAI Responses API

The itinerary endpoint uses the Responses API with a strict JSON Schema for the day-by-day plan and `store: false`. Configure `AI_API_KEY` (or `OPENAI_API_KEY`) on the server; `AI_MODEL` defaults to `gpt-5.4-mini`, which supports Responses and structured outputs, and can be overridden with another model available to your account. `AI_BASE_URL` defaults to `https://api.openai.com/v1`. Provider errors fall back to the local curated plan. Only itinerary preferences go to the model—never contact details.

### Zoho CRM v8

Configure `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, and your Zoho Accounts region (India defaults to `https://accounts.zoho.in`). The server refreshes OAuth tokens and upserts a Lead by Email. Its API domain is taken from Zoho's token response unless `ZOHO_API_DOMAIN` is explicitly set. Use the narrowest Zoho scope that permits Leads upsert. A private lead webhook remains an alternative; if Zoho is set up, Zoho is the selected destination. In production, an unconfigured/failed lead destination returns an error instead of silently pretending an adviser received the enquiry.

### TBO inventory

- **Hotels:** `POST /api/tbo/hotels/search` is a server-side TBO HotelService v7 SOAP search adapter. It validates city, dates, rooms, children, nationality and currency, and normalizes supplier search results. Configure `TBO_HOTEL_API_URL`, `TBO_HOTEL_USERNAME`, `TBO_HOTEL_PASSWORD`; set `TBO_HOTEL_ENABLED=true`. Production also requires `TBO_HOTEL_CERTIFIED=true`, `TBO_HOTEL_ENV=production`, and a secure HTTPS partner endpoint. No TBO credentials are shipped to the browser.
- **Air:** `POST /api/tbo/air/search` is gated behind `TBO_FLIGHT_ENABLED=true`, a partner adapter at `TBO_AIR_ADAPTER_MODULE`, and production certification. TBO supplies partner-specific flight API access and certification; implement the methods listed in `integrations/tbo-air-adapter.contract.md` from the account's current partner documentation. In production also set `TBO_FLIGHT_ENV=production` and `TBO_FLIGHT_CERTIFIED=true`. Until then, flight inventory remains off.

Do not set the production certification flags until TBO has granted and certified the corresponding access. The hotel search endpoint reports only availability/prices returned for that request; it is not itself a booking confirmation.

### Razorpay and booking state

The Razorpay helper creates Orders server-side, verifies Checkout HMAC signatures with constant-time comparison, fetches payment status from Razorpay, and validates signed webhooks. Routes:

- `POST /api/payments/orders` accepts a **server-issued quote ID only**; client-supplied prices are ignored.
- `POST /api/payments/verify` verifies the signature and captured payment against the server-owned intent.
- `POST /api/payments/webhook` checks the raw-body webhook signature and reconciles captured orders.

Those routes return `503` unless all gates are met: `TRIWAL_LIVE_BOOKING=true`, certified TBO hotel and air adapters, Razorpay key ID/secret/webhook secret, and a persistent booking adapter at `TRIWAL_BOOKING_ADAPTER_MODULE`. The contract is in `integrations/booking-adapter.contract.md`. That adapter must persist quotes/intents/orders transactionally, revalidate supplier prices before checkout, make payment and supplier confirmation idempotent, and reconcile delayed/duplicate webhooks. It must never take an amount from the browser. Add your production database connection inside that private adapter; no memory-only quote store is permitted for live mode.

Razorpay API keys, Zoho OAuth secrets, TBO credentials and webhook secrets belong only in server-side environment settings. Use `RAZORPAY_MODE=test` for development; production additionally requires `RAZORPAY_MODE=live` and a live-prefixed key. **Do not paste them into chat, commit `.env`, or expose them to the browser.** Run Razorpay in test mode and supplier sandboxes through the full quote → payment → supplier confirmation/cancellation path before enabling live mode.

## Included website features

- Responsive navigation, destination filtering/search, enquiry dialog, FAQ, accessibility and reduced-motion support.
- Custom generated Triwal Traviator logo and locally hosted destination imagery, including the searchable India field guide.
- India Field Guide with 57 curated destinations spanning all 28 states and 8 union territories across North, West, Central, South, East, Northeast India and the Indian islands; every entry has city/region context, famous sights, foods, suggested visit windows, practical notes, a route sketch and a Trip Studio handoff.
- Destination discovery filters for region, interests and free-text search, plus accessible photo/detail dialogs; illustrative artwork and source-photo credits are documented in `IMAGE_CREDITS.md`.
- Eight curated trip-package starting points with destination/vibe search, local favourites, photo gallery controls, full day-by-day details, and Trip Studio prefill.
- Branded loading transition, interactive pointer/keyboard-rotatable 3D-style globe, animated dimensional suitcase/flight vignette, and layered scroll/hover motion.
- Personalized itinerary studio with local fallback, live OpenAI adapter, expand/copy/save actions.
- CSP/security headers, request validation/size limits, per-process rate limiting, private local preview lead storage, and integration readiness reporting.

## Production boundaries

This is a custom-trip agency site, not an airline ticketing/OTA checkout out of the box. AI and Zoho can be activated when you provide server-side configuration. Supplier access requires TBO partner credentials and production certification; flight workflows require the partner's current air spec. Payment routes intentionally remain closed until a persistent booking adapter and all supplier/payment gates are configured. No real inventory, quotes, bookings, payment, or adviser delivery are claimed by the local preview.

For deployment, also use HTTPS, configure provider data-retention/consent terms, secure the database and webhook endpoint, use shared rate limiting behind the reverse proxy, and add monitoring/backups/alerting. The development JSONL lead file is not a production CRM or database.
